// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {RayMath} from "./RayMath.sol";

/// @title HealthFactor
/// @notice Pure library for health factor and collateral value calculations.
///         All inputs and outputs in Ray (1e27) unless otherwise noted.
///         Health factor = (sum of collateral_value_i * liqThreshold_i) / total_debt_value
///         A position is healthy when HF >= 1 Ray (1e27).
library HealthFactor {
    using RayMath for uint256;

    uint256 internal constant RAY = RayMath.RAY;
    /// @notice Precision for LTV/threshold percentages: 1e4 = 100.00%
    uint256 internal constant PCT_PRECISION = 1e4;

    /// @notice Compute USD value of a token amount given its oracle price.
    /// @param amountRay      Token amount in Ray precision.
    /// @param priceUsd18     Oracle price in USD with 18 decimal precision.
    /// @return valueRay      USD value in Ray precision.
    function usdValue(uint256 amountRay, uint256 priceUsd18)
        internal
        pure
        returns (uint256 valueRay)
    {
        // amountRay (27 dec) * priceUsd18 (18 dec) / 1e18 = valueRay (27 dec)
        valueRay = (amountRay * priceUsd18) / 1e18;
    }

    /// @notice Apply a percentage to a value.
    /// @param valueRay   Value in Ray.
    /// @param pct        Percentage in PCT_PRECISION units (e.g. 8500 = 85.00%).
    function applyPct(uint256 valueRay, uint256 pct)
        internal
        pure
        returns (uint256)
    {
        return (valueRay * pct) / PCT_PRECISION;
    }

    /// @notice Compute health factor.
    /// @param weightedCollateralRay  Sum of (collateral USD value * liquidation threshold).
    /// @param totalDebtRay           Total debt USD value in Ray.
    /// @return hf Health factor in Ray. Returns type(uint256).max when debt == 0.
    function compute(uint256 weightedCollateralRay, uint256 totalDebtRay)
        internal
        pure
        returns (uint256 hf)
    {
        if (totalDebtRay == 0) return type(uint256).max;
        hf = weightedCollateralRay.divRayDown(totalDebtRay);
    }

    /// @notice Returns true when the position can be liquidated (HF < 1 Ray).
    function isLiquidatable(uint256 hf) internal pure returns (bool) {
        return hf < RAY;
    }
}
