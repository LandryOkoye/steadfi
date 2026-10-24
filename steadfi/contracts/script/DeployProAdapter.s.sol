// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script, console} from "forge-std/Script.sol";
import {PythOracleAdapter} from "../src/PythOracleAdapter.sol";
import {ILendingPool} from "../src/interfaces/ILendingPool.sol";

/// @notice Deploys the Pyth Pro adapter and points the existing pool markets at it.
///         Run from the repo root:
///           forge script steadfi/contracts/script/DeployProAdapter.s.sol:DeployProAdapter \
///             --rpc-url https://rpc.testnet.arc.io \
///             --private-key $DEPLOYER_PRIVATE_KEY --broadcast
contract DeployProAdapter is Script {
    address constant POOL    = 0x252E8662C945e340195B35816a3f9259CA264e8C;
    address constant USDC    = 0x3600000000000000000000000000000000000000;
    address constant EURC    = 0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a;
    address constant CIR_BTC = 0xf0C4a4CE82A5746AbAAd9425360Ab04fbBA432BF;
    address constant WETH    = 0x2c4047028a72803939b6fb674D01bC059B5C4961;

    address constant PYTH_PRO = 0xACeA761c27A909d4D3895128EBe6370FDE2dF481;

    function run() external {
        require(block.chainid == 5042002, "Wrong chain: expected Arc Testnet (5042002)");

        vm.startBroadcast();
        address deployer = msg.sender;

        PythOracleAdapter oracle = new PythOracleAdapter(deployer, PYTH_PRO);
        oracle.setFeed(CIR_BTC, 1,   300); // BTC/USD
        oracle.setFeed(WETH,    2,   300); // ETH/USD
        oracle.setFeed(EURC,    327, 300); // EUR/USD
        console.log("PythOracleAdapter:", address(oracle));

        ILendingPool pool = ILendingPool(POOL);
        pool.setOracle(USDC,    address(oracle));
        pool.setOracle(EURC,    address(oracle));
        pool.setOracle(CIR_BTC, address(oracle));
        pool.setOracle(WETH,    address(oracle));

        vm.stopBroadcast();

        console.log("Pool oracle wired for USDC/EURC/cirBTC/WETH");
    }
}
