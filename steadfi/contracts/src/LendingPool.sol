// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ILendingPool} from "./interfaces/ILendingPool.sol";
import {IInterestRateModel} from "./interfaces/IInterestRateModel.sol";
import {IPriceOracle} from "./interfaces/IPriceOracle.sol";
import {IMemo} from "./interfaces/IMemo.sol";
import {sToken} from "./sToken.sol";
import {DebtToken} from "./DebtToken.sol";
import {SteadFiAccessControl} from "./SteadFiAccessControl.sol";
import {RayMath} from "./libraries/RayMath.sol";
import {DecimalNormalizer} from "./libraries/DecimalNormalizer.sol";
import {HealthFactor} from "./libraries/HealthFactor.sol";

/// @title LendingPool
/// @notice Core SteadFi lending and borrowing contract.
///
///         Arc-specific design rules enforced throughout:
///         1. All USDC accounting uses the ERC-20 interface at 0x3600... (6 decimals).
///            address.balance and msg.value are never read for protocol accounting.
///         2. Any native USDC sent by mistake (msg.value > 0) is immediately refunded.
///         3. Internal math uses Ray (1e27) via RayMath and DecimalNormalizer.
///         4. Blocklist resilience: pull-based withdrawals + pendingCollateral claim pattern.
///         5. No "waiting for confirmations": Arc finality is deterministic and sub-second.
///         6. Memo support: repay() accepts an optional bytes memo and calls Arc's Memo
///            contract so the reference appears on-chain and in the indexer.
contract LendingPool is ILendingPool, SteadFiAccessControl {
    using RayMath for uint256;

    // -------------------------------------------------------------------------
    // Constants
    // -------------------------------------------------------------------------

    uint256 public constant RAY           = RayMath.RAY;
    uint256 public constant PCT_PRECISION = 1e4;

    /// @notice Arc ERC-20 USDC address (same on testnet and mainnet).
    address public constant USDC = 0x3600000000000000000000000000000000000000;

    /// @notice Arc Memo contract (same on both networks).
    address public constant MEMO_CONTRACT = 0x5294E9927c3306DcBaDb03fe70b92e01cCede505;

    // -------------------------------------------------------------------------
    // State
    // -------------------------------------------------------------------------

    address[] public marketList;
    mapping(address => MarketConfig) private _configs;
    mapping(address => MarketState)  private _states;

    /// @dev user => asset => active fixed-term metadata (set by borrowWithTerm)
    mapping(address => mapping(address => LoanTerm)) private _loanTerms;

    /// @dev user => asset => pending collateral to claim (blocklist protection)
    mapping(address => mapping(address => uint256)) public pendingCollateral;

    // -------------------------------------------------------------------------
    // Reentrancy guard
    // -------------------------------------------------------------------------

    uint256 private _locked = 1;
    modifier nonReentrant() {
        require(_locked == 1, "LendingPool: reentrant call");
        _locked = 2;
        _;
        _locked = 1;
    }

    // -------------------------------------------------------------------------
    // Constructor
    // -------------------------------------------------------------------------

    constructor(address owner) SteadFiAccessControl(owner) {
        // USDC is hardcoded to $1. No oracle needed.
    }

    // -------------------------------------------------------------------------
    // Admin: add / configure markets
    // -------------------------------------------------------------------------

    /// @notice Add a new asset market. Only OWNER. One call per asset.
    function addMarket(address asset, MarketConfig calldata config) external onlyOwner {
        require(asset != address(0), "LP: zero asset");
        require(!_configs[asset].active, "LP: market exists");
        require(config.sToken    != address(0), "LP: zero sToken");
        require(config.debtToken != address(0), "LP: zero debtToken");
        // For collateral-enabled assets: ltv must be < liqThreshold (both non-zero).
        // For non-collateral assets (USDC/EURC): both ltv and liqThreshold may be 0.
        if (config.collateralEnabled) {
            require(config.ltv > 0 && config.liqThreshold > 0, "LP: collateral needs non-zero ltv/liqThreshold");
            require(config.ltv < config.liqThreshold, "LP: LTV >= liqThreshold");
            require(config.liqThreshold < PCT_PRECISION, "LP: liqThreshold >= 100%");
        } else {
            require(config.ltv == 0 && config.liqThreshold == 0, "LP: non-collateral must have ltv=liqThreshold=0");
        }
        require(config.reserveFactor < PCT_PRECISION, "LP: reserveFactor >= 100%");
        require(config.closeFactor > 0 && config.closeFactor <= PCT_PRECISION, "LP: bad closeFactor");
        // Fix (audit: call-to-non-existent-address): verify dependencies are real contracts
        require(asset.code.length > 0,               "LP: asset is not a contract");
        require(config.sToken.code.length > 0,       "LP: sToken is not a contract");
        require(config.debtToken.code.length > 0,    "LP: debtToken is not a contract");
        require(config.interestModel.code.length > 0,"LP: interestModel is not a contract");
        require(config.oracle.code.length > 0,       "LP: oracle is not a contract");

        MarketConfig memory cfg = config;
        cfg.active = true;
        cfg.paused = false;
        _configs[asset] = cfg;

        MarketState storage state = _states[asset];
        state.supplyIndex          = RAY;
        state.borrowIndex          = RAY;
        state.lastAccrualTimestamp = block.timestamp;

        marketList.push(asset);
        emit MarketAdded(asset, cfg);
    }

    /// @notice Update risk parameters. Only RISK_ADMIN (via Timelock on mainnet).
    function setRiskParams(
        address asset,
        uint16 ltv,
        uint16 liqThreshold,
        uint16 liqBonus,
        uint16 reserveFactor,
        uint16 closeFactor,
        uint256 supplyCap,
        uint256 borrowCap
    ) external onlyRiskAdmin {
        _requireActiveMarket(asset);
        MarketConfig storage existing = _configs[asset];
        if (existing.collateralEnabled) {
            require(ltv > 0 && liqThreshold > 0, "LP: collateral needs non-zero ltv/liqThreshold");
            require(ltv < liqThreshold, "LP: LTV >= liqThreshold");
            require(liqThreshold < PCT_PRECISION, "LP: liqThreshold >= 100%");
        } else {
            require(ltv == 0 && liqThreshold == 0, "LP: non-collateral must have ltv=liqThreshold=0");
        }
        require(reserveFactor < PCT_PRECISION, "LP: reserveFactor >= 100%");
        accrueInterest(asset);
        MarketConfig storage cfg = _configs[asset];
        cfg.ltv           = ltv;
        cfg.liqThreshold  = liqThreshold;
        cfg.liqBonus      = liqBonus;
        cfg.reserveFactor = reserveFactor;
        cfg.closeFactor   = closeFactor;
        cfg.supplyCap     = supplyCap;
        cfg.borrowCap     = borrowCap;
        emit RiskParamsUpdated(asset);
    }

    /// @notice Hot-swap oracle for an asset. RISK_ADMIN.
    function setOracle(address asset, address oracle) external onlyRiskAdmin {
        _requireActiveMarket(asset);
        _configs[asset].oracle = oracle;
        emit OracleUpdated(asset, oracle);
    }

    /// @notice Pause or unpause a market. PAUSE_GUARDIAN.
    function setMarketPaused(address asset, bool paused) external onlyPauseGuardian {
        _requireActiveMarket(asset);
        _configs[asset].paused = paused;
        emit MarketPaused(asset, paused);
    }

    /// @notice Withdraw protocol reserves to treasury. OWNER.
    function withdrawReserves(address asset, address to, uint256 amountRay)
        external
        onlyOwner
        nonReentrant
    {
        _requireActiveMarket(asset);
        accrueInterest(asset);
        MarketState storage state = _states[asset];
        require(amountRay <= state.reservesRay, "LP: insufficient reserves");
        state.reservesRay -= amountRay;
        uint256 amount = DecimalNormalizer.fromRay(amountRay, _configs[asset].decimals, false);
        _safeTransferOut(asset, to, amount);
        emit ReservesWithdrawn(asset, to, amount);
    }

    // -------------------------------------------------------------------------
    // Interest accrual
    // -------------------------------------------------------------------------

    /// @notice Accrue interest for an asset. Callable by anyone (keeper, user).
    function accrueInterest(address asset) public override {
        MarketConfig storage cfg   = _configs[asset];
        MarketState  storage state = _states[asset];
        if (!cfg.active) return;

        uint256 elapsed = block.timestamp - state.lastAccrualTimestamp;
        if (elapsed == 0) return;

        // Compute current supply and debt totals in Ray
        uint256 totalSupplyRay = state.totalSupplyShares.mulRayDown(state.supplyIndex);
        uint256 totalDebtRay   = state.totalDebtShares.mulRayUp(state.borrowIndex);

        if (totalDebtRay == 0) {
            state.lastAccrualTimestamp = block.timestamp;
            return;
        }

        // Fetch rates (per second in Ray)
        uint256 borrowRatePerSec = IInterestRateModel(cfg.interestModel)
            .getBorrowRatePerSecond(totalSupplyRay, totalDebtRay);
        uint256 supplyRatePerSec = IInterestRateModel(cfg.interestModel)
            .getSupplyRatePerSecond(totalSupplyRay, totalDebtRay, cfg.reserveFactor);

        // Compound: newIndex = oldIndex * (1 + ratePerSec)^elapsed
        // For small elapsed values use linear approximation to save gas:
        // newIndex = oldIndex * (1 + ratePerSec * elapsed)
        // For large elapsed (>1 day) use RayMath.rayPow for accuracy.
        uint256 borrowFactor;
        uint256 supplyFactor;
        if (elapsed <= 1 days) {
            borrowFactor = RAY + borrowRatePerSec * elapsed;
            supplyFactor = RAY + supplyRatePerSec * elapsed;
        } else {
            borrowFactor = RayMath.rayPow(RAY + borrowRatePerSec, elapsed);
            supplyFactor = RayMath.rayPow(RAY + supplyRatePerSec, elapsed);
        }

        uint256 newBorrowIndex = state.borrowIndex.mulRayDown(borrowFactor);
        uint256 newSupplyIndex = state.supplyIndex.mulRayDown(supplyFactor);

        // Accrue reserves: difference between debt growth and supply growth
        uint256 newDebtRay    = state.totalDebtShares.mulRayUp(newBorrowIndex);
        uint256 newSupplyRay  = state.totalSupplyShares.mulRayDown(newSupplyIndex);
        uint256 interestEarned = newDebtRay > totalDebtRay ? newDebtRay - totalDebtRay : 0;
        uint256 supplyGrowth   = newSupplyRay > totalSupplyRay ? newSupplyRay - totalSupplyRay : 0;
        if (interestEarned > supplyGrowth) {
            state.reservesRay += interestEarned - supplyGrowth;
        }

        state.borrowIndex          = newBorrowIndex;
        state.supplyIndex          = newSupplyIndex;
        state.lastAccrualTimestamp = block.timestamp;

        emit InterestAccrued(asset, newSupplyIndex, newBorrowIndex, block.timestamp);
    }

    // -------------------------------------------------------------------------
    // Supply
    // -------------------------------------------------------------------------

    /// @notice Supply `amount` of `asset` to earn interest.
    ///         Mints sTokens to msg.sender. Permit2 approvals handled by the caller.
    function supply(address asset, uint256 amount)
        external
        override
        nonReentrant
    {
        _supply(asset, amount, msg.sender);
    }

    /// @notice Supply on behalf of `onBehalfOf`. Used by BatchRouter.
    ///         Caller has already pulled the tokens; sTokens minted to onBehalfOf.
    function supplyOnBehalfOf(address asset, uint256 amount, address onBehalfOf)
        external
        override
        nonReentrant
    {
        require(onBehalfOf != address(0), "LP: zero onBehalfOf");
        _supply(asset, amount, onBehalfOf);
    }

    function _supply(address asset, uint256 amount, address recipient) internal {
        _requireNotPaused(asset);
        require(amount > 0, "LP: zero amount");

        accrueInterest(asset);
        MarketConfig storage cfg   = _configs[asset];
        MarketState  storage state = _states[asset];

        // Supply cap check (in native decimals)
        uint256 totalSupply_ = DecimalNormalizer.fromRay(
            state.totalSupplyShares.mulRayDown(state.supplyIndex), cfg.decimals, false
        );
        require(totalSupply_ + amount <= cfg.supplyCap, "LP: supply cap reached");

        // Pull tokens from caller (msg.sender holds the tokens)
        _safeTransferIn(asset, msg.sender, amount);

        // Mint sTokens to recipient (may differ from msg.sender in OnBehalfOf case)
        uint256 amountRay = DecimalNormalizer.toRay(amount, cfg.decimals, false);
        uint256 mintedShares = amountRay.divRayDown(state.supplyIndex);
        sToken(cfg.sToken).mint(recipient, amountRay, state.supplyIndex);
        state.totalSupplyShares += mintedShares;

        emit Supply(recipient, asset, amount, mintedShares);
    }

    // -------------------------------------------------------------------------
    // Withdraw
    // -------------------------------------------------------------------------

    /// @notice Withdraw `amount` of `asset`. Burns sTokens. Pull-based: never pushes.
    function withdraw(address asset, uint256 amount)
        external
        override
        nonReentrant
    {
        _withdraw(asset, amount, msg.sender, msg.sender);
    }

    /// @notice Withdraw on behalf of `onBehalfOf`. Burns their sTokens; sends to caller.
    ///         Used by BatchRouter — caller must have sToken allowance from onBehalfOf.
    function withdrawOnBehalfOf(address asset, uint256 amount, address onBehalfOf)
        external
        override
        nonReentrant
    {
        require(onBehalfOf != address(0), "LP: zero onBehalfOf");
        _withdraw(asset, amount, onBehalfOf, msg.sender);
    }

    function _withdraw(address asset, uint256 amount, address owner, address recipient) internal {
        _requireNotPaused(asset);
        require(amount > 0, "LP: zero amount");

        accrueInterest(asset);
        MarketConfig storage cfg   = _configs[asset];
        MarketState  storage state = _states[asset];

        uint256 amountRay     = DecimalNormalizer.toRay(amount, cfg.decimals, false);
        uint256 burnedShares  = sToken(cfg.sToken).burn(owner, amountRay, state.supplyIndex);
        state.totalSupplyShares -= burnedShares;

        // LTV borrow-power check: withdrawing collateral must not leave debt above
        // the remaining collateral's LTV. This is stricter than (and separate from)
        // the liquidation-threshold health factor checked below.
        uint256 remainingDebt = _totalDebtOf(owner);
        if (remainingDebt > 0) {
            require(remainingDebt <= _borrowPower(owner), "LP: exceeds borrow power (LTV)");
        }

        // Liquidity check: ensure pool has enough cash
        uint256 totalDebtRay = state.totalDebtShares.mulRayUp(state.borrowIndex);
        uint256 totalSupRay  = state.totalSupplyShares.mulRayDown(state.supplyIndex);
        require(totalDebtRay <= totalSupRay, "LP: insufficient liquidity");

        // Health check: owner must remain healthy after withdrawal
        uint256 hf = _healthFactor(owner);
        require(hf >= RAY || _totalDebtOf(owner) == 0, "LP: would be undercollateralized");

        _safeTransferOut(asset, recipient, amount);
        emit Withdraw(owner, asset, amount, burnedShares);
    }

    // -------------------------------------------------------------------------
    // Borrow
    // -------------------------------------------------------------------------

    /// @notice Borrow `amount` of `asset` against supplied collateral.
    function borrow(address asset, uint256 amount)
        external
        override
        nonReentrant
    {
        _borrow(asset, amount, msg.sender, msg.sender);
    }

    /// @notice Borrow on behalf of `onBehalfOf`. Debt recorded to onBehalfOf;
    ///         funds sent to caller. Health factor checked against onBehalfOf.
    function borrowOnBehalfOf(address asset, uint256 amount, address onBehalfOf)
        external
        override
        nonReentrant
    {
        require(onBehalfOf != address(0), "LP: zero onBehalfOf");
        _borrow(asset, amount, onBehalfOf, msg.sender);
    }

    /// @notice Borrow `amount` of `asset` with a fixed term chosen from the
    ///         predefined durations (7/14/30/60/90/180 days). The term is
    ///         metadata only: repayment is allowed any time, and liquidation
    ///         still depends solely on the health factor. A new borrowWithTerm
    ///         overwrites any previous term; fully repaying the debt clears it.
    function borrowWithTerm(address asset, uint256 amount, uint16 durationDays)
        external
        override
        nonReentrant
    {
        require(isValidDuration(durationDays), "LP: invalid duration");
        _borrow(asset, amount, msg.sender, msg.sender);
        uint40 due = uint40(block.timestamp + uint256(durationDays) * 1 days);
        _loanTerms[msg.sender][asset] = LoanTerm({ borrowedAt: uint40(block.timestamp), durationDays: durationDays });
        emit LoanTermSet(msg.sender, asset, amount, durationDays, due);
    }

    function _borrow(address asset, uint256 amount, address debtor, address recipient) internal {
        _requireNotPaused(asset);
        require(amount > 0, "LP: zero amount");
        require(_configs[asset].borrowEnabled, "LP: borrow disabled for asset");

        accrueInterest(asset);
        MarketConfig storage cfg   = _configs[asset];
        MarketState  storage state = _states[asset];

        // Borrow cap check
        uint256 totalBorrow_ = DecimalNormalizer.fromRay(
            state.totalDebtShares.mulRayUp(state.borrowIndex), cfg.decimals, true
        );
        require(cfg.borrowCap == 0 || totalBorrow_ + amount <= cfg.borrowCap, "LP: borrow cap reached");

        // Liquidity check
        uint256 totalSupRay  = state.totalSupplyShares.mulRayDown(state.supplyIndex);
        uint256 totalDebtRay = state.totalDebtShares.mulRayUp(state.borrowIndex);
        uint256 amountRay    = DecimalNormalizer.toRay(amount, cfg.decimals, true);
        require(amountRay <= totalSupRay - totalDebtRay, "LP: insufficient liquidity");

        // LTV borrow-power pre-check: new total debt must not exceed sum(collateral × LTV).
        // This is a SEPARATE check from the liquidation-threshold health factor.
        // LTV governs how much you can borrow; liqThreshold governs when you get liquidated.
        {
            uint256 borrowPowerRay = _borrowPower(debtor);
            uint256 currentDebtRay = _totalDebtOf(debtor);
            require(currentDebtRay + amountRay <= borrowPowerRay, "LP: exceeds borrow power (LTV)");
        }

        // Mint debt shares to debtor
        uint256 mintedShares = DebtToken(cfg.debtToken).mint(debtor, amountRay, state.borrowIndex);
        state.totalDebtShares += mintedShares;

        // Post-mint health check (uses liqThreshold — confirms position is not immediately liquidatable)
        uint256 hf = _healthFactor(debtor);
        require(hf >= RAY, "LP: undercollateralized after borrow");

        _safeTransferOut(asset, recipient, amount);
        emit Borrow(debtor, asset, amount, mintedShares);
    }

    // -------------------------------------------------------------------------
    // Repay
    // -------------------------------------------------------------------------

    /// @notice Repay `amount` of debt in `asset`.
    ///         `memo` is optional — if non-empty, attaches the reference to the tx
    ///         via Arc's Memo contract so it appears in on-chain history.
    function repay(address asset, uint256 amount, bytes calldata memo)
        external
        override
        nonReentrant
    {
        _repay(asset, amount, msg.sender, msg.sender, memo);
    }

    /// @notice Repay debt of `onBehalfOf`. Caller provides the funds.
    ///         Used by BatchRouter to repay a user's debt from pre-pulled tokens.
    function repayOnBehalfOf(address asset, uint256 amount, address onBehalfOf, bytes calldata memo)
        external
        override
        nonReentrant
    {
        require(onBehalfOf != address(0), "LP: zero onBehalfOf");
        _repay(asset, amount, msg.sender, onBehalfOf, memo);
    }

    function _repay(address asset, uint256 amount, address payer, address debtor, bytes calldata memo) internal {
        _requireActiveMarket(asset);
        require(amount > 0, "LP: zero amount");

        accrueInterest(asset);
        MarketConfig storage cfg   = _configs[asset];
        MarketState  storage state = _states[asset];

        // Cap repayment at outstanding debt of debtor
        uint256 debtShares_     = DebtToken(cfg.debtToken).debtSharesOf(debtor);
        uint256 outstandingRay  = debtShares_.mulRayUp(state.borrowIndex);
        uint256 outstandingAmt  = DecimalNormalizer.fromRay(outstandingRay, cfg.decimals, true);
        if (amount > outstandingAmt) amount = outstandingAmt;

        // Attach memo to this transaction if provided (Arc Memo contract).
        // Only call if the contract is deployed (skips local test environments).
        if (memo.length > 0 && MEMO_CONTRACT.code.length > 0) {
            // Best-effort: ignore if Memo contract call fails (not a protocol invariant)
            try IMemo(MEMO_CONTRACT).memo(address(this), memo) {} catch {}
        }

        uint256 amountRay    = DecimalNormalizer.toRay(amount, cfg.decimals, false);
        _safeTransferIn(asset, payer, amount);

        uint256 burnedShares = DebtToken(cfg.debtToken).burn(debtor, amountRay, state.borrowIndex);
        state.totalDebtShares -= burnedShares;

        // Debt fully cleared — drop any fixed-term metadata for this position.
        if (DebtToken(cfg.debtToken).debtSharesOf(debtor) == 0) {
            if (_loanTerms[debtor][asset].durationDays != 0) delete _loanTerms[debtor][asset];
        }

        emit Repay(debtor, asset, amount, burnedShares, memo);
    }

    // -------------------------------------------------------------------------
    // Liquidate
    // -------------------------------------------------------------------------

    /// @notice Liquidate an undercollateralized position atomically.
    ///         Liquidator sends debtAmount of debtAsset and receives collateralAsset
    ///         plus the liquidation bonus.
    ///         Blocklist resilience: if collateral transfer fails, the amount is
    ///         recorded in pendingCollateral for the liquidator to claim later.
    function liquidate(
        address borrower,
        address debtAsset,
        address collateralAsset,
        uint256 debtAmount
    ) external override nonReentrant {
        require(borrower != msg.sender, "LP: self-liquidation");
        require(debtAmount > 0, "LP: zero debtAmount");

        accrueInterest(debtAsset);
        accrueInterest(collateralAsset);

        // 1. Health check
        require(_healthFactor(borrower) < RAY, "LP: position is healthy");

        // 2–7 delegated to internal to avoid stack-too-deep
        uint256 seizeAmt = _executeLiquidation(borrower, debtAsset, collateralAsset, debtAmount);

        // 7. Transfer collateral to liquidator (blocklist-safe)
        bool transferred = _tryTransferOut(collateralAsset, msg.sender, seizeAmt);
        if (!transferred) {
            pendingCollateral[msg.sender][collateralAsset] += seizeAmt;
        }

        emit Liquidate(msg.sender, borrower, debtAsset, collateralAsset, debtAmount, seizeAmt);
    }

    function _executeLiquidation(
        address borrower,
        address debtAsset,
        address collateralAsset,
        uint256 debtAmount
    ) internal returns (uint256 seizeAmt) {
        MarketConfig storage debtCfg   = _configs[debtAsset];
        MarketConfig storage collCfg   = _configs[collateralAsset];
        MarketState  storage debtState = _states[debtAsset];
        MarketState  storage collState = _states[collateralAsset];

        // 2. Close factor: cap debtAmount
        {
            uint256 outstanding = DecimalNormalizer.fromRay(
                DebtToken(debtCfg.debtToken).debtSharesOf(borrower).mulRayUp(debtState.borrowIndex),
                debtCfg.decimals, true
            );
            uint256 maxRepay = outstanding * debtCfg.closeFactor / PCT_PRECISION;
            if (debtAmount > maxRepay) debtAmount = maxRepay;
        }

        // 3. Liquidator repays debt
        _safeTransferIn(debtAsset, msg.sender, debtAmount);
        uint256 debtAmountRay    = DecimalNormalizer.toRay(debtAmount, debtCfg.decimals, false);
        uint256 burnedDebtShares = DebtToken(debtCfg.debtToken).burn(borrower, debtAmountRay, debtState.borrowIndex);
        debtState.totalDebtShares -= burnedDebtShares;

        // 4. Compute collateral to seize
        uint256 seizeRay = _computeSeizeRay(debtAmountRay, debtAsset, collateralAsset, collCfg.liqBonus);
        seizeAmt = DecimalNormalizer.fromRay(seizeRay, collCfg.decimals, false);

        // 5. Cap seize at borrower's actual balance
        {
            uint256 collBalance = DecimalNormalizer.fromRay(
                sToken(collCfg.sToken).sharesOf(borrower).mulRayDown(collState.supplyIndex),
                collCfg.decimals, false
            );
            if (seizeAmt > collBalance) seizeAmt = collBalance;
            seizeRay = DecimalNormalizer.toRay(seizeAmt, collCfg.decimals, false);
        }

        // 6. Burn sTokens from borrower
        uint256 burnedCollShares = sToken(collCfg.sToken).burn(borrower, seizeRay, collState.supplyIndex);
        collState.totalSupplyShares -= burnedCollShares;

        // 7. Debt fully cleared — drop any fixed-term metadata for this position.
        if (DebtToken(debtCfg.debtToken).debtSharesOf(borrower) == 0) {
            if (_loanTerms[borrower][debtAsset].durationDays != 0) delete _loanTerms[borrower][debtAsset];
        }
    }

    function _computeSeizeRay(
        uint256 debtAmountRay,
        address debtAsset,
        address collateralAsset,
        uint256 liqBonus
    ) internal view returns (uint256 seizeRay) {
        uint256 debtPriceRay = _assetPriceRay(debtAsset);
        uint256 collPriceRay = _assetPriceRay(collateralAsset);
        uint256 debtValueRay = HealthFactor.usdValue(debtAmountRay, debtPriceRay);
        uint256 bonusPct     = PCT_PRECISION + liqBonus;
        // seizeRay = debtValue * (1 + liqBonus) / collPrice
        // collPrice is in 1e18 USD; seizeRay in Ray
        seizeRay = (debtValueRay * bonusPct * 1e18) / (PCT_PRECISION * collPriceRay);
    }

    /// @notice Claim collateral that was set aside during a blocklisted liquidation.
    function claimPendingCollateral(address asset) external override nonReentrant {
        uint256 pending = pendingCollateral[msg.sender][asset];
        require(pending > 0, "LP: no pending collateral");
        pendingCollateral[msg.sender][asset] = 0;
        _safeTransferOut(asset, msg.sender, pending);
        emit PendingCollateralClaimed(msg.sender, asset, pending);
    }

    // -------------------------------------------------------------------------
    // View
    // -------------------------------------------------------------------------

    /// @notice Returns health factor in Ray. type(uint256).max when no debt.
    function getHealthFactor(address user)
        external
        view
        override
        returns (uint256 hf, bool isHealthy)
    {
        hf = _healthFactor(user);
        isHealthy = hf >= RAY;
    }

    function getSupplyIndex(address asset) external view override returns (uint256) {
        return _states[asset].supplyIndex;
    }

    function getBorrowIndex(address asset) external view override returns (uint256) {
        return _states[asset].borrowIndex;
    }

    function getMarketConfig(address asset) external view override returns (MarketConfig memory) {
        return _configs[asset];
    }

    function getMarketState(address asset) external view override returns (MarketState memory) {
        return _states[asset];
    }

    function getUserDebt(address user, address asset) external view override returns (uint256) {
        MarketConfig storage cfg   = _configs[asset];
        MarketState  storage state = _states[asset];
        uint256 dShares = DebtToken(cfg.debtToken).debtSharesOf(user);
        return DecimalNormalizer.fromRay(dShares.mulRayUp(state.borrowIndex), cfg.decimals, true);
    }

    /// @notice Allowed fixed terms in days: 7, 14, 30, 60, 90, 180.
    function isValidDuration(uint16 durationDays) public pure override returns (bool) {
        return durationDays == 7 || durationDays == 14 || durationDays == 30
            || durationDays == 60 || durationDays == 90 || durationDays == 180;
    }

    /// @notice Active fixed-term metadata for `user`'s debt in `asset`.
    ///         dueTimestamp == 0 means no term set (open-ended borrow or no debt).
    function getLoanTerm(address user, address asset)
        external
        view
        override
        returns (uint40 borrowedAt, uint16 durationDays, uint40 dueTimestamp)
    {
        LoanTerm storage t = _loanTerms[user][asset];
        uint40 due = t.durationDays == 0 ? 0 : t.borrowedAt + uint40(t.durationDays) * 1 days;
        return (t.borrowedAt, t.durationDays, due);
    }

    /// @notice True when a fixed term exists and its due date has passed.
    ///         Overdue loans still repay any time; liquidation remains HF-driven.
    function isLoanOverdue(address user, address asset) external view override returns (bool) {
        LoanTerm storage t = _loanTerms[user][asset];
        return t.durationDays > 0 && block.timestamp > t.borrowedAt + uint40(t.durationDays) * 1 days;
    }

    function getUserSupply(address user, address asset) external view override returns (uint256) {
        MarketConfig storage cfg   = _configs[asset];
        MarketState  storage state = _states[asset];
        uint256 sShares = sToken(cfg.sToken).sharesOf(user);
        return DecimalNormalizer.fromRay(sShares.mulRayDown(state.supplyIndex), cfg.decimals, false);
    }

    function getUtilization(address asset) external view override returns (uint256) {
        MarketState storage state = _states[asset];
        uint256 totalSupRay  = state.totalSupplyShares.mulRayDown(state.supplyIndex);
        uint256 totalDebtRay = state.totalDebtShares.mulRayUp(state.borrowIndex);
        return IInterestRateModel(_configs[asset].interestModel)
            .getUtilization(totalSupRay, totalDebtRay);
    }

    function getMarketList() external view returns (address[] memory) {
        return marketList;
    }

    /// @notice Maximum total debt (in Ray USD) the user may carry at current prices.
    function getBorrowPower(address user) external view override returns (uint256) {
        return _borrowPower(user);
    }

    /// @notice Total debt across all markets in Ray USD.
    function getTotalDebt(address user) external view override returns (uint256) {
        return _totalDebtOf(user);
    }

    /// @notice Total supply and total debt for a market, in the token's native decimals.
    function getMarketTotals(address asset)
        external
        view
        override
        returns (uint256 totalSupply, uint256 totalDebt)
    {
        MarketConfig storage cfg   = _configs[asset];
        MarketState  storage state = _states[asset];
        totalSupply = DecimalNormalizer.fromRay(
            state.totalSupplyShares.mulRayDown(state.supplyIndex), cfg.decimals, false
        );
        totalDebt = DecimalNormalizer.fromRay(
            state.totalDebtShares.mulRayUp(state.borrowIndex), cfg.decimals, true
        );
    }

    /// @notice Current per-second borrow and supply rates in Ray, from the market's IRM.
    function getMarketRates(address asset)
        external
        view
        override
        returns (uint256 borrowRatePerSecond, uint256 supplyRatePerSecond)
    {
        MarketConfig storage cfg   = _configs[asset];
        MarketState  storage state = _states[asset];
        uint256 totalSupRay  = state.totalSupplyShares.mulRayDown(state.supplyIndex);
        uint256 totalDebtRay = state.totalDebtShares.mulRayUp(state.borrowIndex);
        if (totalDebtRay == 0) return (0, 0);

        IInterestRateModel irm = IInterestRateModel(cfg.interestModel);
        borrowRatePerSecond = irm.getBorrowRatePerSecond(totalSupRay, totalDebtRay);
        supplyRatePerSecond = irm.getSupplyRatePerSecond(totalSupRay, totalDebtRay, cfg.reserveFactor);
    }

    // -------------------------------------------------------------------------
    // Internal: health factor
    // -------------------------------------------------------------------------

    /// @dev Health factor uses LIQUIDATION THRESHOLD for collateral weighting.
    ///      Only assets with collateralEnabled=true count as collateral.
    ///      USDC/EURC positions (collateralEnabled=false) are lend-and-borrow only:
    ///      their supply never contributes to collateral but their debt always counts.
    function _healthFactor(address user) internal view returns (uint256 hf) {
        uint256 weightedCollateralRay;
        uint256 totalDebtRay;

        for (uint256 i; i < marketList.length; ++i) {
            address asset = marketList[i];
            MarketConfig storage cfg   = _configs[asset];
            MarketState  storage state = _states[asset];
            if (!cfg.active) continue;

            // Collateral contribution — only for collateralEnabled assets (cirBTC, WETH)
            if (cfg.collateralEnabled) {
                uint256 sShares = sToken(cfg.sToken).sharesOf(user);
                if (sShares > 0) {
                    uint256 supplyRay = sShares.mulRayDown(state.supplyIndex);
                    uint256 priceRay  = _assetPriceRay(asset);
                    uint256 valueRay  = HealthFactor.usdValue(supplyRay, priceRay);
                    weightedCollateralRay += HealthFactor.applyPct(valueRay, cfg.liqThreshold);
                }
            }

            // Debt contribution — all markets (users can borrow USDC/EURC against collateral)
            uint256 dShares = DebtToken(cfg.debtToken).debtSharesOf(user);
            if (dShares > 0) {
                uint256 debtRay  = dShares.mulRayUp(state.borrowIndex);
                uint256 priceRay = _assetPriceRay(asset);
                totalDebtRay    += HealthFactor.usdValue(debtRay, priceRay);
            }
        }
        hf = HealthFactor.compute(weightedCollateralRay, totalDebtRay);
    }

    /// @dev Borrow power uses LTV (not liqThreshold) for collateral weighting.
    ///      Returns the maximum total debt (in Ray, USD) the user is allowed to have.
    ///      Only collateralEnabled assets count. LTV < liqThreshold so this is always
    ///      a tighter constraint than health factor.
    function _borrowPower(address user) internal view returns (uint256 power) {
        for (uint256 i; i < marketList.length; ++i) {
            address asset = marketList[i];
            MarketConfig storage cfg   = _configs[asset];
            MarketState  storage state = _states[asset];
            if (!cfg.active || !cfg.collateralEnabled) continue;

            uint256 sShares = sToken(cfg.sToken).sharesOf(user);
            if (sShares > 0) {
                uint256 supplyRay = sShares.mulRayDown(state.supplyIndex);
                uint256 priceRay  = _assetPriceRay(asset);
                uint256 valueRay  = HealthFactor.usdValue(supplyRay, priceRay);
                power += HealthFactor.applyPct(valueRay, cfg.ltv);
            }
        }
    }

    function _totalDebtOf(address user) internal view returns (uint256 total) {
        for (uint256 i; i < marketList.length; ++i) {
            address asset = marketList[i];
            MarketConfig storage cfg   = _configs[asset];
            MarketState  storage state = _states[asset];
            if (!cfg.active) continue;
            uint256 dShares = DebtToken(cfg.debtToken).debtSharesOf(user);
            if (dShares > 0) total += dShares.mulRayUp(state.borrowIndex);
        }
    }

    /// @dev Returns oracle price in 18-decimal USD for `asset`.
    ///      Uses staticcall so this internal helper remains view-compatible.
    ///      State-mutating oracle paths (Chainlink deviation writer) must use
    ///      getPrice() directly in non-view contexts; here we use staticcall
    ///      which reads the LAST committed price, which is sufficient for
    ///      health-factor and liquidation checks (not for the oracle accrual path).
    function _assetPriceRay(address asset) internal view returns (uint256 price) {
        address oracle = _configs[asset].oracle;
        (bool ok, bytes memory data) = oracle.staticcall(
            abi.encodeWithSelector(IPriceOracle.getPrice.selector, asset)
        );
        require(ok && data.length >= 32, "LP: oracle call failed");
        price = abi.decode(data, (uint256));
        require(price > 0, "LP: oracle returned zero price");
    }

    // -------------------------------------------------------------------------
    // Internal: safe token transfers (ERC-20 only — never native)
    // -------------------------------------------------------------------------

    /// @dev Pull ERC-20 tokens from `from`. Reverts if blocklisted or insufficient.
    ///      Audit fix: check token.code.length > 0 to prevent silent success on EOA calls.
    function _safeTransferIn(address token, address from, uint256 amount) internal {
        require(token.code.length > 0, "LP: token is not a contract");
        (bool ok, bytes memory data) = token.call(
            abi.encodeWithSignature("transferFrom(address,address,uint256)", from, address(this), amount)
        );
        require(ok && (data.length == 0 || abi.decode(data, (bool))), "LP: transferIn failed");
    }

    /// @dev Push ERC-20 tokens to `to`. Reverts if blocklisted.
    ///      Audit fix: check token.code.length > 0.
    function _safeTransferOut(address token, address to, uint256 amount) internal {
        require(token.code.length > 0, "LP: token is not a contract");
        (bool ok, bytes memory data) = token.call(
            abi.encodeWithSignature("transfer(address,uint256)", to, amount)
        );
        require(ok && (data.length == 0 || abi.decode(data, (bool))), "LP: transferOut failed");
    }

    /// @dev Try transferring; returns false instead of reverting (for liquidation claim pattern).
    function _tryTransferOut(address token, address to, uint256 amount)
        internal
        returns (bool success)
    {
        if (token.code.length == 0) return false;
        (bool ok, bytes memory data) = token.call(
            abi.encodeWithSignature("transfer(address,uint256)", to, amount)
        );
        success = ok && (data.length == 0 || abi.decode(data, (bool)));
    }

    // -------------------------------------------------------------------------
    // Internal: guards
    // -------------------------------------------------------------------------

    function _requireActiveMarket(address asset) internal view {
        require(_configs[asset].active, "LP: market not active");
    }

    function _requireNotPaused(address asset) internal view {
        require(_configs[asset].active, "LP: market not active");
        require(!_configs[asset].paused, "LP: market paused");
    }

    // -------------------------------------------------------------------------
    // Arc safety: reject native value
    // -------------------------------------------------------------------------

    /// @notice Reject any native USDC sent by mistake.
    ///         On Arc msg.value is in 18-decimal USDC — we never want that in protocol accounting.
    receive() external payable {
        // Refund immediately
        (bool ok,) = msg.sender.call{value: msg.value}("");
        require(ok, "LP: refund failed");
    }
}
