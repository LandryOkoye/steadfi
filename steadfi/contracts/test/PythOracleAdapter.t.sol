// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {PythOracleAdapter, IPythLazer} from "../src/PythOracleAdapter.sol";

/// @dev Minimal Pyth Pro verifier stand-in. It returns a pre-built signed payload,
///      so the tests exercise the adapter's real ABI, fee path and parser.
contract MockPythLazer is IPythLazer {
    bytes public payload;
    uint256 public override verification_fee = 1;

    function setPayload(bytes calldata p) external {
        payload = p;
    }

    function setFee(uint256 f) external {
        verification_fee = f;
    }

    function verifyUpdate(bytes calldata) external payable override returns (bytes memory, address) {
        require(msg.value >= verification_fee, "Insufficient fee provided");
        return (payload, address(this));
    }
}

contract PythOracleAdapterTest is Test {
    PythOracleAdapter adapter;
    MockPythLazer pyth;

    address constant CIRBTC = address(0xB7C);
    address constant WETH   = address(0x3E7);
    address constant EURC   = address(0xE0C);
    address constant USDC   = 0x3600000000000000000000000000000000000000;

    uint32 constant BTC_FEED = 1;
    uint32 constant ETH_FEED = 2;
    uint32 constant EUR_FEED = 327;

    function setUp() public {
        pyth = new MockPythLazer();
        adapter = new PythOracleAdapter(address(this), address(pyth));
        adapter.setFeed(CIRBTC, BTC_FEED, 300);
        adapter.setFeed(WETH, ETH_FEED, 300);
        adapter.setFeed(EURC, EUR_FEED, 300);
    }

    function _payload(
        uint32 feedId,
        int64 price,
        int16 expo,
        uint64 conf,
        uint64 publishTimeSec
    ) internal view returns (bytes memory) {
        return abi.encodePacked(
            uint32(2_479_346_549),          // LAZR payload magic
            uint64(block.timestamp),        // payload timestamp (seconds)
            uint8(1),                       // channel
            uint8(1),                       // feeds length
            feedId,
            uint8(4),                       // number of properties
            uint8(0), price,                // Price
            uint8(4), expo,                 // Exponent
            uint8(5), conf,                 // Confidence
            uint8(12), uint8(1), publishTimeSec * 1_000_000 // FeedUpdateTimestamp (us)
        );
    }

    function test_update_and_getPrice_normalises_to_1e18() public {
        pyth.setPayload(_payload(BTC_FEED, 8_191_200_000_000, -8, 8_191_200_000, uint64(block.timestamp)));
        uint256 updated = adapter.updatePrices{value: 1}(hex"00");

        assertEq(updated, 1);
        assertEq(adapter.getPrice(CIRBTC), 81_912e18);
        assertTrue(adapter.isHealthy(CIRBTC));
    }

    function test_getPrice_usdc_is_one_dollar() public view {
        assertEq(adapter.getPrice(USDC), 1e18);
    }

    function test_getPrice_reverts_when_stale() public {
        pyth.setPayload(_payload(BTC_FEED, 8_191_200_000_000, -8, 8_191_200_000, uint64(block.timestamp)));
        adapter.updatePrices{value: 1}(hex"00");

        vm.warp(block.timestamp + 301);
        vm.expectRevert("PY: stale price");
        adapter.getPrice(CIRBTC);
        assertFalse(adapter.isHealthy(CIRBTC));
    }

    function test_getPrice_reverts_when_feed_missing() public {
        vm.expectRevert("PY: no price");
        adapter.getPrice(address(0xDEAD));
    }

    function test_update_reverts_when_confidence_too_wide() public {
        // 10% confidence interval vs 2% guard.
        pyth.setPayload(_payload(BTC_FEED, 8_191_200_000_000, -8, 819_120_000_000, uint64(block.timestamp)));
        vm.expectRevert("PY: confidence too wide");
        adapter.updatePrices{value: 1}(hex"00");
    }

    function test_replay_of_older_payload_is_ignored() public {
        uint64 nowTs = uint64(block.timestamp);
        pyth.setPayload(_payload(BTC_FEED, 81_912_000_000_000, -8, 8_191_200_000, nowTs));
        adapter.updatePrices{value: 1}(hex"00");

        pyth.setPayload(_payload(BTC_FEED, 70_000_000_000_000, -8, 8_191_200_000, nowTs - 1));
        vm.expectRevert("PY: no fresh configured feeds");
        adapter.updatePrices{value: 1}(hex"00");

        assertEq(adapter.getPrice(CIRBTC), 819_120e18);
    }

    function test_eurc_uses_eur_usd_feed() public {
        pyth.setPayload(_payload(EUR_FEED, 116_000_000, -8, 116_000, uint64(block.timestamp)));
        adapter.updatePrices{value: 1}(hex"00");
        assertEq(adapter.getPrice(EURC), 1.16e18);
    }

    function test_setFeed_only_risk_admin() public {
        vm.prank(address(0xBEEF));
        vm.expectRevert("AC: caller missing role");
        adapter.setFeed(WETH, 42, 300);
    }

    function test_setMaxConfidenceBps() public {
        adapter.setMaxConfidenceBps(500);
        assertEq(adapter.maxConfidenceBps(), 500);
        vm.expectRevert("PY: bad bps");
        adapter.setMaxConfidenceBps(0);
    }
}
