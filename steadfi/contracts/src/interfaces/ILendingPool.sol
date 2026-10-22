// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @title ILendingPool
/// @notice External interface for SteadFi LendingPool.
interface ILendingPool {
    // -------------------------------------------------------------------------
    // Structs
    // -------------------------------------------------------------------------

    struct MarketConfig {
        address sToken;          // Supply receipt token
        address debtToken;       // Debt tracking token
        address interestModel;   // IInterestRateModel implementation
        address oracle;          // IPriceOracle implementation
        uint8   decimals;        // Token decimals (6 USDC, 8 cirBTC, 18 WETH)
        uint16  ltv;             // Loan-to-value in 1e4 (8500 = 85%)
        uint16  liqThreshold;    // Liquidation threshold in 1e4
        uint16  liqBonus;        // Liquidation bonus in 1e4 (500 = 5%)
        uint16  reserveFactor;   // Reserve factor in 1e4 (1000 = 10%)
        uint16  closeFactor;     // Max fraction of debt per liquidation in 1e4
        uint256 supplyCap;       // Max total supply in token native decimals
        uint256 borrowCap;       // Max total borrow in token native decimals (0 = no borrow)
        bool    borrowEnabled;   // False for collateral-only assets
        bool    active;          // Market is live
        bool    paused;          // Emergency pause (per-asset)
    }

    struct MarketState {
        uint256 supplyIndex;           // Cumulative supply interest index (Ray)
        uint256 borrowIndex;           // Cumulative borrow interest index (Ray)
        uint256 totalSupplyShares;     // Total sToken shares (Ray normalized)
        uint256 totalDebtShares;       // Total debt shares (Ray normalized)
        uint256 lastAccrualTimestamp;  // Last time interest was accrued
        uint256 reservesRay;           // Protocol reserve accrued (Ray)
    }

    // -------------------------------------------------------------------------
    // Events
    // -------------------------------------------------------------------------

    event MarketAdded(address indexed asset, MarketConfig config);
    event Supply(address indexed user, address indexed asset, uint256 amount, uint256 shares);
    event Withdraw(address indexed user, address indexed asset, uint256 amount, uint256 shares);
    event Borrow(address indexed user, address indexed asset, uint256 amount, uint256 debtShares);
    event Repay(address indexed user, address indexed asset, uint256 amount, uint256 debtShares, bytes memo);
    event Liquidate(
        address indexed liquidator,
        address indexed borrower,
        address indexed debtAsset,
        address collateralAsset,
        uint256 debtRepaid,
        uint256 collateralSeized
    );
    event PendingCollateralClaimed(address indexed liquidator, address indexed asset, uint256 amount);
    event InterestAccrued(address indexed asset, uint256 supplyIndex, uint256 borrowIndex, uint256 timestamp);
    event MarketPaused(address indexed asset, bool paused);
    event OracleUpdated(address indexed asset, address newOracle);
    event RiskParamsUpdated(address indexed asset);
    event ReservesWithdrawn(address indexed asset, address indexed to, uint256 amount);

    // -------------------------------------------------------------------------
    // Core actions
    // -------------------------------------------------------------------------

    function supply(address asset, uint256 amount) external;
    /// @notice Supply on behalf of another address (used by BatchRouter).
    ///         Caller must have pulled the tokens first. sTokens minted to `onBehalfOf`.
    function supplyOnBehalfOf(address asset, uint256 amount, address onBehalfOf) external;
    function withdraw(address asset, uint256 amount) external;
    function borrow(address asset, uint256 amount) external;
    /// @notice Borrow on behalf of another address (used by BatchRouter).
    ///         Health factor checked against `onBehalfOf`'s collateral. Funds sent to caller.
    function borrowOnBehalfOf(address asset, uint256 amount, address onBehalfOf) external;
    function repay(address asset, uint256 amount, bytes calldata memo) external;
    /// @notice Repay debt of `onBehalfOf` (used by BatchRouter). Caller provides the funds.
    function repayOnBehalfOf(address asset, uint256 amount, address onBehalfOf, bytes calldata memo) external;
    function withdrawOnBehalfOf(address asset, uint256 amount, address onBehalfOf) external;
    function liquidate(
        address borrower,
        address debtAsset,
        address collateralAsset,
        uint256 debtAmount
    ) external;
    function claimPendingCollateral(address asset) external;
    function accrueInterest(address asset) external;

    // -------------------------------------------------------------------------
    // View
    // -------------------------------------------------------------------------

    function getHealthFactor(address user) external view returns (uint256 hf, bool isHealthy);
    function getSupplyIndex(address asset) external view returns (uint256);
    function getBorrowIndex(address asset) external view returns (uint256);
    function getMarketConfig(address asset) external view returns (MarketConfig memory);
    function getMarketState(address asset) external view returns (MarketState memory);
    function getUserDebt(address user, address asset) external view returns (uint256);
    function getUserSupply(address user, address asset) external view returns (uint256);
    function getUtilization(address asset) external view returns (uint256);
}
