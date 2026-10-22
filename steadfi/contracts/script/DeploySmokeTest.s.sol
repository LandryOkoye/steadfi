// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script, console} from "forge-std/Script.sol";
import {SmokeTest} from "../src/SmokeTest.sol";

/// @notice Deploys SmokeTest to Arc Testnet and writes the address to stdout.
///         Run with:
///           arc-forge script script/DeploySmokeTest.s.sol \
///             --rpc-url $ARC_TESTNET_RPC \
///             --broadcast \
///             --verify \
///             --verifier blockscout \
///             --verifier-url https://testnet.arcscan.app/api
contract DeploySmokeTest is Script {
    function run() external {
        vm.startBroadcast();

        SmokeTest smoke = new SmokeTest();

        vm.stopBroadcast();

        console.log("SmokeTest deployed at:", address(smoke));
        console.log("Chain ID:", block.chainid);

        // Verify chain
        require(block.chainid == 5042002, "Wrong chain: expected Arc Testnet (5042002)");
        console.log("Chain ID verified: Arc Testnet (5042002)");

        // Verify ping
        (string memory msg_, uint256 chainId,) = smoke.ping();
        console.log("ping():", msg_);
        console.log("ping() chainId:", chainId);
    }
}
