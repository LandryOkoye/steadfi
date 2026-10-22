// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IInterestRateModel} from "./interfaces/IInterestRateModel.sol";
import {RayMath} from "./libraries/RayMath.sol";

/// @title InterestRateModel
/// @notice Two-slope (kinked) interest rate model.
///
///         Below the kink:
///           borrowRate = baseRate + utilization * slope1 / kink
///         Above the kink:
///           borrowRate = baseRate + slope1 + (utilization - kink) * slope2 / (RAY - kink)
///
///         supplyRate = borrowRate * utilization * (1 - reserveFactor)
///
///         All rates are ANNUAL in Ray (1e27). The LendingPool converts to per-second
///         before compounding: ratePerSecond = annualRate / SECONDS_PER_YEAR.
///
///         Arc note: gas is USDC so keepers can call accrueInterest() cheaply.
///         We use per-second compounding (not per-block) because Arc has sub-second
///         finality and no reorgs — timestamps are reliable.
contract InterestRateModel is IInterestRateModel {
    using RayMath for uint256;

    uint256 public constant RAY = RayMath.RAY;
    uint256 public constant SECONDS_PER_YEAR = 365 days;
    /// @dev Reserve factor precision: 1e4 = 100.00%
    uint256 public constant PCT_PRECISION = 1e4;

    // -------------------------------------------------------------------------
    // Immutable parameters (set at construction, one model per asset)
    // -------------------------------------------------------------------------

    /// @notice Base borrow rate per year in Ray (e.g. 0 for 0%).
    uint256 public immutable baseRatePerYear;
    /// @notice Slope 1 — rate added per unit utilization up to kink, per year in Ray.
    uint256 public immutable slope1PerYear;
    /// @notice Slope 2 — rate above kink, per year in Ray.
    uint256 public immutable slope2PerYear;
    /// @notice Kink utilization in Ray (e.g. 0.9e27 for 90%).
    uint256 public immutable kink;

    // -------------------------------------------------------------------------
    // Events
    // -------------------------------------------------------------------------

    event RateModelDeployed(
        uint256 baseRatePerYear,
        uint256 slope1PerYear,
        uint256 slope2PerYear,
        uint256 kink
    );

    // -------------------------------------------------------------------------
    // Constructor
    // -------------------------------------------------------------------------

    /// @param _baseRatePerYear Annual base borrow rate in Ray.
    /// @param _slope1PerYear   Annual slope 1 in Ray.
    /// @param _slope2PerYear   Annual slope 2 in Ray.
    /// @param _kink            Kink utilization in Ray.
    constructor(
        uint256 _baseRatePerYear,
        uint256 _slope1PerYear,
        uint256 _slope2PerYear,
        uint256 _kink
    ) {
        require(_kink > 0 && _kink < RAY, "IRM: kink out of range");
        baseRatePerYear = _baseRatePerYear;
        slope1PerYear = _slope1PerYear;
        slope2PerYear = _slope2PerYear;
        kink = _kink;
        emit RateModelDeployed(_baseRatePerYear, _slope1PerYear, _slope2PerYear, _kink);
    }

    // -------------------------------------------------------------------------
    // IInterestRateModel
    // -------------------------------------------------------------------------

    /// @inheritdoc IInterestRateModel
    function getUtilization(uint256 totalSupplyRay, uint256 totalDebtRay)
        public
        pure
        override
        returns (uint256 utilizationRay)
    {
        if (totalSupplyRay == 0) return 0;
        if (totalDebtRay >= totalSupplyRay) return RAY; // capped at 100%
        utilizationRay = totalDebtRay.divRayDown(totalSupplyRay);
    }

    /// @inheritdoc IInterestRateModel
    function getBorrowRatePerSecond(uint256 totalSupplyRay, uint256 totalDebtRay)
        external
        view
        override
        returns (uint256 ratePerSecond)
    {
        uint256 annualRate = _getBorrowRatePerYear(
            getUtilization(totalSupplyRay, totalDebtRay)
        );
        ratePerSecond = annualRate / SECONDS_PER_YEAR;
    }

    /// @inheritdoc IInterestRateModel
    function getSupplyRatePerSecond(
        uint256 totalSupplyRay,
        uint256 totalDebtRay,
        uint256 reserveFactor
    ) external view override returns (uint256 ratePerSecond) {
        require(reserveFactor < PCT_PRECISION, "IRM: reserveFactor >= 100%");
        uint256 util = getUtilization(totalSupplyRay, totalDebtRay);
        uint256 borrowRatePerYear = _getBorrowRatePerYear(util);
        // supplyRate = borrowRate * utilization * (1 - reserveFactor)
        uint256 supplyRatePerYear = borrowRatePerYear
            .mulRayDown(util)
            .mulRayDown((PCT_PRECISION - reserveFactor) * RAY / PCT_PRECISION);
        ratePerSecond = supplyRatePerYear / SECONDS_PER_YEAR;
    }

    // -------------------------------------------------------------------------
    // View helpers
    // -------------------------------------------------------------------------

    /// @notice Annual borrow rate at a given utilization (for UI display).
    function getBorrowRatePerYear(uint256 utilizationRay)
        external
        view
        returns (uint256)
    {
        return _getBorrowRatePerYear(utilizationRay);
    }

    // -------------------------------------------------------------------------
    // Internal
    // -------------------------------------------------------------------------

    function _getBorrowRatePerYear(uint256 utilizationRay)
        internal
        view
        returns (uint256)
    {
        if (utilizationRay <= kink) {
            // Linear below kink: baseRate + utilization/kink * slope1
            return baseRatePerYear + utilizationRay.mulRayDown(slope1PerYear).divRayDown(kink);
        } else {
            // Jump above kink: baseRate + slope1 + (util-kink)/(1-kink) * slope2
            uint256 excess = utilizationRay - kink;
            uint256 range = RAY - kink;
            return baseRatePerYear
                + slope1PerYear
                + excess.mulRayDown(slope2PerYear).divRayDown(range);
        }
    }
}
