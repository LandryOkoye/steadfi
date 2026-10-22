// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ILendingPool} from "./interfaces/ILendingPool.sol";

/// @title BatchRouter
/// @notice One-click atomic flows built on top of LendingPool.
///
///         SECURITY FIXES (audit Phase 4):
///         - All pool actions now use OnBehalfOf variants so positions are always
///           booked to the END USER (msg.sender), never to this router.
///         - BatchRouter never holds funds between calls: tokens in, pool action,
///           any leftovers immediately returned to sender in the same tx.
///         - rescueTokens() allows an admin to recover tokens stranded by Permit2
///           frontrun (permit consumed out-of-band before our call lands).
///
///         Arc-native features used:
///         - Permit2 allowance transfer (gasless approval before supply or repay).
///         - Arc Memo contract (attached to repay leg of flows).
///
///         Flows:
///         1. supplyAndBorrow       — supply collateral then borrow in one tx.
///         2. repayAndWithdraw      — repay debt then withdraw collateral in one tx.
///         3. repayAllAndClose      — repay full debt + withdraw all collateral.
///         4. permit2Supply         — Permit2 transferFrom then supply (gasless approval).
///         5. permit2Repay          — Permit2 transferFrom then repay (gasless approval + memo).

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
    address      public immutable admin;

    /// @notice Arc Memo contract address (same on testnet and mainnet).
    address public constant MEMO_CONTRACT = 0x5294E9927c3306DcBaDb03fe70b92e01cCede505; // arc-studio-allow-onchain-literal

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
    event TokensRescued(address indexed token, address indexed to, uint256 amount);

    // -------------------------------------------------------------------------
    // Constructor
    // -------------------------------------------------------------------------

    constructor(address pool_, address permit2_, address admin_) {
        require(pool_    != address(0), "BR: zero pool");
        require(permit2_ != address(0), "BR: zero permit2");
        require(admin_   != address(0), "BR: zero admin");
        pool    = ILendingPool(pool_);
        permit2 = IPermit2(permit2_);
        admin   = admin_;
    }

    // -------------------------------------------------------------------------
    // Flow 1: Supply collateral + Borrow in one transaction
    // -------------------------------------------------------------------------

    /// @notice Atomically supply collateral and borrow in a single transaction.
    ///         Positions are booked to msg.sender, never to this router.
    ///         Caller must approve collateralAsset to this router (or use permit2Supply).
    function supplyAndBorrow(
        address collateralAsset,
        uint256 collateralAmount,
        address borrowAsset,
        uint256 borrowAmount
    ) external {
        // 1. Pull collateral from caller into router (temporary custody, same tx)
        require(
            IERC20(collateralAsset).transferFrom(msg.sender, address(this), collateralAmount),
            "BR: collateral pull failed"
        );

        // 2. Approve pool for exact collateral amount
        require(
            IERC20(collateralAsset).approve(address(pool), collateralAmount),
            "BR: approve failed"
        );

        // 3. Supply on behalf of caller — sTokens minted to msg.sender, not router
        pool.supplyOnBehalfOf(collateralAsset, collateralAmount, msg.sender);

        // 4. Borrow on behalf of caller — debt recorded to msg.sender; funds to router
        pool.borrowOnBehalfOf(borrowAsset, borrowAmount, msg.sender);

        // 5. Forward borrowed tokens to caller
        uint256 borrowed = IERC20(borrowAsset).balanceOf(address(this));
        if (borrowed > 0) {
            require(IERC20(borrowAsset).transfer(msg.sender, borrowed), "BR: borrow transfer failed");
        }

        emit BatchSupplyAndBorrow(msg.sender, collateralAsset, collateralAmount, borrowAsset, borrowAmount);
    }

    // -------------------------------------------------------------------------
    // Flow 2: Repay debt + Withdraw collateral in one transaction
    // -------------------------------------------------------------------------

    /// @notice Atomically repay debt and withdraw collateral.
    ///         Positions are adjusted on msg.sender's account.
    /// @param memo  Optional repayment reference — attached via Arc Memo contract.
    function repayAndWithdraw(
        address debtAsset,
        uint256 debtAmount,
        address collateralAsset,
        uint256 collateralAmount,
        bytes calldata memo
    ) external {
        // 1. Pull debt asset from caller
        require(
            IERC20(debtAsset).transferFrom(msg.sender, address(this), debtAmount),
            "BR: debt pull failed"
        );
        require(IERC20(debtAsset).approve(address(pool), debtAmount), "BR: approve failed");

        // 2. Repay on behalf of caller (pool's repayOnBehalfOf)
        pool.repayOnBehalfOf(debtAsset, debtAmount, msg.sender, memo);

        // 3. Return leftover debt asset (pool may cap at outstanding)
        uint256 leftover = IERC20(debtAsset).balanceOf(address(this));
        if (leftover > 0) {
            require(IERC20(debtAsset).transfer(msg.sender, leftover), "BR: leftover transfer failed");
        }

        // 4. Withdraw collateral on behalf of caller — funds go to caller
        pool.withdrawOnBehalfOf(collateralAsset, collateralAmount, msg.sender);

        // 5. Forward withdrawn collateral to caller
        uint256 collBal = IERC20(collateralAsset).balanceOf(address(this));
        if (collBal > 0) {
            require(IERC20(collateralAsset).transfer(msg.sender, collBal), "BR: coll transfer failed");
        }

        emit BatchRepayAndWithdraw(msg.sender, debtAsset, debtAmount, collateralAsset, collateralAmount);
    }

    // -------------------------------------------------------------------------
    // Flow 3: Repay all + Close position
    // -------------------------------------------------------------------------

    /// @notice Repay full debt and withdraw all collateral (close position).
    ///         Caller should pass type(uint256).max for maxDebtAmount.
    function repayAllAndClose(
        address debtAsset,
        uint256 maxDebtAmount,
        address collateralAsset,
        uint256 collateralAmount,
        bytes calldata memo
    ) external {
        uint256 outstanding = pool.getUserDebt(msg.sender, debtAsset);
        uint256 pullAmount  = outstanding < maxDebtAmount ? outstanding : maxDebtAmount;

        require(
            IERC20(debtAsset).transferFrom(msg.sender, address(this), pullAmount),
            "BR: debt pull failed"
        );
        require(IERC20(debtAsset).approve(address(pool), pullAmount), "BR: approve failed");

        pool.repayOnBehalfOf(debtAsset, pullAmount, msg.sender, memo);

        // Withdraw all collateral for msg.sender
        pool.withdrawOnBehalfOf(collateralAsset, collateralAmount, msg.sender);

        uint256 collBal = IERC20(collateralAsset).balanceOf(address(this));
        if (collBal > 0) {
            require(IERC20(collateralAsset).transfer(msg.sender, collBal), "BR: coll transfer failed");
        }

        // Return any unused debt asset
        uint256 leftover = IERC20(debtAsset).balanceOf(address(this));
        if (leftover > 0) {
            require(IERC20(debtAsset).transfer(msg.sender, leftover), "BR: leftover transfer failed");
        }

        emit BatchRepayAndWithdraw(msg.sender, debtAsset, pullAmount, collateralAsset, collateralAmount);
    }

    // -------------------------------------------------------------------------
    // Flow 4: Permit2 supply (gasless approval)
    // -------------------------------------------------------------------------

    /// @notice Use a Permit2 signature to transfer `amount` of `asset` then supply.
    ///         Eliminates a separate approve() transaction.
    ///         Tokens land in the router; supply is immediately booked to msg.sender.
    function permit2Supply(
        address asset,
        uint256 amount,
        uint256 nonce,
        uint256 deadline,
        bytes calldata signature
    ) external {
        // 1. Permit2 pulls token from signer to this router
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

        // 2. Supply on behalf of caller — sTokens go directly to msg.sender
        require(IERC20(asset).approve(address(pool), amount), "BR: approve failed");
        pool.supplyOnBehalfOf(asset, amount, msg.sender);

        // No leftover: exact amount supplied.
    }

    // -------------------------------------------------------------------------
    // Flow 5: Permit2 repay (gasless approval + optional memo)
    // -------------------------------------------------------------------------

    /// @notice Use a Permit2 signature to transfer `amount` then repay caller's debt.
    function permit2Repay(
        address asset,
        uint256 amount,
        uint256 nonce,
        uint256 deadline,
        bytes calldata signature,
        bytes calldata memo
    ) external {
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

        require(IERC20(asset).approve(address(pool), amount), "BR: approve failed");
        pool.repayOnBehalfOf(asset, amount, msg.sender, memo);

        // Return unused (pool caps at outstanding debt)
        uint256 leftover = IERC20(asset).balanceOf(address(this));
        if (leftover > 0) {
            require(IERC20(asset).transfer(msg.sender, leftover), "BR: leftover transfer failed");
        }
    }

    // -------------------------------------------------------------------------
    // Gas estimation view
    // -------------------------------------------------------------------------

    /// @notice Estimate USD cost of a pool action at current base fee.
    ///         On Arc gas is paid in USDC (native, 18 decimals).
    ///         Returns cost in 1e6 USDC units (ERC-20 USDC decimals).
    function estimateGasCostUsdc(uint256 gasUnits) external view returns (uint256 costUsdc6) {
        uint256 baseFee18  = block.basefee;
        uint256 totalFee18 = baseFee18 * gasUnits * 110 / 100; // +10% priority buffer
        costUsdc6 = totalFee18 / 1e12; // 18-dec native → 6-dec ERC-20
    }

    // -------------------------------------------------------------------------
    // Admin: rescue tokens stranded by Permit2 frontrun (audit fix)
    // -------------------------------------------------------------------------

    /// @notice Rescue ERC-20 tokens stranded in the router.
    ///         Only callable by admin (governance / multisig).
    ///         Used when a Permit2 nonce was consumed out-of-band, leaving tokens
    ///         inside the router with no pending flow to consume them.
    /// @param token     ERC-20 token to rescue.
    /// @param to        Recipient (should be the original signer).
    /// @param amount    Amount to transfer.
    function rescueTokens(address token, address to, uint256 amount) external {
        require(msg.sender == admin, "BR: only admin");
        require(to != address(0),   "BR: zero recipient");
        require(IERC20(token).transfer(to, amount), "BR: rescue transfer failed");
        emit TokensRescued(token, to, amount);
    }

    // -------------------------------------------------------------------------
    // Safety: reject native value
    // -------------------------------------------------------------------------

    receive() external payable {
        revert("BR: no native value");
    }
}
