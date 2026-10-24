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
        uint16  ltv;             // Loan-to-value in 1e4 (8500 = 85%). 0 for non-collateral.
        uint16  liqThreshold;    // Liquidation threshold in 1e4. 0 for non-collateral.
        uint16  liqBonus;        // Liquidation bonus in 1e4 (500 = 5%)
        uint16  reserveFactor;   // Reserve factor in 1e4 (1000 = 10%)
        uint16  closeFactor;     // Max fraction of debt per liquidation in 1e4
        uint256 supplyCap;       // Max total supply in token native decimals
        uint256 borrowCap;       // Max total borrow in token native decimals (0 = no borrow)
        bool    borrowEnabled;   // False for collateral-only assets
        bool    collateralEnabled; // True for cirBTC/WETH; false for USDC/EURC (lend-and-borrow only)
        bool    active;          // Market is live
        bool    paused;          // Emergency pause (per-asset)
    }

    struct MarketState {
        uint256 supplyIndex;           // Cumulative supply interest index (Ray)
        uint256 borrowIndex;           // Cumulative borrow interest index (Ray)
        uint256 totalSupplyShares;     // Total sToken shares (Ray normalized)
        uint256 totalDebtShares;        // Total debt shares (Ray normalized)
        uint256 lastAccrualTimestamp;  // Last time interest was accrued
        uint256 reservesRay;           // Protocol reserve accrued (Ray)
    }

    /// @dev Fixed-term loan metadata for a (user, asset) borrow position.
    ///      Set by borrowWithTerm; cleared when the debt is fully repaid or liquidated.
    struct LoanTerm {
        uint40 borrowedAt;    // Timestamp of the latest borrowWithTerm call
        uint16 durationDays;  // Chosen term length in days (7/14/30/60/90/180)
    }

    // -------------------------------------------------------------------------
    // Events
    // -------------------------------------------------------------------------

    event MarketAdded(address indexed asset, MarketConfig config);
    event Supply(address indexed user, address indexed asset, uint256 amount, uint256 shares);
    event Withdraw(address indexed user, address indexed asset, uint256 amount, uint256 shares);
    event Borrow(address indexed user, address indexed asset, uint256 amount, uint256 debtShares);
    event Repay(address indexed user, address indexed asset, uint256 amount, uint256 debtShares, bytes memo);
    event LoanTermSet(address indexed user, address indexed asset, uint256 amount, uint16 durationDays, uint40 dueTimestamp);
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
    event DelegateSet(address indexed user, address indexed delegate, bool approved);
    event BorrowFeeUpdated(address indexed asset, uint16 feeBps);
    event BorrowFeeCharged(address indexed user, address indexed asset, uint256 fee);

    // -------------------------------------------------------------------------
    // Core actions
    // -------------------------------------------------------------------------

    function supply(address asset, uint256 amount) external;
    /// @notice Supply on behalf of another address (used by BatchRouter).
    ///         Caller must have pulled the tokens first. sTokens minted to `onBehalfOf`.
    function supplyOnBehalfOf(address asset, uint256 amount, address onBehalfOf) external;
    function withdraw(address asset, uint256 amount) external;
    function borrow(address asset, uint256 amount) external;
    /// @notice Borrow with a fixed term (7/14/30/60/90/180 days). Records loan
    ///         maturity metadata on-chain; repayment is still permitted any time
    ///         before or after the due date. Overwrites any previous term.
    function borrowWithTerm(address asset, uint256 amount, uint16 durationDays) external;
    /// @notice Borrow on behalf of another address (used by BatchRouter).
    ///         Health factor checked against `onBehalfOf`'s collateral. Funds sent to caller.
    function borrowOnBehalfOf(address asset, uint256 amount, address onBehalfOf) external;
    function repay(address asset, uint256 amount, bytes calldata memo) external;
    /// @notice Repay debt of `onBehalfOf` (used by BatchRouter). Caller provides the funds.
    function repayOnBehalfOf(address asset, uint256 amount, address onBehalfOf, bytes calldata memo) external;
    /// @notice Withdraw `onBehalfOf`'s supply (used by BatchRouter). Caller must be
    ///         `onBehalfOf` or an approved delegate. Funds sent to caller.
    function withdrawOnBehalfOf(address asset, uint256 amount, address onBehalfOf) external;
    /// @notice Approve or revoke `delegate` to borrow/withdraw on the caller's behalf.
    function setDelegate(address delegate, bool approved) external;
    function isDelegate(address user, address delegate) external view returns (bool);
    /// @notice False when moving `user`'s collateral would leave debt above LTV borrow power.
    function isPositionSound(address user) external view returns (bool);

    /// @notice One-time origination fee (bps) added to debt on every borrow of `asset`.
    function borrowFeeBps(address asset) external view returns (uint16);
    /// @notice Fee (native decimals) charged on top of borrowing `amount` of `asset`.
    function previewBorrowFee(address asset, uint256 amount) external view returns (uint256);
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
    /// @notice Whether `durationDays` is one of the allowed terms (7/14/30/60/90/180).
    function isValidDuration(uint16 durationDays) external view returns (bool);
    /// @notice Term metadata for `user`'s debt in `asset`.
    ///         dueTimestamp == 0 means no active term (open-ended or no debt).
    function getLoanTerm(address user, address asset)
        external
        view
        returns (uint40 borrowedAt, uint16 durationDays, uint40 dueTimestamp);
    /// @notice True when a term exists and its due date has passed.
    function isLoanOverdue(address user, address asset) external view returns (bool);

    /// @notice Replace the oracle used by a market (RISK_ADMIN only).
    function setOracle(address asset, address oracle) external;
    function getMarketState(address asset) external view returns (MarketState memory);
    function getUserDebt(address user, address asset) external view returns (uint256);
    function getUserSupply(address user, address asset) external view returns (uint256);
    function getUtilization(address asset) external view returns (uint256);
    function getBorrowPower(address user) external view returns (uint256);
    function getTotalDebt(address user) external view returns (uint256);
    function getMarketTotals(address asset) external view returns (uint256 totalSupply, uint256 totalDebt);
    function getMarketRates(address asset)
        external
        view
        returns (uint256 borrowRatePerSecond, uint256 supplyRatePerSecond);
}
