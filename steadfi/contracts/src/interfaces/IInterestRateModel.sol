// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @title IInterestRateModel
/// @notice Interface for SteadFi's per-asset kinked interest rate model.
interface IInterestRateModel {
    /// @notice Returns the per-second borrow rate in Ray (1e27).
    /// @param totalSupplyRay  Total supplied liquidity in Ray.
    /// @param totalDebtRay    Total outstanding debt in Ray.
    function getBorrowRatePerSecond(uint256 totalSupplyRay, uint256 totalDebtRay)
        external
        view
        returns (uint256 ratePerSecond);

    /// @notice Returns the per-second supply rate in Ray.
    /// @param totalSupplyRay  Total supplied liquidity in Ray.
    /// @param totalDebtRay    Total outstanding debt in Ray.
    /// @param reserveFactor   Reserve factor in 1e4 precision (e.g. 1000 = 10%).
    function getSupplyRatePerSecond(
        uint256 totalSupplyRay,
        uint256 totalDebtRay,
        uint256 reserveFactor
    ) external view returns (uint256 ratePerSecond);

    /// @notice Current utilization ratio in Ray (totalDebt / totalSupply).
    function getUtilization(uint256 totalSupplyRay, uint256 totalDebtRay)
        external
        pure
        returns (uint256 utilizationRay);
}
