// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @title IPriceOracle
/// @notice Interface for the SteadFi price oracle adapter.
/// @dev All prices are returned as USD values scaled to 1e18 (18 decimals).
///      The oracle adapter wraps Chainlink AggregatorV3Interface and adds
///      staleness checks, deviation guards, and a circuit-breaker pause.
interface IPriceOracle {
    /// @notice Returns the USD price of `asset`, scaled to 1e18.
    /// @dev    VIEW-only: reads the last committed price from storage.
    ///         For Chainlink: call updatePrice() (keeper path) before relying on this for
    ///         freshness. For MockPriceOracle: always current. LendingPool calls this via
    ///         staticcall so all implementations MUST be view-compatible (no state writes).
    /// @param asset The ERC-20 token address.
    /// @return price USD price with 18 decimal precision.
    function getPrice(address asset) external view returns (uint256 price);

    /// @notice Returns true if the oracle for `asset` is healthy (not stale, not paused).
    function isHealthy(address asset) external view returns (bool);
}
