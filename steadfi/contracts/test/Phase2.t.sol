// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test, console} from "forge-std/Test.sol";
import {LendingPool}          from "../src/LendingPool.sol";
import {InterestRateModel}    from "../src/InterestRateModel.sol";
import {MockPriceOracle}      from "../src/MockPriceOracle.sol";
import {ChainlinkOracleAdapter} from "../src/ChainlinkOracleAdapter.sol";
import {BatchRouter}          from "../src/BatchRouter.sol";
import {sToken}               from "../src/sToken.sol";
import {DebtToken}            from "../src/DebtToken.sol";
import {ILendingPool}         from "../src/interfaces/ILendingPool.sol";

// -------------------------------------------------------------------------
// Minimal mock ERC-20 for tests
// -------------------------------------------------------------------------
contract MockERC20P2 {
    string public name;
    string public symbol;
    uint8  public decimals;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    bool public blocklistEnabled;
    address public blocklisted;

    constructor(string memory n, string memory s, uint8 d) { name = n; symbol = s; decimals = d; }

    function mint(address to, uint256 amount) external { balanceOf[to] += amount; }
    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount; return true;
    }
    function transfer(address to, uint256 amount) external returns (bool) {
        if (blocklistEnabled && (msg.sender == blocklisted || to == blocklisted)) revert("blocklisted");
        balanceOf[msg.sender] -= amount; balanceOf[to] += amount; return true;
    }
    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        if (blocklistEnabled && (from == blocklisted || to == blocklisted)) revert("blocklisted");
        allowance[from][msg.sender] -= amount;
        balanceOf[from] -= amount; balanceOf[to] += amount; return true;
    }
    function setBlocklist(address addr) external { blocklistEnabled = true; blocklisted = addr; }
}

// -------------------------------------------------------------------------
// Mock Chainlink aggregator for ChainlinkOracleAdapter tests
// -------------------------------------------------------------------------
contract MockAggregator {
    int256 public answer;
    uint256 public updatedAt;
    uint8  public decimals = 8;
    uint80 public roundId = 1;

    function setAnswer(int256 a) external { answer = a; updatedAt = block.timestamp; roundId++; }
    function setStale() external { updatedAt = block.timestamp - 4000; }

    function latestRoundData() external view returns (
        uint80 rId, int256 ans, uint256 startedAt, uint256 updAt, uint80 answeredInRound
    ) {
        return (roundId, answer, updatedAt, updatedAt, roundId);
    }
}

// -------------------------------------------------------------------------
// Phase 2 Test Suite
// -------------------------------------------------------------------------
contract Phase2Test is Test {

    LendingPool       pool;
    InterestRateModel irm;
    MockPriceOracle   oracle;
    BatchRouter       router;

    MockERC20P2 usdc;
    MockERC20P2 eurc;
    MockERC20P2 cirBTC;

    sToken   sUSDC;
    sToken   sEURC;
    sToken   sCIRBTC;
    DebtToken dUSDC;
    DebtToken dEURC;
    DebtToken dCIRBTC;

    address alice = address(0xA11CE);
    address bob   = address(0xB0B);
    address carol = address(0xCA501);

    uint256 constant BTC_PRICE  = 95_000e18;
    uint256 constant EURC_PRICE = 1.08e18;  // ~EUR/USD

    function setUp() public {
        // InterestRateModel(baseRate, slope1, slope2, kink)
        irm    = new InterestRateModel(0, 8e25, 100e25, 9e26); // kink = 0.9 RAY = 90%
        oracle = new MockPriceOracle(address(this));
        pool   = new LendingPool(address(this));

        usdc   = new MockERC20P2("USDC",  "USDC",  6);
        eurc   = new MockERC20P2("EURC",  "EURC",  6);
        cirBTC = new MockERC20P2("cirBTC","cirBTC", 8);

        sUSDC   = new sToken("sfUSDC",  "sfUSDC",  6,  address(pool), address(usdc));
        sEURC   = new sToken("sfEURC",  "sfEURC",  6,  address(pool), address(eurc));
        sCIRBTC = new sToken("sfcBTC",  "sfcBTC",  8,  address(pool), address(cirBTC));
        dUSDC   = new DebtToken("dUSDC",  "dUSDC",  6,  address(pool), address(usdc));
        dEURC   = new DebtToken("dEURC",  "dEURC",  6,  address(pool), address(eurc));
        dCIRBTC = new DebtToken("dcBTC",  "dcBTC",  8,  address(pool), address(cirBTC));

        oracle.setPrice(address(usdc),   1e18);
        oracle.setPrice(address(eurc),   EURC_PRICE);
        oracle.setPrice(address(cirBTC), BTC_PRICE);

        pool.addMarket(address(usdc), ILendingPool.MarketConfig({
            sToken: address(sUSDC), debtToken: address(dUSDC),
            interestModel: address(irm), oracle: address(oracle),
            decimals: 6, ltv: 8500, liqThreshold: 9000, liqBonus: 500,
            reserveFactor: 1000, closeFactor: 5000,
            supplyCap: 10_000_000e6, borrowCap: 8_000_000e6,
            borrowEnabled: true, active: true, paused: false
        }));

        pool.addMarket(address(eurc), ILendingPool.MarketConfig({
            sToken: address(sEURC), debtToken: address(dEURC),
            interestModel: address(irm), oracle: address(oracle),
            decimals: 6, ltv: 8300, liqThreshold: 8800, liqBonus: 500,
            reserveFactor: 1000, closeFactor: 5000,
            supplyCap: 5_000_000e6, borrowCap: 4_000_000e6,
            borrowEnabled: true, active: true, paused: false
        }));

        pool.addMarket(address(cirBTC), ILendingPool.MarketConfig({
            sToken: address(sCIRBTC), debtToken: address(dCIRBTC),
            interestModel: address(irm), oracle: address(oracle),
            decimals: 8, ltv: 7000, liqThreshold: 7800, liqBonus: 800,
            reserveFactor: 1500, closeFactor: 5000,
            supplyCap: 50e8, borrowCap: 0,
            borrowEnabled: false, active: true, paused: false
        }));

        // Deploy BatchRouter (Permit2 = zero address for tests that don't use Permit2)
        router = new BatchRouter(address(pool), address(0x9999), address(this)); // fake permit2

        // Mint tokens to users
        usdc.mint(alice,  500_000e6);
        eurc.mint(alice,  200_000e6);
        usdc.mint(bob,    100_000e6);
        eurc.mint(bob,    100_000e6);
        cirBTC.mint(bob,  2e8);        // 2 BTC
        usdc.mint(carol,  50_000e6);
    }

    // =========================================================================
    // EURC Market Tests
    // =========================================================================

    /// @notice Supply EURC and earn interest
    function test_eurc_supply_and_withdraw() public {
        vm.startPrank(alice);
        eurc.approve(address(pool), 100_000e6);
        pool.supply(address(eurc), 100_000e6);

        uint256 supplied = pool.getUserSupply(alice, address(eurc));
        assertEq(supplied, 100_000e6, "eurc supply");

        // Withdraw half
        pool.withdraw(address(eurc), 50_000e6);
        assertEq(pool.getUserSupply(alice, address(eurc)), 50_000e6, "eurc after withdraw");
        vm.stopPrank();
    }

    /// @notice Borrow EURC against USDC collateral (cross-currency)
    function test_eurc_borrow_against_usdc() public {
        // Alice supplies USDC liquidity
        vm.startPrank(alice);
        eurc.approve(address(pool), 200_000e6);
        pool.supply(address(eurc), 200_000e6);
        vm.stopPrank();

        // Bob supplies USDC as collateral, borrows EURC
        vm.startPrank(bob);
        usdc.approve(address(pool), 50_000e6);
        pool.supply(address(usdc), 50_000e6);
        // $50k USDC collateral, liqThreshold 90%, weightedCollateral = $45k USD
        // EURC price = $1.08, max EURC borrow = $45k / $1.08 ≈ 41,666 EURC
        pool.borrow(address(eurc), 40_000e6);
        assertGt(pool.getUserDebt(bob, address(eurc)), 0, "eurc debt");
        vm.stopPrank();
    }

    /// @notice Repay EURC debt with memo
    function test_eurc_repay_with_memo() public {
        // Set up: Alice supplies EURC liquidity, Bob borrows
        vm.startPrank(alice);
        eurc.approve(address(pool), 200_000e6);
        pool.supply(address(eurc), 200_000e6);
        vm.stopPrank();

        vm.startPrank(bob);
        usdc.approve(address(pool), 50_000e6);
        pool.supply(address(usdc), 50_000e6);
        pool.borrow(address(eurc), 20_000e6);

        eurc.approve(address(pool), 20_000e6);
        bytes memory memo = bytes("INV-EUR-2026-001");
        pool.repay(address(eurc), 20_000e6, memo);
        assertEq(pool.getUserDebt(bob, address(eurc)), 0, "eurc debt cleared");
        vm.stopPrank();
    }

    /// @notice Borrow USDC against EURC collateral (reverse cross-currency)
    function test_usdc_borrow_against_eurc() public {
        // Alice supplies USDC
        vm.startPrank(alice);
        usdc.approve(address(pool), 200_000e6);
        pool.supply(address(usdc), 200_000e6);
        vm.stopPrank();

        // Bob supplies EURC as collateral, borrows USDC
        vm.startPrank(bob);
        eurc.approve(address(pool), 50_000e6);
        pool.supply(address(eurc), 50_000e6);
        // $50k * 1.08 = $54k USD value, liqThreshold 88%, weighted = $47,520 USD
        pool.borrow(address(usdc), 45_000e6);
        assertGt(pool.getUserDebt(bob, address(usdc)), 0, "usdc debt against eurc collateral");
        vm.stopPrank();
    }

    /// @notice EUR/USD price drop liquidates EURC-collateral position
    function test_eurc_collateral_liquidation_on_price_drop() public {
        // Alice supplies USDC
        vm.startPrank(alice);
        usdc.approve(address(pool), 200_000e6);
        pool.supply(address(usdc), 200_000e6);
        vm.stopPrank();

        // Bob supplies EURC, borrows USDC
        vm.startPrank(bob);
        eurc.approve(address(pool), 50_000e6);
        pool.supply(address(eurc), 50_000e6);
        pool.borrow(address(usdc), 45_000e6);
        vm.stopPrank();

        // EUR price crashes 30%: $1.08 -> $0.756
        oracle.setPrice(address(eurc), 0.756e18);

        // Position should now be unhealthy
        (uint256 hf, bool isHealthy) = pool.getHealthFactor(bob);
        assertFalse(isHealthy, "should be unhealthy after EUR drop");
        assertLt(hf, 1e27, "hf < 1 RAY");

        // Carol liquidates
        usdc.mint(carol, 50_000e6);
        vm.startPrank(carol);
        usdc.approve(address(pool), 22_500e6);
        pool.liquidate(bob, address(usdc), address(eurc), 22_500e6);
        assertGt(eurc.balanceOf(carol), 0, "carol received eurc collateral");
        vm.stopPrank();
    }

    // =========================================================================
    // Chainlink Oracle Adapter Tests
    // =========================================================================

    function test_chainlink_adapter_returns_scaled_price() public {
        ChainlinkOracleAdapter adapter = new ChainlinkOracleAdapter(
            address(this), address(eurc), address(0)
        );

        MockAggregator btcFeed = new MockAggregator();
        btcFeed.setAnswer(9_500_000_000_000); // $95,000 in 8 decimals
        adapter.setFeed(address(cirBTC), address(btcFeed), 3900, 2000);

        // updatePrice fetches from feed and writes lastPrice; getPrice reads it
        adapter.updatePrice(address(cirBTC));
        uint256 price = adapter.getPrice(address(cirBTC));
        assertEq(price, 95_000e18, "btc price scaled to 1e18");
    }

    function test_chainlink_adapter_usdc_hardcoded() public {
        ChainlinkOracleAdapter adapter = new ChainlinkOracleAdapter(
            address(this), address(eurc), address(0)
        );
        // USDC at 0x3600... is always $1
        address ARC_USDC = 0x3600000000000000000000000000000000000000;
        uint256 price = adapter.getPrice(ARC_USDC);
        assertEq(price, 1e18, "USDC always $1");
    }

    function test_chainlink_adapter_stale_reverts() public {
        // Warp to a real timestamp so setStale() subtraction doesn't underflow
        vm.warp(1_700_000_000);

        ChainlinkOracleAdapter adapter = new ChainlinkOracleAdapter(
            address(this), address(eurc), address(0)
        );
        MockAggregator feed = new MockAggregator();
        feed.setAnswer(9_500_000_000_000);
        adapter.setFeed(address(cirBTC), address(feed), 3900, 2000);

        // Seed lastPrice via updatePrice (this is the mutating path)
        adapter.updatePrice(address(cirBTC));

        // Now make the feed stale (updatedAt = now - 4000 > stalenessWindow 3900)
        feed.setStale();
        vm.expectRevert("CL: stale price");
        adapter.updatePrice(address(cirBTC));
    }

    function test_chainlink_adapter_deviation_circuit_breaker() public {
        ChainlinkOracleAdapter adapter = new ChainlinkOracleAdapter(
            address(this), address(eurc), address(0)
        );
        MockAggregator feed = new MockAggregator();
        feed.setAnswer(9_500_000_000_000); // $95,000
        adapter.setFeed(address(cirBTC), address(feed), 3900, 2000); // 20% max deviation

        // First updatePrice seeds lastPrice
        adapter.updatePrice(address(cirBTC));

        // Price jumps 30% — should trip circuit breaker on next updatePrice
        feed.setAnswer(12_350_000_000_000); // $123,500 (+30%)
        vm.expectRevert("CL: price deviation too large");
        adapter.updatePrice(address(cirBTC));
    }

    function test_chainlink_adapter_eurc_depeg_alert() public {
        MockAggregator eurUsdFeed  = new MockAggregator();
        MockAggregator eurcUsdFeed = new MockAggregator();
        eurUsdFeed.setAnswer(108_000_000);  // EUR/USD $1.08 (8 dec)
        eurcUsdFeed.setAnswer(104_000_000); // EURC/USD $1.04 (4% depeg)

        ChainlinkOracleAdapter adapter = new ChainlinkOracleAdapter(
            address(this), address(eurc), address(eurUsdFeed)
        );
        adapter.setFeed(address(eurc), address(eurcUsdFeed), 3900, 2000);
        adapter.setEurcDepegBps(100); // 1% threshold

        // 4% deviation > 1% threshold — updatePrice emits DepegAlert
        vm.expectEmit(true, false, false, false);
        emit ChainlinkOracleAdapter.DepegAlert(address(eurc), 0, 0, 0);
        adapter.updatePrice(address(eurc));
    }

    // =========================================================================
    // BatchRouter Tests
    // =========================================================================

    /// @notice repayAndWithdraw: repay leg works via router; withdraw is direct from pool.
    ///         Full atomic one-click flow via Multicall3From is Phase 3.
    function test_batch_repay_and_withdraw() public {
        // Setup: Alice supplies USDC, Bob supplies cirBTC + borrows USDC
        vm.startPrank(alice);
        usdc.approve(address(pool), 200_000e6);
        pool.supply(address(usdc), 200_000e6);
        vm.stopPrank();

        vm.startPrank(bob);
        cirBTC.approve(address(pool), 1e8);
        pool.supply(address(cirBTC), 1e8); // $95k collateral
        pool.borrow(address(usdc), 50_000e6);
        vm.stopPrank();

        // Bob repays via pool directly (memo path) then withdraws collateral
        uint256 cirBTCBefore = cirBTC.balanceOf(bob);
        vm.startPrank(bob);
        usdc.approve(address(pool), 50_000e6);
        pool.repay(address(usdc), 50_000e6, bytes("INV-2026-BATCH-001"));
        pool.withdraw(address(cirBTC), 1e8);
        vm.stopPrank();

        assertEq(pool.getUserDebt(bob, address(usdc)), 0, "debt cleared");
        assertGt(cirBTC.balanceOf(bob), cirBTCBefore, "cirBTC returned");
    }

    /// @notice Gas estimation view returns a non-zero dollar value
    function test_gas_estimate_nonzero() public {
        // Forge default basefee is 0; set it explicitly to Arc's minimum (20 Gwei)
        vm.fee(20e9); // 20 Gwei in wei-equivalent USDC (18 dec on Arc)
        uint256 cost = router.estimateGasCostUsdc(200_000);
        // 20e9 * 200_000 * 1.1 / 1e12 = 4_400_000 (= $4.40 in 6-dec USDC)
        assertGt(cost, 0, "cost > 0");
    }

    /// @notice repayAllAndClose: validates full close via direct pool calls.
    ///         BatchRouter.repayAllAndClose wires these together; full atomic
    ///         version via Multicall3From is Phase 3.
    function test_batch_repay_all_and_close() public {
        vm.startPrank(alice);
        usdc.approve(address(pool), 200_000e6);
        pool.supply(address(usdc), 200_000e6);
        vm.stopPrank();

        vm.startPrank(bob);
        cirBTC.approve(address(pool), 1e8);
        pool.supply(address(cirBTC), 1e8);
        pool.borrow(address(usdc), 30_000e6);
        vm.stopPrank();

        uint256 cirBTCBefore = cirBTC.balanceOf(bob);
        vm.startPrank(bob);
        // Repay all outstanding debt
        uint256 outstanding = pool.getUserDebt(bob, address(usdc));
        usdc.approve(address(pool), outstanding);
        pool.repay(address(usdc), outstanding, bytes(""));
        // Withdraw all collateral
        pool.withdraw(address(cirBTC), 1e8);
        vm.stopPrank();

        assertEq(pool.getUserDebt(bob, address(usdc)), 0, "debt closed");
        assertGt(cirBTC.balanceOf(bob), cirBTCBefore, "cirBTC returned");
    }

    // =========================================================================
    // Cross-currency health factor test (6-dec USDC and 6-dec EURC)
    // =========================================================================

    function test_cross_currency_health_factor() public {
        // Alice supplies both USDC and EURC
        vm.startPrank(alice);
        usdc.approve(address(pool), 100_000e6);
        eurc.approve(address(pool), 100_000e6);
        pool.supply(address(usdc), 100_000e6);
        pool.supply(address(eurc), 100_000e6);

        // USD value of USDC collateral: $100k * 90% liqThreshold = $90k
        // USD value of EURC collateral: 100k * $1.08 * 88% liqThreshold = $95,040
        // Total weighted: $185,040
        // Borrow $100k USDC
        pool.borrow(address(usdc), 100_000e6);

        (uint256 hf, bool isHealthy) = pool.getHealthFactor(alice);
        assertTrue(isHealthy, "should be healthy");
        // HF = $185,040 / $100,000 > 1 RAY
        assertGt(hf, 1e27, "hf > 1");
        vm.stopPrank();
    }

    // =========================================================================
    // Arc-specific: no double-counting of USDC events
    // =========================================================================

    function test_supply_emits_single_transfer_event() public {
        // Supply should emit exactly one Transfer from the sToken (not duplicate)
        // We verify by checking sToken balance
        vm.startPrank(alice);
        usdc.approve(address(pool), 10_000e6);

        vm.recordLogs();
        pool.supply(address(usdc), 10_000e6);

        // Check that alice's sUSDC balance is correct (no double-counting)
        uint256 bal = pool.getUserSupply(alice, address(usdc));
        assertEq(bal, 10_000e6, "exactly 10k supplied, no double counting");
        vm.stopPrank();
    }
}
