// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IPriceOracle} from "./interfaces/IPriceOracle.sol";

/// @title MockPriceOracle
/// @notice Admin-settable price oracle for Arc Testnet Phase 1.
///         Interface matches AggregatorV3Interface style so it can be hot-swapped
///         for a live Chainlink feed via LendingPool.setOracle(asset, addr).
///         USDC is permanently hardcoded at $1.00 — never accepts an admin override.
///         Emits PriceSet on every update so the indexer can track price history.
contract MockPriceOracle is IPriceOracle {
    address public immutable admin;

    /// @dev Prices stored as USD with 18 decimal precision.
    mapping(address => uint256) private _prices;
    mapping(address => bool) private _paused;

    /// @notice Arc ERC-20 USDC address — always returns $1.00, cannot be overridden.
    address public constant USDC = 0x3600000000000000000000000000000000000000;
    uint256 public constant USDC_PRICE = 1e18; // $1.00 in 18 dec

    event PriceSet(address indexed asset, uint256 priceUsd18);
    event OraclePaused(address indexed asset, bool paused);

    modifier onlyAdmin() {
        require(msg.sender == admin, "MockOracle: not admin");
        _;
    }

    constructor(address _admin) {
        require(_admin != address(0), "MockOracle: zero admin");
        admin = _admin;
    }

    // -------------------------------------------------------------------------
    // Admin
    // -------------------------------------------------------------------------

    /// @notice Set the USD price for an asset (18 decimal precision).
    ///         Cannot be called for USDC — that is permanently $1.00.
    function setPrice(address asset, uint256 priceUsd18) external onlyAdmin {
        require(asset != USDC, "MockOracle: USDC price is hardcoded");
        require(priceUsd18 > 0, "MockOracle: zero price");
        _prices[asset] = priceUsd18;
        emit PriceSet(asset, priceUsd18);
    }

    /// @notice Pause or unpause a specific asset oracle (simulates circuit breaker).
    function setOraclePaused(address asset, bool paused) external onlyAdmin {
        require(asset != USDC, "MockOracle: cannot pause USDC");
        _paused[asset] = paused;
        emit OraclePaused(asset, paused);
    }

    // -------------------------------------------------------------------------
    // IPriceOracle
    // -------------------------------------------------------------------------

    /// @inheritdoc IPriceOracle
    function getPrice(address asset) external view override returns (uint256) {
        if (asset == USDC) return USDC_PRICE;
        require(!_paused[asset], "MockOracle: oracle paused for asset");
        uint256 price = _prices[asset];
        require(price > 0, "MockOracle: price not set");
        return price;
    }

    /// @inheritdoc IPriceOracle
    function isHealthy(address asset) external view override returns (bool) {
        if (asset == USDC) return true;
        return !_paused[asset] && _prices[asset] > 0;
    }
}
