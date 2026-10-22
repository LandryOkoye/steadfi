// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {RayMath} from "./libraries/RayMath.sol";
import {DecimalNormalizer} from "./libraries/DecimalNormalizer.sol";

/// @title DebtToken
/// @notice Non-transferable ERC-20 tracking borrow shares per user.
///         Minted on borrow(), burned on repay().
///         transfer() and transferFrom() always revert — debt cannot be delegated.
///
///         Rebasing via borrow index:
///           underlying debt = debtShares * borrowIndex / RAY
///
///         Arc note: debt for USDC uses the ERC-20 interface at 6 decimals.
contract DebtToken {
    using RayMath for uint256;

    // -------------------------------------------------------------------------
    // Metadata
    // -------------------------------------------------------------------------

    string public name;
    string public symbol;
    uint8  public immutable decimals;

    // -------------------------------------------------------------------------
    // State
    // -------------------------------------------------------------------------

    address public immutable lendingPool;
    address public immutable underlying;

    uint256 public totalDebtShares;
    mapping(address => uint256) public debtShares;

    uint256 internal constant RAY = RayMath.RAY;

    // -------------------------------------------------------------------------
    // Events
    // -------------------------------------------------------------------------

    event Transfer(address indexed from, address indexed to, uint256 value);
    event DebtMinted(address indexed borrower, uint256 debtShares_, uint256 borrowIndex);
    event DebtBurned(address indexed borrower, uint256 debtShares_, uint256 borrowIndex);

    modifier onlyPool() {
        require(msg.sender == lendingPool, "DebtToken: only pool");
        _;
    }

    constructor(
        string memory _name,
        string memory _symbol,
        uint8  _decimals,
        address _lendingPool,
        address _underlying
    ) {
        require(_lendingPool != address(0), "DebtToken: zero pool");
        require(_underlying  != address(0), "DebtToken: zero underlying");
        name        = _name;
        symbol      = _symbol;
        decimals    = _decimals;
        lendingPool = _lendingPool;
        underlying  = _underlying;
    }

    // -------------------------------------------------------------------------
    // ERC-20 view (rebasing)
    // -------------------------------------------------------------------------

    function totalSupply() external view returns (uint256) {
        uint256 idx = _borrowIndex();
        if (totalDebtShares == 0 || idx == 0) return 0;
        return DecimalNormalizer.fromRay(totalDebtShares.mulRayUp(idx), decimals, true);
    }

    /// @notice Returns current outstanding debt of account (with accrued interest).
    function balanceOf(address account) external view returns (uint256) {
        uint256 idx = _borrowIndex();
        if (debtShares[account] == 0 || idx == 0) return 0;
        return DecimalNormalizer.fromRay(debtShares[account].mulRayUp(idx), decimals, true);
    }

    function debtSharesOf(address account) external view returns (uint256) {
        return debtShares[account];
    }

    // -------------------------------------------------------------------------
    // ERC-20 non-transferable
    // -------------------------------------------------------------------------

    function allowance(address, address) external pure returns (uint256) { return 0; }
    function approve(address, uint256) external pure returns (bool) { revert("DebtToken: non-transferable"); }
    function transfer(address, uint256) external pure returns (bool) { revert("DebtToken: non-transferable"); }
    function transferFrom(address, address, uint256) external pure returns (bool) { revert("DebtToken: non-transferable"); }

    // -------------------------------------------------------------------------
    // Pool-only mint / burn
    // -------------------------------------------------------------------------

    /// @notice Mint debt shares to `borrower`. Called on borrow().
    /// @param borrower    Address taking on debt.
    /// @param amountRay   Debt amount in Ray precision.
    /// @param borrowIndex Current borrow index in Ray.
    function mint(address borrower, uint256 amountRay, uint256 borrowIndex)
        external
        onlyPool
        returns (uint256 mintedShares)
    {
        require(borrowIndex > 0, "DebtToken: zero index");
        // shares = amountRay / borrowIndex (round up — borrower owes the dust)
        mintedShares = amountRay.divRayUp(borrowIndex);
        require(mintedShares > 0, "DebtToken: zero shares");
        debtShares[borrower]  += mintedShares;
        totalDebtShares       += mintedShares;
        emit DebtMinted(borrower, mintedShares, borrowIndex);
        emit Transfer(address(0), borrower, DecimalNormalizer.fromRay(amountRay, decimals, true));
    }

    /// @notice Burn debt shares from `borrower`. Called on repay().
    /// @param borrower    Address repaying debt.
    /// @param amountRay   Repayment amount in Ray precision.
    /// @param borrowIndex Current borrow index in Ray.
    /// @return burnedShares Shares burned (may be capped to total shares if closing position).
    function burn(address borrower, uint256 amountRay, uint256 borrowIndex)
        external
        onlyPool
        returns (uint256 burnedShares)
    {
        require(borrowIndex > 0, "DebtToken: zero index");
        // shares = amountRay / borrowIndex (round down on repay — protocol keeps dust)
        burnedShares = amountRay.divRayDown(borrowIndex);
        // Cap at total to handle full repayment rounding
        if (burnedShares > debtShares[borrower]) {
            burnedShares = debtShares[borrower];
        }
        debtShares[borrower]  -= burnedShares;
        totalDebtShares       -= burnedShares;
        emit DebtBurned(borrower, burnedShares, borrowIndex);
        emit Transfer(borrower, address(0), DecimalNormalizer.fromRay(amountRay, decimals, false));
    }

    // -------------------------------------------------------------------------
    // Internal
    // -------------------------------------------------------------------------

    function _borrowIndex() internal view returns (uint256) {
        (bool ok, bytes memory data) = lendingPool.staticcall(
            abi.encodeWithSignature("getBorrowIndex(address)", underlying)
        );
        if (!ok || data.length == 0) return RAY;
        return abi.decode(data, (uint256));
    }
}
