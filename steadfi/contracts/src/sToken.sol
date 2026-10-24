// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {RayMath} from "./libraries/RayMath.sol";
import {DecimalNormalizer} from "./libraries/DecimalNormalizer.sol";
import {ILendingPool} from "./interfaces/ILendingPool.sol";

/// @title sToken
/// @notice ERC-20 supply receipt token. Each sToken represents a share of the
///         corresponding asset supply in the LendingPool.
///
///         Rebasing via supply index:
///           underlying balance = shares * supplyIndex / RAY
///
///         The LendingPool is the only minter/burner. Transfer is allowed so
///         sTokens can be held in wallets, but the underlying yield accrues to
///         whoever holds the shares.
///
///         Arc note: sToken for USDC uses the ERC-20 USDC address at 6 decimals.
///         Never reads native USDC balance (address.balance).
contract sToken {
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

    uint256 public totalShares;
    mapping(address => uint256) public shares;
    mapping(address => mapping(address => uint256)) public allowance;

    uint256 internal constant RAY = RayMath.RAY;

    // -------------------------------------------------------------------------
    // Events (ERC-20 standard)
    // -------------------------------------------------------------------------

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);
    /// @notice Emitted when shares are minted/burned, for indexer tracking.
    event SharesMinted(address indexed to, uint256 shares_, uint256 supplyIndex);
    event SharesBurned(address indexed from, uint256 shares_, uint256 supplyIndex);

    // -------------------------------------------------------------------------
    // Constructor
    // -------------------------------------------------------------------------

    modifier onlyPool() {
        require(msg.sender == lendingPool, "sToken: only pool");
        _;
    }

    constructor(
        string memory _name,
        string memory _symbol,
        uint8  _decimals,
        address _lendingPool,
        address _underlying
    ) {
        require(_lendingPool != address(0), "sToken: zero pool");
        require(_underlying  != address(0), "sToken: zero underlying");
        name        = _name;
        symbol      = _symbol;
        decimals    = _decimals;
        lendingPool = _lendingPool;
        underlying  = _underlying;
    }

    // -------------------------------------------------------------------------
    // ERC-20 view (rebasing: balanceOf returns underlying, not shares)
    // -------------------------------------------------------------------------

    function totalSupply() external view returns (uint256) {
        uint256 idx = _supplyIndex();
        if (totalShares == 0 || idx == 0) return 0;
        return DecimalNormalizer.fromRay(totalShares.mulRayDown(idx), decimals, false);
    }

    /// @notice Returns the underlying token balance (not raw shares).
    function balanceOf(address account) external view returns (uint256) {
        uint256 idx = _supplyIndex();
        if (shares[account] == 0 || idx == 0) return 0;
        return DecimalNormalizer.fromRay(shares[account].mulRayDown(idx), decimals, false);
    }

    /// @notice Raw shares held by account (for advanced integrators).
    function sharesOf(address account) external view returns (uint256) {
        return shares[account];
    }

    // -------------------------------------------------------------------------
    // ERC-20 mutative
    // -------------------------------------------------------------------------

    function approve(address spender, uint256 value) external returns (bool) {
        allowance[msg.sender][spender] = value;
        emit Approval(msg.sender, spender, value);
        return true;
    }

    function transfer(address to, uint256 value) external returns (bool) {
        _transfer(msg.sender, to, value);
        return true;
    }

    function transferFrom(address from, address to, uint256 value) external returns (bool) {
        uint256 allowed = allowance[from][msg.sender];
        if (allowed != type(uint256).max) {
            require(allowed >= value, "sToken: insufficient allowance");
            allowance[from][msg.sender] = allowed - value;
        }
        _transfer(from, to, value);
        return true;
    }

    // -------------------------------------------------------------------------
    // Pool-only mint / burn
    // -------------------------------------------------------------------------

    /// @notice Mint sToken shares to `to`. Called by LendingPool on supply().
    /// @param to          Recipient of shares.
    /// @param amountRay   Amount in Ray precision (already normalized by pool).
    /// @param supplyIndex Current supply index in Ray.
    function mint(address to, uint256 amountRay, uint256 supplyIndex)
        external
        onlyPool
        returns (uint256 mintedShares)
    {
        require(supplyIndex > 0, "sToken: zero index");
        // shares = amountRay / supplyIndex (round down — supply path)
        mintedShares = amountRay.divRayDown(supplyIndex);
        require(mintedShares > 0, "sToken: zero shares");
        shares[to]  += mintedShares;
        totalShares += mintedShares;
        emit SharesMinted(to, mintedShares, supplyIndex);
        emit Transfer(address(0), to, DecimalNormalizer.fromRay(amountRay, decimals, false));
    }

    /// @notice Burn sToken shares from `from`. Called by LendingPool on withdraw().
    /// @param from        Owner of shares.
    /// @param amountRay   Amount in Ray precision to redeem.
    /// @param supplyIndex Current supply index in Ray.
    function burn(address from, uint256 amountRay, uint256 supplyIndex)
        external
        onlyPool
        returns (uint256 burnedShares)
    {
        require(supplyIndex > 0, "sToken: zero index");
        // shares = amountRay / supplyIndex (round up — protect pool from dust)
        burnedShares = amountRay.divRayUp(supplyIndex);
        require(shares[from] >= burnedShares, "sToken: insufficient shares");
        shares[from]  -= burnedShares;
        totalShares   -= burnedShares;
        emit SharesBurned(from, burnedShares, supplyIndex);
        emit Transfer(from, address(0), DecimalNormalizer.fromRay(amountRay, decimals, false));
    }

    // -------------------------------------------------------------------------
    // Internal
    // -------------------------------------------------------------------------

    /// @dev Fetch current supply index from the LendingPool.
    function _supplyIndex() internal view returns (uint256) {
        (bool ok, bytes memory data) = lendingPool.staticcall(
            abi.encodeWithSignature("getSupplyIndex(address)", underlying)
        );
        if (!ok || data.length == 0) return RAY;
        return abi.decode(data, (uint256));
    }

    /// @dev Transfer by converting underlying amount to shares then moving shares.
    function _transfer(address from, address to, uint256 value) internal {
        require(to != address(0), "sToken: transfer to zero");
        uint256 idx = _supplyIndex();
        require(idx > 0, "sToken: zero index");
        uint256 valueRay = DecimalNormalizer.toRay(value, decimals, false);
        uint256 sharesToMove = valueRay.divRayUp(idx);
        require(shares[from] >= sharesToMove, "sToken: insufficient balance");
        shares[from] -= sharesToMove;
        shares[to]   += sharesToMove;
        // Collateral must not leave an indebted position: the sender's debt must
        // stay within LTV borrow power after the move (same rule as withdraw).
        require(ILendingPool(lendingPool).isPositionSound(from), "sToken: transfer breaks borrow power");
        emit Transfer(from, to, value);
    }
}
