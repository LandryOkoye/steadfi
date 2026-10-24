// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test, console} from "forge-std/Test.sol";
import {LendingPool}       from "../src/LendingPool.sol";
import {InterestRateModel} from "../src/InterestRateModel.sol";
import {MockPriceOracle}   from "../src/MockPriceOracle.sol";
import {sToken}            from "../src/sToken.sol";
import {DebtToken}         from "../src/DebtToken.sol";
import {ILendingPool}      from "../src/interfaces/ILendingPool.sol";
import {RayMath}           from "../src/libraries/RayMath.sol";
import {DecimalNormalizer} from "../src/libraries/DecimalNormalizer.sol";

/// @notice Mock ERC-20 token for testing. Supports optional blocklist.
contract MockERC20 {
    string  public name;
    string  public symbol;
    uint8   public decimals;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    mapping(address => bool) public blocklisted;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    constructor(string memory _name, string memory _sym, uint8 _dec) {
        name = _name; symbol = _sym; decimals = _dec;
    }

    function mint(address to, uint256 amount) external { balanceOf[to] += amount; }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        require(!blocklisted[msg.sender] && !blocklisted[to], "BLOCKLISTED");
        require(balanceOf[msg.sender] >= amount, "INSUFFICIENT");
        balanceOf[msg.sender] -= amount;
        balanceOf[to]         += amount;
        emit Transfer(msg.sender, to, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        require(!blocklisted[from] && !blocklisted[to], "BLOCKLISTED");
        require(balanceOf[from] >= amount, "INSUFFICIENT");
        require(allowance[from][msg.sender] >= amount, "ALLOWANCE");
        allowance[from][msg.sender] -= amount;
        balanceOf[from] -= amount;
        balanceOf[to]   += amount;
        emit Transfer(from, to, amount);
        return true;
    }

    function setBlocklisted(address addr, bool flag) external { blocklisted[addr] = flag; }
}

contract LendingPoolTest is Test {
    using RayMath for uint256;

    // -------------------------------------------------------------------------
    // Fixtures
    // -------------------------------------------------------------------------

    LendingPool       pool;
    InterestRateModel irm;
    MockPriceOracle   oracle;
    MockERC20         usdc;
    MockERC20         cirBTC;
    sToken            sUSDC;
    DebtToken         dUSDC;
    sToken            sCIRBTC;
    DebtToken         dCIRBTC;

    address alice = address(0xA1);
    address bob   = address(0xB1);
    address carol = address(0xC1); // liquidator

    uint256 constant RAY          = RayMath.RAY;
    uint256 constant BTC_PRICE    = 95_000e18; // $95k
    uint256 constant USDC_PRICE   = 1e18;      // $1

    function setUp() public {
        // Use mock tokens (real Arc USDC is at 0x3600... but not available in forge local EVM)
        usdc   = new MockERC20("USDC",   "USDC",   6);
        cirBTC = new MockERC20("cirBTC", "cirBTC", 8);

        // IRM: 0% base, 8% slope1, 100% slope2, 90% kink
        irm = new InterestRateModel(0, 0.08e27, 1.00e27, 0.90e27);

        // Oracle: BTC=$95k, USDC=$1 (hardcoded in MockPriceOracle)
        oracle = new MockPriceOracle(address(this));
        oracle.setPrice(address(cirBTC), BTC_PRICE);

        // Pool (owner = this test contract)
        pool = new LendingPool(address(this));

        // Market tokens
        sUSDC   = new sToken("sfUSDC",   "sfUSDC",   6,  address(pool), address(usdc));
        dUSDC   = new DebtToken("dUSDC", "dUSDC",    6,  address(pool), address(usdc));
        sCIRBTC = new sToken("sfcirBTC", "sfcirBTC", 8,  address(pool), address(cirBTC));
        dCIRBTC = new DebtToken("dcirBTC","dcirBTC", 8,  address(pool), address(cirBTC));

        // Set mock USDC price ($1) in oracle — needed because mock usdc address != 0x3600...
        oracle.setPrice(address(usdc), 1e18);

        // Add USDC market (borrow enabled)
        pool.addMarket(address(usdc), ILendingPool.MarketConfig({
            sToken:        address(sUSDC),
            debtToken:     address(dUSDC),
            interestModel: address(irm),
            oracle:        address(oracle),
            decimals:      6,
            ltv: 0,
            liqThreshold: 0,
            liqBonus:      500,
            reserveFactor: 1000,
            closeFactor:   5000,
            supplyCap:     10_000_000e6,
            borrowCap:     8_000_000e6,
            borrowEnabled: true,
            collateralEnabled: false,
            active:        true,
            paused:        false
        }));

        // Add cirBTC market (collateral only)
        pool.addMarket(address(cirBTC), ILendingPool.MarketConfig({
            sToken:        address(sCIRBTC),
            debtToken:     address(dCIRBTC),
            interestModel: address(irm),
            oracle:        address(oracle),
            decimals:      8,
            ltv:           7000,
            liqThreshold:  7800,
            liqBonus:      800,
            reserveFactor: 1500,
            closeFactor:   5000,
            supplyCap:     50e8,
            borrowCap:     0,
            borrowEnabled: false,
            collateralEnabled: true,
            active:        true,
            paused:        false
        }));

        // Fund users
        usdc.mint(alice, 100_000e6);
        usdc.mint(bob,   100_000e6);
        usdc.mint(carol, 500_000e6);
        cirBTC.mint(bob, 1e8); // 1 BTC = $95k

        vm.label(alice, "alice");
        vm.label(bob,   "bob");
        vm.label(carol, "carol/liquidator");
    }

    // -------------------------------------------------------------------------
    // Supply tests
    // -------------------------------------------------------------------------

    function test_supply_basic() public {
        vm.startPrank(alice);
        usdc.approve(address(pool), 1_000e6);
        pool.supply(address(usdc), 1_000e6);
        vm.stopPrank();

        assertEq(pool.getUserSupply(alice, address(usdc)), 1_000e6, "supply balance");
        assertGt(sUSDC.sharesOf(alice), 0, "shares > 0");
    }

    function test_supply_zero_reverts() public {
        vm.prank(alice);
        vm.expectRevert("LP: zero amount");
        pool.supply(address(usdc), 0);
    }

    function test_supply_cap_enforced() public {
        // Mint enough to try to exceed cap
        usdc.mint(alice, 20_000_000e6);
        vm.startPrank(alice);
        usdc.approve(address(pool), 20_000_000e6);
        vm.expectRevert("LP: supply cap reached");
        pool.supply(address(usdc), 11_000_000e6); // > 10M cap
        vm.stopPrank();
    }

    function test_supply_two_users_shares() public {
        // Alice supplies first, Bob supplies same amount — equal shares
        vm.startPrank(alice);
        usdc.approve(address(pool), 1_000e6);
        pool.supply(address(usdc), 1_000e6);
        vm.stopPrank();

        vm.startPrank(bob);
        usdc.approve(address(pool), 1_000e6);
        pool.supply(address(usdc), 1_000e6);
        vm.stopPrank();

        assertEq(sUSDC.sharesOf(alice), sUSDC.sharesOf(bob), "equal shares");
    }

    // -------------------------------------------------------------------------
    // Borrow tests
    // -------------------------------------------------------------------------

    function test_borrow_and_repay() public {
        // Bob supplies cirBTC as collateral, borrows USDC
        // Alice provides USDC liquidity
        vm.startPrank(alice);
        usdc.approve(address(pool), 50_000e6);
        pool.supply(address(usdc), 50_000e6);
        vm.stopPrank();

        vm.startPrank(bob);
        cirBTC.approve(address(pool), 1e8);
        pool.supply(address(cirBTC), 1e8); // 1 BTC = $95k

        // Can borrow up to LTV 70% = $66.5k in USDC
        usdc.approve(address(pool), type(uint256).max);
        pool.borrow(address(usdc), 30_000e6); // $30k < $66.5k LTV
        vm.stopPrank();

        assertEq(pool.getUserDebt(bob, address(usdc)), 30_000e6, "debt = 30k");

        // Bob repays with no memo
        vm.startPrank(bob);
        pool.repay(address(usdc), 30_000e6, "");
        vm.stopPrank();

        assertEq(pool.getUserDebt(bob, address(usdc)), 0, "debt cleared");
    }

    function test_borrow_exceeds_ltv_reverts() public {
        // Alice supplies plenty of liquidity so borrow cap/liquidity won't trigger first
        usdc.mint(alice, 200_000e6);
        vm.startPrank(alice);
        usdc.approve(address(pool), 200_000e6);
        pool.supply(address(usdc), 200_000e6);
        vm.stopPrank();

        vm.startPrank(bob);
        cirBTC.approve(address(pool), 1e8);
        pool.supply(address(cirBTC), 1e8); // $95k collateral
        // LTV=70%, so borrow power = $95k * 70% = $66.5k.
        // Borrowing $80k > $66.5k => reverts at LTV check (before HF check).
        vm.expectRevert("LP: exceeds borrow power (LTV)");
        pool.borrow(address(usdc), 80_000e6);
        vm.stopPrank();
    }

    // -------------------------------------------------------------------------
    // Withdraw LTV tests
    // -------------------------------------------------------------------------

    function test_withdraw_exceeding_ltv_reverts() public {
        // Alice provides liquidity
        vm.startPrank(alice);
        usdc.approve(address(pool), 100_000e6);
        pool.supply(address(usdc), 100_000e6);
        vm.stopPrank();

        // Bob deposits 1 BTC ($95k), borrows at the LTV limit ($66.5k)
        vm.startPrank(bob);
        cirBTC.approve(address(pool), 1e8);
        pool.supply(address(cirBTC), 1e8);
        usdc.approve(address(pool), type(uint256).max);
        pool.borrow(address(usdc), 66_500e6);

        // Withdrawing 0.1 BTC leaves $85.5k collateral => $59.85k LTV power,
        // below the $66.5k debt. Must revert on the LTV check even though the
        // liquidation-threshold health factor would still be healthy.
        vm.expectRevert("LP: exceeds borrow power (LTV)");
        pool.withdraw(address(cirBTC), 0.1e8);
        vm.stopPrank();
    }

    function test_withdraw_within_ltv_succeeds() public {
        vm.startPrank(alice);
        usdc.approve(address(pool), 100_000e6);
        pool.supply(address(usdc), 100_000e6);
        vm.stopPrank();

        vm.startPrank(bob);
        cirBTC.approve(address(pool), 1e8);
        pool.supply(address(cirBTC), 1e8);
        usdc.approve(address(pool), type(uint256).max);
        pool.borrow(address(usdc), 30_000e6);

        // Remaining $47.5k collateral => $33.25k LTV power > $30k debt.
        pool.withdraw(address(cirBTC), 0.5e8);
        vm.stopPrank();

        assertEq(pool.getUserSupply(bob, address(cirBTC)), 0.5e8, "half collateral withdrawn");
    }

    function test_borrow_disabled_asset_reverts() public {
        vm.startPrank(bob);
        cirBTC.approve(address(pool), 1e8);
        pool.supply(address(cirBTC), 1e8);

        vm.expectRevert("LP: borrow disabled for asset");
        pool.borrow(address(cirBTC), 1e8);
        vm.stopPrank();
    }

    function test_repay_with_memo() public {
        // Setup liquidity
        vm.startPrank(alice);
        usdc.approve(address(pool), 50_000e6);
        pool.supply(address(usdc), 50_000e6);
        vm.stopPrank();

        vm.startPrank(bob);
        cirBTC.approve(address(pool), 1e8);
        pool.supply(address(cirBTC), 1e8);
        pool.borrow(address(usdc), 10_000e6);

        // Repay with a business reference memo
        bytes memory memo = bytes("INV-2026-0042");
        usdc.approve(address(pool), 10_000e6);
        vm.expectEmit(true, true, true, false);
        emit ILendingPool.Repay(bob, address(usdc), 10_000e6, 0, memo);
        pool.repay(address(usdc), 10_000e6, memo);
        vm.stopPrank();
    }

    // -------------------------------------------------------------------------
    // Health factor tests
    // -------------------------------------------------------------------------

    function test_health_factor_no_debt() public view {
        (uint256 hf, bool healthy) = pool.getHealthFactor(alice);
        assertEq(hf, type(uint256).max, "no debt => max HF");
        assertTrue(healthy);
    }

    function test_health_factor_after_borrow() public {
        vm.startPrank(alice);
        usdc.approve(address(pool), 50_000e6);
        pool.supply(address(usdc), 50_000e6);
        vm.stopPrank();

        vm.startPrank(bob);
        cirBTC.approve(address(pool), 1e8);
        pool.supply(address(cirBTC), 1e8);
        pool.borrow(address(usdc), 30_000e6);
        vm.stopPrank();

        (uint256 hf, bool healthy) = pool.getHealthFactor(bob);
        assertTrue(healthy, "should be healthy");
        // collateralValue * liqThreshold / debt = 95000 * 0.78 / 30000 = 2.47
        assertGt(hf, RAY, "HF > 1");
    }

    // -------------------------------------------------------------------------
    // Interest accrual tests
    // -------------------------------------------------------------------------

    function test_interest_accrues_over_time() public {
        vm.startPrank(alice);
        usdc.approve(address(pool), 50_000e6);
        pool.supply(address(usdc), 50_000e6);
        vm.stopPrank();

        vm.startPrank(bob);
        cirBTC.approve(address(pool), 1e8);
        pool.supply(address(cirBTC), 1e8);
        pool.borrow(address(usdc), 30_000e6);
        vm.stopPrank();

        uint256 debtBefore = pool.getUserDebt(bob, address(usdc));

        // Fast-forward 30 days
        skip(30 days);
        pool.accrueInterest(address(usdc));

        uint256 debtAfter = pool.getUserDebt(bob, address(usdc));
        assertGt(debtAfter, debtBefore, "debt grew with interest");
    }

    function test_supply_index_increases() public {
        vm.startPrank(alice);
        usdc.approve(address(pool), 50_000e6);
        pool.supply(address(usdc), 50_000e6);
        vm.stopPrank();

        vm.startPrank(bob);
        cirBTC.approve(address(pool), 1e8);
        pool.supply(address(cirBTC), 1e8);
        pool.borrow(address(usdc), 30_000e6);
        vm.stopPrank();

        uint256 idxBefore = pool.getSupplyIndex(address(usdc));
        skip(365 days);
        pool.accrueInterest(address(usdc));
        uint256 idxAfter = pool.getSupplyIndex(address(usdc));
        assertGt(idxAfter, idxBefore, "supply index increased");
    }

    // -------------------------------------------------------------------------
    // Liquidation tests
    // -------------------------------------------------------------------------

    function test_liquidation_basic() public {
        usdc.mint(alice, 150_000e6);
        vm.startPrank(alice);
        usdc.approve(address(pool), 150_000e6);
        pool.supply(address(usdc), 150_000e6);
        vm.stopPrank();

        vm.startPrank(bob);
        cirBTC.approve(address(pool), 1e8);
        pool.supply(address(cirBTC), 1e8);
        pool.borrow(address(usdc), 60_000e6); // borrow near LTV
        vm.stopPrank();

        // Crash BTC price so position becomes liquidatable
        oracle.setPrice(address(cirBTC), 50_000e18); // $50k (was $95k)
        pool.accrueInterest(address(usdc));

        (uint256 hf,) = pool.getHealthFactor(bob);
        assertLt(hf, RAY, "position should be liquidatable");

        // Carol liquidates
        uint256 carolUsdcBefore = usdc.balanceOf(carol);
        vm.startPrank(carol);
        usdc.approve(address(pool), 30_000e6); // repay 50% (close factor)
        pool.liquidate(bob, address(usdc), address(cirBTC), 30_000e6);
        vm.stopPrank();

        // Carol spent USDC but gained cirBTC
        assertLt(usdc.balanceOf(carol), carolUsdcBefore, "carol spent USDC");
        assertGt(cirBTC.balanceOf(carol), 0, "carol received cirBTC");
    }

    function test_liquidation_healthy_position_reverts() public {
        usdc.mint(alice, 150_000e6);
        vm.startPrank(alice);
        usdc.approve(address(pool), 150_000e6);
        pool.supply(address(usdc), 150_000e6);
        vm.stopPrank();

        vm.startPrank(bob);
        cirBTC.approve(address(pool), 1e8);
        pool.supply(address(cirBTC), 1e8);
        pool.borrow(address(usdc), 10_000e6); // very safe
        vm.stopPrank();

        vm.startPrank(carol);
        usdc.approve(address(pool), 5_000e6);
        vm.expectRevert("LP: position is healthy");
        pool.liquidate(bob, address(usdc), address(cirBTC), 5_000e6);
        vm.stopPrank();
    }

    // -------------------------------------------------------------------------
    // Blocklist resilience tests
    // -------------------------------------------------------------------------

    function test_blocklist_liquidation_claim_pattern() public {
        usdc.mint(alice, 150_000e6);
        vm.startPrank(alice);
        usdc.approve(address(pool), 150_000e6);
        pool.supply(address(usdc), 150_000e6);
        vm.stopPrank();

        vm.startPrank(bob);
        cirBTC.approve(address(pool), 1e8);
        pool.supply(address(cirBTC), 1e8);
        pool.borrow(address(usdc), 60_000e6);
        vm.stopPrank();

        // Make position liquidatable
        oracle.setPrice(address(cirBTC), 50_000e18);

        // Blocklist carol AFTER the liquidation debt is accepted
        // (simulate: carol initiates liquidation, then collateral transfer fails)
        // We blocklist carol on the cirBTC contract BEFORE the liquidate call
        cirBTC.setBlocklisted(carol, true);

        vm.startPrank(carol);
        usdc.approve(address(pool), 30_000e6);
        // Liquidation should succeed: debt accepted, collateral goes to pendingCollateral
        pool.liquidate(bob, address(usdc), address(cirBTC), 30_000e6);
        vm.stopPrank();

        // Carol should have pending collateral
        assertGt(pool.pendingCollateral(carol, address(cirBTC)), 0, "pending collateral recorded");

        // Unblock carol, then claim
        cirBTC.setBlocklisted(carol, false);
        vm.prank(carol);
        pool.claimPendingCollateral(address(cirBTC));

        assertGt(cirBTC.balanceOf(carol), 0, "carol received collateral after unblock");
        assertEq(pool.pendingCollateral(carol, address(cirBTC)), 0, "pending cleared");
    }

    function test_blocklisted_supplier_cannot_withdraw() public {
        vm.startPrank(alice);
        usdc.approve(address(pool), 10_000e6);
        pool.supply(address(usdc), 10_000e6);
        vm.stopPrank();

        // Alice gets blocklisted
        usdc.setBlocklisted(alice, true);

        vm.prank(alice);
        vm.expectRevert("LP: transferOut failed");
        pool.withdraw(address(usdc), 10_000e6);

        // Her sTokens and shares are intact
        assertGt(sUSDC.sharesOf(alice), 0, "shares intact after blocked withdraw");
    }

    // -------------------------------------------------------------------------
    // Decimal precision tests
    // -------------------------------------------------------------------------

    function test_6dec_and_8dec_positions_independent() public {
        // Alice supplies USDC (6 dec), Bob supplies cirBTC (8 dec)
        vm.startPrank(alice);
        usdc.approve(address(pool), 50_000e6);
        pool.supply(address(usdc), 50_000e6);
        vm.stopPrank();

        vm.startPrank(bob);
        cirBTC.approve(address(pool), 1e8); // 1.00000000 BTC
        pool.supply(address(cirBTC), 1e8);
        vm.stopPrank();

        // Supply amounts recorded correctly
        assertEq(pool.getUserSupply(alice, address(usdc)),   50_000e6, "USDC supply 6dec");
        assertEq(pool.getUserSupply(bob,   address(cirBTC)), 1e8,      "cirBTC supply 8dec");
    }

    function test_health_factor_cross_decimal_assets() public {
        // Bob deposits cirBTC (8 dec, $95k) and borrows USDC (6 dec)
        vm.startPrank(alice);
        usdc.approve(address(pool), 100_000e6);
        pool.supply(address(usdc), 100_000e6);
        vm.stopPrank();

        vm.startPrank(bob);
        cirBTC.approve(address(pool), 1e8);
        pool.supply(address(cirBTC), 1e8);
        pool.borrow(address(usdc), 40_000e6);
        vm.stopPrank();

        (uint256 hf,) = pool.getHealthFactor(bob);
        // Expected: (95000 * 0.78) / 40000 = 1.8525 Ray
        assertGt(hf, RAY, "HF > 1 with cross-decimal assets");
    }

    // -------------------------------------------------------------------------
    // Pause tests
    // -------------------------------------------------------------------------

    function test_paused_market_blocks_supply() public {
        pool.setMarketPaused(address(usdc), true);

        vm.startPrank(alice);
        usdc.approve(address(pool), 1_000e6);
        vm.expectRevert("LP: market paused");
        pool.supply(address(usdc), 1_000e6);
        vm.stopPrank();
    }

    function test_pause_guardian_can_pause() public {
        // This contract is pause guardian (set in SteadFiAccessControl constructor)
        pool.setMarketPaused(address(usdc), true);
        assertTrue(pool.getMarketConfig(address(usdc)).paused);
        pool.setMarketPaused(address(usdc), false);
        assertFalse(pool.getMarketConfig(address(usdc)).paused);
    }

    function test_non_guardian_cannot_pause() public {
        vm.prank(alice);
        vm.expectRevert("AC: caller missing role");
        pool.setMarketPaused(address(usdc), true);
    }

    // -------------------------------------------------------------------------
    // Withdraw tests
    // -------------------------------------------------------------------------

    function test_withdraw_full() public {
        vm.startPrank(alice);
        usdc.approve(address(pool), 1_000e6);
        pool.supply(address(usdc), 1_000e6);
        pool.withdraw(address(usdc), 1_000e6);
        vm.stopPrank();

        assertEq(pool.getUserSupply(alice, address(usdc)), 0);
    }

    function test_withdraw_with_open_debt_health_check() public {
        // Supply plenty of USDC so borrow doesn't hit liquidity cap
        usdc.mint(alice, 200_000e6);
        vm.startPrank(alice);
        usdc.approve(address(pool), 200_000e6);
        pool.supply(address(usdc), 200_000e6);
        vm.stopPrank();

        vm.startPrank(bob);
        cirBTC.approve(address(pool), 1e8);
        pool.supply(address(cirBTC), 1e8); // $95k collateral
        pool.borrow(address(usdc), 60_000e6); // within LTV but large

        // Try to withdraw all cirBTC — the LTV borrow-power guard fires first
        // (it is intentionally stricter than the liquidation-threshold check).
        vm.expectRevert("LP: exceeds borrow power (LTV)");
        pool.withdraw(address(cirBTC), 1e8);
        vm.stopPrank();
    }

    // -------------------------------------------------------------------------
    // Loan duration (fixed-term borrow) tests
    // -------------------------------------------------------------------------

    /// @dev Sets up alice as USDC lender and bob with cirBTC collateral.
    function _setupBorrower() internal {
        vm.startPrank(alice);
        usdc.approve(address(pool), 50_000e6);
        pool.supply(address(usdc), 50_000e6);
        vm.stopPrank();

        vm.startPrank(bob);
        cirBTC.approve(address(pool), 1e8);
        pool.supply(address(cirBTC), 1e8);
        vm.stopPrank();
    }

    function test_isValidDuration() public view {
        assertTrue(pool.isValidDuration(7));
        assertTrue(pool.isValidDuration(14));
        assertTrue(pool.isValidDuration(30));
        assertTrue(pool.isValidDuration(60));
        assertTrue(pool.isValidDuration(90));
        assertTrue(pool.isValidDuration(180));
        assertFalse(pool.isValidDuration(0));
        assertFalse(pool.isValidDuration(1));
        assertFalse(pool.isValidDuration(15));
        assertFalse(pool.isValidDuration(90 + 1));
        assertFalse(pool.isValidDuration(type(uint16).max));
    }

    function test_borrowWithTerm_sets_term() public {
        _setupBorrower();

        uint40 before = uint40(block.timestamp);
        vm.prank(bob);
        pool.borrowWithTerm(address(usdc), 10_000e6, 30);

        (uint40 borrowedAt, uint16 durationDays, uint40 dueTimestamp) =
            pool.getLoanTerm(bob, address(usdc));
        assertEq(borrowedAt, before, "borrowedAt = tx timestamp");
        assertEq(durationDays, 30, "duration = 30 days");
        assertEq(dueTimestamp, before + 30 days, "due = borrowedAt + 30d");
        assertFalse(pool.isLoanOverdue(bob, address(usdc)));
    }

    function test_borrowWithTerm_invalid_duration_reverts() public {
        _setupBorrower();

        vm.startPrank(bob);
        vm.expectRevert("LP: invalid duration");
        pool.borrowWithTerm(address(usdc), 10_000e6, 45);
        vm.stopPrank();

        // No debt was taken
        assertEq(pool.getUserDebt(bob, address(usdc)), 0);
    }

    function test_borrowWithTerm_emits_event() public {
        _setupBorrower();

        uint40 before = uint40(block.timestamp);
        vm.prank(bob);
        vm.expectEmit(true, true, false, true, address(pool));
        emit ILendingPool.LoanTermSet(bob, address(usdc), 10_000e6, 14, before + 14 days);
        pool.borrowWithTerm(address(usdc), 10_000e6, 14);
    }

    function test_full_repay_clears_term() public {
        _setupBorrower();

        vm.startPrank(bob);
        usdc.approve(address(pool), type(uint256).max);
        pool.borrowWithTerm(address(usdc), 10_000e6, 7);
        pool.repay(address(usdc), 10_000e6, "");
        vm.stopPrank();

        (, uint16 durationDays, uint40 dueTimestamp) = pool.getLoanTerm(bob, address(usdc));
        assertEq(uint256(durationDays), 0, "term cleared");
        assertEq(uint256(dueTimestamp), 0, "no due date");
        assertFalse(pool.isLoanOverdue(bob, address(usdc)));
    }

    function test_partial_repay_keeps_term() public {
        _setupBorrower();

        vm.startPrank(bob);
        usdc.approve(address(pool), type(uint256).max);
        pool.borrowWithTerm(address(usdc), 10_000e6, 7);
        pool.repay(address(usdc), 5_000e6, "");
        vm.stopPrank();

        (, uint16 durationDays,) = pool.getLoanTerm(bob, address(usdc));
        assertEq(uint256(durationDays), 7, "term kept while debt remains");
    }

    function test_term_overdue_after_duration() public {
        _setupBorrower();

        vm.startPrank(bob);
        pool.borrowWithTerm(address(usdc), 10_000e6, 7);
        vm.stopPrank();

        assertFalse(pool.isLoanOverdue(bob, address(usdc)));

        vm.warp(block.timestamp + 7 days + 1 seconds);
        assertTrue(pool.isLoanOverdue(bob, address(usdc)));

        // Overdue loans can still be repaid in full
        vm.startPrank(bob);
        usdc.approve(address(pool), type(uint256).max);
        pool.repay(address(usdc), type(uint256).max, "");
        vm.stopPrank();

        assertFalse(pool.isLoanOverdue(bob, address(usdc)));
    }

    function test_borrowWithTerm_overwrites_previous_term() public {
        _setupBorrower();

        vm.startPrank(bob);
        pool.borrowWithTerm(address(usdc), 10_000e6, 7);
        pool.borrowWithTerm(address(usdc), 5_000e6, 180);
        vm.stopPrank();

        (uint40 borrowedAt2, uint16 durationDays, uint40 dueTimestamp) = pool.getLoanTerm(bob, address(usdc));
        assertEq(uint256(durationDays), 180, "latest term wins");
        assertEq(dueTimestamp, borrowedAt2 + 180 days, "due from latest borrow");
    }

    function test_liquidation_full_clear_clears_term() public {
        _setupBorrower();
        // Extra USDC liquidity so bob can borrow at max LTV
        usdc.mint(alice, 100_000e6);
        vm.startPrank(alice);
        usdc.approve(address(pool), 100_000e6);
        pool.supply(address(usdc), 100_000e6);
        vm.stopPrank();

        // One liquidation clears the whole position when closeFactor = 100%
        pool.setRiskParams(address(usdc), 0, 0, 500, 1000, 10_000, 10_000_000e6, 8_000_000e6);

        // Bob borrows at max LTV, then price drops so HF < 1
        vm.startPrank(bob);
        pool.borrowWithTerm(address(usdc), 66_500e6, 30); // 70% of $95k
        vm.stopPrank();
        oracle.setPrice(address(cirBTC), BTC_PRICE * 75 / 100); // -25% => HF ~ 0.936 < 1

        (, uint16 beforeDays,) = pool.getLoanTerm(bob, address(usdc));
        assertEq(uint256(beforeDays), 30, "term set before liquidation");

        vm.startPrank(carol);
        usdc.approve(address(pool), type(uint256).max);
        pool.liquidate(bob, address(usdc), address(cirBTC), type(uint256).max);
        vm.stopPrank();

        assertEq(pool.getUserDebt(bob, address(usdc)), 0, "debt fully liquidated");
        (, uint16 afterDays, uint40 afterDue) = pool.getLoanTerm(bob, address(usdc));
        assertEq(uint256(afterDays), 0, "term cleared by liquidation");
        assertEq(uint256(afterDue), 0);
    }

    function test_partial_liquidation_keeps_term() public {
        _setupBorrower();

        vm.startPrank(bob);
        pool.borrowWithTerm(address(usdc), 30_000e6, 30);
        vm.stopPrank();
        oracle.setPrice(address(cirBTC), BTC_PRICE * 38 / 100); // HF ~ 0.94 < 1

        // Default closeFactor 50%: half the debt is repaid, half remains
        vm.startPrank(carol);
        usdc.approve(address(pool), type(uint256).max);
        pool.liquidate(bob, address(usdc), address(cirBTC), type(uint256).max);
        vm.stopPrank();

        assertEq(pool.getUserDebt(bob, address(usdc)), 15_000e6, "half the debt remains");
        (, uint16 durationDays,) = pool.getLoanTerm(bob, address(usdc));
        assertEq(uint256(durationDays), 30, "term kept while debt remains");
    }

    function test_plain_borrow_has_no_term() public {
        _setupBorrower();

        vm.prank(bob);
        pool.borrow(address(usdc), 10_000e6);

        (, uint16 durationDays, uint40 dueTimestamp) = pool.getLoanTerm(bob, address(usdc));
        assertEq(uint256(durationDays), 0, "plain borrow is open-ended");
        assertEq(uint256(dueTimestamp), 0);
        assertFalse(pool.isLoanOverdue(bob, address(usdc)));
    }
}
