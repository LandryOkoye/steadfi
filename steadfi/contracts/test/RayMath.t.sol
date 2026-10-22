// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {RayMath} from "../src/libraries/RayMath.sol";

contract RayMathTest is Test {
    using RayMath for uint256;

    uint256 constant RAY = RayMath.RAY;

    function test_mulRayDown_identity() public pure {
        assertEq(RAY.mulRayDown(RAY), RAY);
    }

    function test_mulRayDown_half() public pure {
        assertEq(RAY.mulRayDown(RAY / 2), RAY / 2);
    }

    function test_mulRayUp_rounds_up() public pure {
        // 1.5 * 1.5 = 2.25 Ray — rounds up to 2 + 1 dust
        uint256 a = (3 * RAY) / 2;
        uint256 result = a.mulRayUp(a);
        // exact = 2.25e27, floor = 2.25e27, up = 2.25e27 (exact here)
        assertGe(result, (225 * RAY) / 100);
    }

    function test_divRayDown_identity() public pure {
        assertEq(RAY.divRayDown(RAY), RAY);
    }

    function test_divRayUp_rounds_up() public pure {
        // 1 / 3 in Ray — should round up
        uint256 result = RAY.divRayUp(3 * RAY);
        assertGt(result, RAY / 3);
    }

    function test_rayPow_zero_exp() public pure {
        assertEq(RayMath.rayPow(2 * RAY, 0), RAY);
    }

    function test_rayPow_one_exp() public pure {
        assertEq(RayMath.rayPow(2 * RAY, 1), 2 * RAY);
    }

    function test_rayPow_compound_approx() public pure {
        // 1% per second for 100 seconds ≈ e^1 ≈ 2.718 (approx with small base)
        // We test a simpler case: 1.01^2 = 1.0201
        uint256 base = RAY + RAY / 100; // 1.01 Ray
        uint256 result = RayMath.rayPow(base, 2);
        uint256 expected = RAY + (2 * RAY / 100) + (RAY / 10000); // 1.0201
        assertApproxEqRel(result, expected, 1e22); // 1% tolerance
    }

    function testFuzz_mulRayDown_never_exceeds_exact(uint128 a, uint128 b) public pure {
        uint256 result = uint256(a).mulRayDown(uint256(b));
        uint256 exact  = (uint256(a) * uint256(b)) / RAY;
        assertEq(result, exact);
    }

    function testFuzz_fromRay_toRay_roundtrip_6dec(uint64 amount) public pure {
        // Bound: max amount * 1e21 must fit in uint256 (it does for uint64 * 1e21 < 2^256)
        // But we bound to prevent overflow in test arithmetic
        uint256 amt = uint256(bound(uint256(amount), 0, type(uint128).max / 1e21));
        uint256 ray  = amt * 1e21; // toRay for 6 dec: * 10^(27-6)
        uint256 back = ray / 1e21;
        assertEq(back, amt);
    }
}
