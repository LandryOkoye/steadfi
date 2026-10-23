// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @title IPyth
/// @notice Minimal Pyth Network interface used by SteadFi's oracle adapter.
///         Keeping the struct and selectors in a real interface prevents the
///         hand-rolled selector drift that broke the first deployment.
interface IPyth {
    struct Price {
        int64 price;
        uint64 conf;
        int32 expo;
        uint256 publishTime;
    }

    /// @notice Latest price, reverting with StalePrice if older than `age` seconds.
    function getPriceNoOlderThan(bytes32 id, uint256 age)
        external
        view
        returns (Price memory price);

    /// @notice Latest price without a staleness check.
    function getPriceUnsafe(bytes32 id) external view returns (Price memory price);

    /// @notice Fee required to submit `updateData`.
    function getUpdateFee(bytes[] calldata updateData) external view returns (uint256 fee);

    /// @notice Push signed Pyth price updates on-chain.
    function updatePriceFeeds(bytes[] calldata updateData) external payable;
}
