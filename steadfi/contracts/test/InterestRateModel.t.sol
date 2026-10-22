// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {InterestRateModel} from "../src/InterestRateModel.sol";
import {RayMath} from "../src/libraries/RayMath.sol";

contract InterestRateModelTest is Test {
    using RayMath for uint256;

    InterestRateModel irm;
    uint256 constant RAY = RayMath.RAY;

    // 0% base, 8% slope1, 100% slope2, 90% kink
    function setUp() public {
        irm = new InterestRateModel(0, 0.08e27, 1.00e27, 0.90e27);
    }

    function test_zero_utilization_rate() public view {
        uint256 rate = irm.getBorrowRatePerSecond(100e27, 0);
        assertEq(rate, 0, "0% at 0 utilization");
    }

    function test_rate_at_kink_is_8pct_annual() public view {
        // At exactly 90% utilization: borrowRate = 8% / year
        uint256 supply = 100e27;
        uint256 debt   = 90e27;   // 90% utilization
        uint256 ratePerSec = irm.getBorrowRatePerSecond(supply, debt);
        uint256 annualRate = ratePerSec * 365 days;
        // Should be exactly 8% Ray = 0.08e27
        assertApproxEqRel(annualRate, 0.08e27, 1e22); // within 1%
    }

    function test_rate_above_kink_jumps() public view {
        // At 95% utilization, rate should be >> 8%
        uint256 supply = 100e27;
        uint256 debt   = 95e27;
        uint256 ratePerSec = irm.getBorrowRatePerSecond(supply, debt);
        uint256 annualRate = ratePerSec * 365 days;
        assertGt(annualRate, 0.08e27, "rate jumps above kink");
        // Expected: 8% + (5/10) * 100% = 58%
        assertApproxEqRel(annualRate, 0.58e27, 1e22);
    }

    function test_supply_rate_below_borrow_rate() public view {
        uint256 supply = 100e27;
        uint256 debt   = 90e27;
        uint256 borrowRate = irm.getBorrowRatePerSecond(supply, debt);
        uint256 supplyRate = irm.getSupplyRatePerSecond(supply, debt, 1000); // 10% reserve
        assertLt(supplyRate, borrowRate, "supply rate < borrow rate");
    }

    function test_supply_rate_at_kink() public view {
        // Supply APY = borrowRate * utilization * (1 - reserveFactor)
        // = 8% * 90% * 90% = 6.48%
        uint256 supply = 100e27;
        uint256 debt   = 90e27;
        uint256 supplyRatePerSec = irm.getSupplyRatePerSecond(supply, debt, 1000);
        uint256 annualSupplyRate = supplyRatePerSec * 365 days;
        assertApproxEqRel(annualSupplyRate, 0.0648e27, 1e22);
    }

    function test_utilization_capped_at_100pct() public view {
        // debt > supply should return RAY (100%)
        uint256 util = irm.getUtilization(10e27, 20e27);
        assertEq(util, RAY, "util capped at 100%");
    }

    function test_utilization_zero_supply() public view {
        uint256 util = irm.getUtilization(0, 0);
        assertEq(util, 0, "zero supply => zero util");
    }

    function testFuzz_borrow_rate_monotone(uint256 util1, uint256 util2) public view {
        util1 = bound(util1, 0, RAY);
        util2 = bound(util2, 0, RAY);
        vm.assume(util1 < util2);

        uint256 supply = RAY; // 1 Ray supply
        uint256 debt1  = util1;
        uint256 debt2  = util2;

        uint256 rate1 = irm.getBorrowRatePerSecond(supply, debt1);
        uint256 rate2 = irm.getBorrowRatePerSecond(supply, debt2);
        assertGe(rate2, rate1, "rate monotonically increases with utilization");
    }
}
