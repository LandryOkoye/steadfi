// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script, console} from "forge-std/Script.sol";
import {LendingPool}          from "../src/LendingPool.sol";
import {InterestRateModel}    from "../src/InterestRateModel.sol";
import {MockPriceOracle}      from "../src/MockPriceOracle.sol";
import {ChainlinkOracleAdapter} from "../src/ChainlinkOracleAdapter.sol";
import {BatchRouter}          from "../src/BatchRouter.sol";
import {sToken}               from "../src/sToken.sol";
import {DebtToken}            from "../src/DebtToken.sol";
import {ILendingPool}         from "../src/interfaces/ILendingPool.sol";

/// @notice Phase 2 deployment:
///         1. Deploys Phase 1 contracts (or reads existing addresses from env).
///         2. Adds EURC market to the LendingPool.
///         3. Deploys ChainlinkOracleAdapter (for mainnet) and BatchRouter.
///         4. Writes all addresses to stdout for deployments/testnet.json.
///
///         On testnet: MockPriceOracle is used for EURC (EUR/USD Chainlink not on testnet).
///         On mainnet: ChainlinkOracleAdapter with live feeds.
///
///         Run:
///           arc-forge script script/DeployPhase2.s.sol \
///             --rpc-url $ARC_TESTNET_RPC \
///             --broadcast --evm-version cancun
contract DeployPhase2 is Script {

    // Testnet external addresses (verified in Phase 0)
    address constant USDC_TESTNET  = 0x3600000000000000000000000000000000000000;
    address constant EURC_TESTNET  = 0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a;
    address constant CIRBTC_TESTNET = 0xf0C4a4CE82A5746AbAAd9425360Ab04fbBA432BF;
    address constant WETH_TESTNET  = 0x2c4047028a72803939b6fb674D01bC059B5C4961;
    address constant PERMIT2       = 0x000000000022D473030F116dDEE9F6B43aC78BA3;
    address constant MULTICALL3FROM = 0x522fAf9A91c41c443c66765030741e4AaCe147D0;

    function run() external {
        require(block.chainid == 5042002, "Phase2: wrong chain (expected Arc Testnet 5042002)");

        vm.startBroadcast();

        address deployer = msg.sender;

        // -----------------------------------------------------------------------
        // 1. Core contracts (Phase 1 — redeploy fresh for Phase 2 testnet)
        // -----------------------------------------------------------------------
        InterestRateModel irm = new InterestRateModel(
            0,          // baseRatePerYear (0%)
            8e25,       // slope1PerYear   (8% in Ray: 0.08 * 1e27)
            9000,       // kinkBps         (90%)
            100e25      // slope2PerYear   (100% in Ray)
        );
        console.log("InterestRateModel:", address(irm));

        MockPriceOracle oracle = new MockPriceOracle(deployer);
        // Set initial prices (testnet mock — will be replaced by Chainlink on mainnet)
        oracle.setPrice(USDC_TESTNET,  1e18);       // $1.00
        oracle.setPrice(EURC_TESTNET,  1.08e18);    // ~1.08 USD (EUR/USD approximate)
        oracle.setPrice(CIRBTC_TESTNET, 95_000e18); // $95k
        oracle.setPrice(WETH_TESTNET,  3_200e18);   // $3,200
        console.log("MockPriceOracle:", address(oracle));

        LendingPool pool = new LendingPool(deployer);
        console.log("LendingPool:", address(pool));

        // -----------------------------------------------------------------------
        // 2. sTokens and DebtTokens for all 4 markets
        // -----------------------------------------------------------------------
        sToken sUSDC    = new sToken("SteadFi USDC",  "sfUSDC",  6,  address(pool), USDC_TESTNET);
        sToken sEURC    = new sToken("SteadFi EURC",  "sfEURC",  6,  address(pool), EURC_TESTNET);
        sToken sCIRBTC  = new sToken("SteadFi cirBTC","sfcBTC",  8,  address(pool), CIRBTC_TESTNET);
        sToken sWETH    = new sToken("SteadFi WETH",  "sfWETH",  18, address(pool), WETH_TESTNET);

        DebtToken dUSDC   = new DebtToken("Debt USDC",  "dUSDC",  6,  address(pool), USDC_TESTNET);
        DebtToken dEURC   = new DebtToken("Debt EURC",  "dEURC",  6,  address(pool), EURC_TESTNET);
        DebtToken dCIRBTC = new DebtToken("Debt cirBTC","dcBTC",  8,  address(pool), CIRBTC_TESTNET);
        DebtToken dWETH   = new DebtToken("Debt WETH",  "dWETH",  18, address(pool), WETH_TESTNET);

        console.log("sUSDC:", address(sUSDC));
        console.log("sEURC:", address(sEURC));
        console.log("sCIRBTC:", address(sCIRBTC));
        console.log("sWETH:", address(sWETH));

        // -----------------------------------------------------------------------
        // 3. Add markets to LendingPool
        // -----------------------------------------------------------------------

        // USDC — supply + borrow enabled
        pool.addMarket(USDC_TESTNET, ILendingPool.MarketConfig({
            sToken: address(sUSDC), debtToken: address(dUSDC),
            interestModel: address(irm), oracle: address(oracle),
            decimals: 6, ltv: 0, liqThreshold: 0, liqBonus: 500,
            reserveFactor: 1000, closeFactor: 5000,
            supplyCap: 10_000_000e6, borrowCap: 8_000_000e6,
            borrowEnabled: true, collateralEnabled: false, active: true, paused: false
        }));

        // EURC — supply + borrow enabled (new in Phase 2)
        pool.addMarket(EURC_TESTNET, ILendingPool.MarketConfig({
            sToken: address(sEURC), debtToken: address(dEURC),
            interestModel: address(irm), oracle: address(oracle),
            decimals: 6, ltv: 0, liqThreshold: 0, liqBonus: 500,
            reserveFactor: 1000, closeFactor: 5000,
            supplyCap: 5_000_000e6, borrowCap: 4_000_000e6,
            borrowEnabled: true, collateralEnabled: false, active: true, paused: false
        }));

        // cirBTC — collateral only
        pool.addMarket(CIRBTC_TESTNET, ILendingPool.MarketConfig({
            sToken: address(sCIRBTC), debtToken: address(dCIRBTC),
            interestModel: address(irm), oracle: address(oracle),
            decimals: 8, ltv: 7000, liqThreshold: 7800, liqBonus: 800,
            reserveFactor: 1500, closeFactor: 5000,
            supplyCap: 50e8, borrowCap: 0,
            borrowEnabled: false, collateralEnabled: true, active: true, paused: false
        }));

        // WETH — collateral only
        pool.addMarket(WETH_TESTNET, ILendingPool.MarketConfig({
            sToken: address(sWETH), debtToken: address(dWETH),
            interestModel: address(irm), oracle: address(oracle),
            decimals: 18, ltv: 7200, liqThreshold: 8000, liqBonus: 800,
            reserveFactor: 1500, closeFactor: 5000,
            supplyCap: 200e18, borrowCap: 0,
            borrowEnabled: false, collateralEnabled: true, active: true, paused: false
        }));

        console.log("All 4 markets added.");

        // -----------------------------------------------------------------------
        // 4. BatchRouter
        // -----------------------------------------------------------------------
        BatchRouter router = new BatchRouter(address(pool), PERMIT2, msg.sender);
        console.log("BatchRouter:", address(router));

        // -----------------------------------------------------------------------
        // 5. ChainlinkOracleAdapter (wired but not activated on testnet)
        //    On mainnet: call adapter.setFeed() for each asset with live Chainlink addresses.
        // -----------------------------------------------------------------------
        ChainlinkOracleAdapter adapter = new ChainlinkOracleAdapter(
            deployer,
            EURC_TESTNET,
            address(0) // EUR/USD feed — set to live address on mainnet
        );
        console.log("ChainlinkOracleAdapter:", address(adapter));
        console.log("NOTE: On mainnet, call adapter.setFeed() for BTC/USD, ETH/USD, EUR/USD, EURC/USD");
        console.log("      then call pool.setOracle(asset, address(adapter)) to activate live feeds.");

        vm.stopBroadcast();

        // Summary for deployments/testnet.json
        console.log("\n--- COPY TO deployments/testnet.json ---");
        console.log("LendingPool:", address(pool));
        console.log("InterestRateModel:", address(irm));
        console.log("MockPriceOracle:", address(oracle));
        console.log("ChainlinkOracleAdapter:", address(adapter));
        console.log("BatchRouter:", address(router));
        console.log("sToken_USDC:", address(sUSDC));
        console.log("sToken_EURC:", address(sEURC));
        console.log("sToken_cirBTC:", address(sCIRBTC));
        console.log("sToken_WETH:", address(sWETH));
        console.log("DebtToken_USDC:", address(dUSDC));
        console.log("DebtToken_EURC:", address(dEURC));
    }
}
