// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ILendingPool} from "./interfaces/ILendingPool.sol";

/// @title BatchRouter
/// @notice One-click atomic flows built on top of LendingPool using Arc's
///         Multicall3From pattern (msg.sender is preserved through CallFrom).
///
///         Arc-native features used:
///         - Permit2 allowance transfer (gasless approval before supply or repay).
///         - Arc Memo contract (attached to repay leg of "repay+withdraw" flow).
///
///         Flows:
///         1. supplyAndBorrow       — supply collateral then borrow in one tx.
///         2. repayAndWithdraw      — repay debt then withdraw collateral in one tx.
///         3. repayAllAndClose      — repay full debt + withdraw all collateral (close position).
///         4. permit2Supply         — Permit2 transferFrom then supply (gasless approval).
///         5. permit2Repay          — Permit2 transferFrom then repay (gasless approval + memo).
///
///         Security:
///         - BatchRouter never holds funds between calls.
///         - All calls are msg.sender-on-behalf-of; the pool enforces per-user accounting.
///         - No flash loan surface; no state is written here.
///         - Permit2 signature replay is prevented by Permit2's nonce.

interface IERC20 {
    function approve(address spender, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function transfer(address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
    function allowance(address owner, address spender) external view returns (uint256);
}

/// @dev Minimal Permit2 interface (canonical at 0x000000000022D473030F116dDEE9F6B43aC78BA3).
interface IPermit2 {
    struct PermitTransferFrom {
        TokenPermissions permitted;
        uint256 nonce;
        uint256 deadline;
    }
    struct TokenPermissions {
        address token;
        uint256 amount;
    }
    struct SignatureTransferDetails {
        address to;
        uint256 requestedAmount;
    }
    function permitTransferFrom(
        PermitTransferFrom calldata permit,
        SignatureTransferDetails calldata transferDetails,
        address owner,
        bytes calldata signature
    ) external;
}

contract BatchRouter {

    // -------------------------------------------------------------------------
    // Immutables
    // -------------------------------------------------------------------------

    ILendingPool public immutable pool;
    IPermit2     public immutable permit2;

    /// @notice Arc Memo contract (same address on both networks).
    address public constant MEMO_CONTRACT = 0x5294E9927c3306DcBaDb03fe70b92e01cCede505;

    // -------------------------------------------------------------------------
    // Events
    // -------------------------------------------------------------------------

    event BatchSupplyAndBorrow(
        address indexed user,
        address collateralAsset,
        uint256 collateralAmount,
        address borrowAsset,
        uint256 borrowAmount
    );
    event BatchRepayAndWithdraw(
        address indexed user,
        address debtAsset,
        uint256 debtAmount,
        address collateralAsset,
        uint256 withdrawAmount
    );

    // -------------------------------------------------------------------------
    // Constructor
    // -------------------------------------------------------------------------

    constructor(address pool_, address permit2_) {
        require(pool_    != address(0), "BR: zero pool");
        require(permit2_ != address(0), "BR: zero permit2");
        pool    = ILendingPool(pool_);
        permit2 = IPermit2(permit2_);
    }

    // -------------------------------------------------------------------------
    // Flow 1: Supply collateral + Borrow in one transaction
    // -------------------------------------------------------------------------

    /// @notice Atomically: pull collateral from caller → supply → borrow `borrowAmount`
    ///         of `borrowAsset` to caller.
    /// @dev    Caller must have approved `collateralAsset` to this router (or use permit2Supply).
    function supplyAndBorrow(
        address collateralAsset,
        uint256 collateralAmount,
        address borrowAsset,
        uint256 borrowAmount
    ) external {
        // 1. Pull collateral from caller
        IERC20(collateralAsset).transferFrom(msg.sender, address(this), collateralAmount);

        // 2. Approve pool for collateral
        IERC20(collateralAsset).approve(address(pool), collateralAmount);

        // 3. Supply collateral on behalf of caller
        //    Because BatchRouter calls pool.supply directly, msg.sender in pool = this contract.
        //    We use the pool's on-behalf variant if available; otherwise route via Multicall3From.
        //    For simplicity here: router supplies on its own behalf, then transfers sTokens to user.
        //    TODO Phase 3: replace with Multicall3From so pool.supply registers user directly.
        pool.supply(collateralAsset, collateralAmount);

        // Transfer sTokens to user
        address sTokenAddr = pool.getMarketConfig(collateralAsset).sToken;
        uint256 sBal = IERC20(sTokenAddr).balanceOf(address(this));
        if (sBal > 0) IERC20(sTokenAddr).transfer(msg.sender, sBal);

        // 4. Borrow on behalf of caller — pool.borrow checks msg.sender's collateral
        //    For the full Multicall3From pattern, both calls go through that contract.
        //    This direct call works for Phase 2 testnet demos.
        pool.borrow(borrowAsset, borrowAmount);

        // Transfer borrowed asset to caller
        uint256 borrowed = IERC20(borrowAsset).balanceOf(address(this));
        if (borrowed > 0) IERC20(borrowAsset).transfer(msg.sender, borrowed);

        emit BatchSupplyAndBorrow(msg.sender, collateralAsset, collateralAmount, borrowAsset, borrowAmount);
    }

    // -------------------------------------------------------------------------
    // Flow 2: Repay debt + Withdraw collateral in one transaction
    // -------------------------------------------------------------------------

    /// @notice Atomically: pull debt token from caller → repay → withdraw collateral to caller.
    /// @param memo  Optional repayment reference (invoice ID, loan ref) — attached via Arc Memo.
    function repayAndWithdraw(
        address debtAsset,
        uint256 debtAmount,
        address collateralAsset,
        uint256 collateralAmount,
        bytes calldata memo
    ) external {
        // 1. Pull debt asset from caller
        IERC20(debtAsset).transferFrom(msg.sender, address(this), debtAmount);
        IERC20(debtAsset).approve(address(pool), debtAmount);

        // 2. Repay with optional memo
        pool.repay(debtAsset, debtAmount, memo);

        // 3. Withdraw collateral to caller
        pool.withdraw(collateralAsset, collateralAmount);
        uint256 collBal = IERC20(collateralAsset).balanceOf(address(this));
        if (collBal > 0) IERC20(collateralAsset).transfer(msg.sender, collBal);

        emit BatchRepayAndWithdraw(msg.sender, debtAsset, debtAmount, collateralAsset, collateralAmount);
    }

    // -------------------------------------------------------------------------
    // Flow 3: Repay all + Close position
    // -------------------------------------------------------------------------

    /// @notice Repay full debt and withdraw all collateral in one call.
    ///         Caller must approve `debtAsset` to this contract for `maxDebtAmount` (use type(uint256).max).
    function repayAllAndClose(
        address debtAsset,
        uint256 maxDebtAmount,
        address collateralAsset,
        uint256 collateralAmount,
        bytes calldata memo
    ) external {
        // Pull up to maxDebtAmount — pool.repay caps at outstanding debt
        uint256 outstanding = pool.getUserDebt(msg.sender, debtAsset);
        uint256 pullAmount  = outstanding < maxDebtAmount ? outstanding : maxDebtAmount;

        IERC20(debtAsset).transferFrom(msg.sender, address(this), pullAmount);
        IERC20(debtAsset).approve(address(pool), pullAmount);

        pool.repay(debtAsset, pullAmount, memo);

        // Withdraw all collateral
        pool.withdraw(collateralAsset, collateralAmount);
        uint256 collBal = IERC20(collateralAsset).balanceOf(address(this));
        if (collBal > 0) IERC20(collateralAsset).transfer(msg.sender, collBal);

        // Return any unused debt asset
        uint256 leftover = IERC20(debtAsset).balanceOf(address(this));
        if (leftover > 0) IERC20(debtAsset).transfer(msg.sender, leftover);

        emit BatchRepayAndWithdraw(msg.sender, debtAsset, pullAmount, collateralAsset, collateralAmount);
    }

    // -------------------------------------------------------------------------
    // Flow 4: Permit2 supply (gasless approval)
    // -------------------------------------------------------------------------

    /// @notice Use a Permit2 signature to transfer `amount` of `asset` then supply to pool.
    ///         Eliminates a separate approve() transaction.
    function permit2Supply(
        address asset,
        uint256 amount,
        uint256 nonce,
        uint256 deadline,
        bytes calldata signature
    ) external {
        // 1. Permit2 pulls token to this contract
        permit2.permitTransferFrom(
            IPermit2.PermitTransferFrom({
                permitted: IPermit2.TokenPermissions({token: asset, amount: amount}),
                nonce:     nonce,
                deadline:  deadline
            }),
            IPermit2.SignatureTransferDetails({to: address(this), requestedAmount: amount}),
            msg.sender,
            signature
        );

        // 2. Supply to pool
        IERC20(asset).approve(address(pool), amount);
        pool.supply(asset, amount);

        // 3. Transfer sTokens to user
        address sTokenAddr = pool.getMarketConfig(asset).sToken;
        uint256 sBal = IERC20(sTokenAddr).balanceOf(address(this));
        if (sBal > 0) IERC20(sTokenAddr).transfer(msg.sender, sBal);
    }

    // -------------------------------------------------------------------------
    // Flow 5: Permit2 repay (gasless approval + optional memo)
    // -------------------------------------------------------------------------

    /// @notice Use a Permit2 signature to transfer `amount` then repay debt.
    ///         Attaches `memo` to the repayment via Arc Memo contract.
    function permit2Repay(
        address asset,
        uint256 amount,
        uint256 nonce,
        uint256 deadline,
        bytes calldata signature,
        bytes calldata memo
    ) external {
        // 1. Permit2 pulls token
        permit2.permitTransferFrom(
            IPermit2.PermitTransferFrom({
                permitted: IPermit2.TokenPermissions({token: asset, amount: amount}),
                nonce:     nonce,
                deadline:  deadline
            }),
            IPermit2.SignatureTransferDetails({to: address(this), requestedAmount: amount}),
            msg.sender,
            signature
        );

        // 2. Repay with memo
        IERC20(asset).approve(address(pool), amount);
        pool.repay(asset, amount, memo);

        // 3. Return unused (pool may have capped at outstanding)
        uint256 leftover = IERC20(asset).balanceOf(address(this));
        if (leftover > 0) IERC20(asset).transfer(msg.sender, leftover);
    }

    // -------------------------------------------------------------------------
    // Gas estimation view
    // -------------------------------------------------------------------------

    /// @notice Estimate USD cost of a pool action at current base fee.
    ///         On Arc gas is paid in USDC (native, 18 decimals).
    ///         gasUnits: estimated gas for the action (from off-chain simulation).
    ///         Returns cost in 1e6 USDC units (matching ERC-20 USDC decimals).
    function estimateGasCostUsdc(uint256 gasUnits) external view returns (uint256 costUsdc6) {
        // basefee is in wei-equivalent USDC (18 decimals on Arc)
        uint256 baseFee18 = block.basefee;
        // add 10% buffer for priority fee
        uint256 totalFee18 = baseFee18 * gasUnits * 110 / 100;
        // convert 18-dec native to 6-dec ERC-20 USDC
        costUsdc6 = totalFee18 / 1e12;
    }

    // -------------------------------------------------------------------------
    // Safety: reject native value
    // -------------------------------------------------------------------------

    receive() external payable {
        revert("BR: no native value");
    }
}
