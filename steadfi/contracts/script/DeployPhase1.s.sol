// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script, console} from "forge-std/Script.sol";
import {LendingPool}         from "../src/LendingPool.sol";
import {InterestRateModel}   from "../src/InterestRateModel.sol";
import {MockPriceOracle}     from "../src/MockPriceOracle.sol";
import {sToken}              from "../src/sToken.sol";
import {DebtToken}           from "../src/DebtToken.sol";
import {Timelock}            from "../src/Timelock.sol";
import {ILendingPool}        from "../src/interfaces/ILendingPool.sol";
import {RayMath}             from "../src/libraries/RayMath.sol";

/// @notice Deploys the full Phase 1 SteadFi protocol to Arc Testnet.
///         Run with:
///           forge script script/DeployPhase1.s.sol \
///             --rpc-url $ARC_TESTNET_RPC \
///             --private-key $DEPLOYER_PRIVATE_KEY \
///             --broadcast
///
///         After deployment, copy the printed addresses into deployments/testnet.json.
contract DeployPhase1 is Script {
    // Arc Testnet token addresses (docs.arc.io verified 2026-10-22)
    address constant USDC   = 0x3600000000000000000000000000000000000000;
    address constant EURC   = 0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a;
    address constant CIR_BTC = 0xf0C4a4CE82A5746AbAAd9425360Ab04fbBA432BF;
    address constant WETH   = 0x2c4047028a72803939b6fb674D01bC059B5C4961;

    uint256 constant RAY = RayMath.RAY; // 1e27

    function run() external {
        require(block.chainid == 5042002, "Wrong chain: expected Arc Testnet (5042002)");

        vm.startBroadcast();
        address deployer = msg.sender;

        // ------------------------------------------------------------------
        // 1. Timelock (1-hour delay on testnet)
        // ------------------------------------------------------------------
        Timelock timelock = new Timelock(deployer, 1 hours);
        console.log("Timelock:         ", address(timelock));

        // ------------------------------------------------------------------
        // 2. LendingPool
        // ------------------------------------------------------------------
        LendingPool pool = new LendingPool(deployer);
        console.log("LendingPool:      ", address(pool));

        // ------------------------------------------------------------------
        // 3. Interest Rate Model — shared for USDC and EURC
        //    base=0%, slope1=8%, kink=90%, slope2=100%
        // ------------------------------------------------------------------
        InterestRateModel irmStable = new InterestRateModel(
            0,           // baseRate: 0%
            0.08e27,     // slope1:   8%  (0.08 * RAY)
            1.00e27,     // slope2: 100%
            0.90e27      // kink:    90%
        );
        console.log("IRM_Stable:       ", address(irmStable));

        // ------------------------------------------------------------------
        // 4. Mock Price Oracle
        // ------------------------------------------------------------------
        MockPriceOracle oracle = new MockPriceOracle(deployer);
        // Set initial prices (USD, 18 dec precision)
        // BTC ~$95,000, ETH ~$3,000, EURC ~$1.08
        oracle.setPrice(CIR_BTC, 95_000e18);
        oracle.setPrice(WETH,    3_000e18);
        oracle.setPrice(EURC,    1.08e18);
        console.log("MockPriceOracle:  ", address(oracle));

        // ------------------------------------------------------------------
        // 5. USDC market tokens
        // ------------------------------------------------------------------
        sToken     sUSDC    = new sToken("SteadFi Supply USDC", "sfUSDC", 6, address(pool), USDC);
        DebtToken  dUSDC    = new DebtToken("SteadFi Debt USDC", "dUSDC", 6, address(pool), USDC);
        console.log("sUSDC:            ", address(sUSDC));
        console.log("dUSDC:            ", address(dUSDC));

        // ------------------------------------------------------------------
        // 6. EURC market tokens
        // ------------------------------------------------------------------
        sToken     sEURC    = new sToken("SteadFi Supply EURC", "sfEURC", 6, address(pool), EURC);
        DebtToken  dEURC    = new DebtToken("SteadFi Debt EURC", "dEURC", 6, address(pool), EURC);
        console.log("sEURC:            ", address(sEURC));
        console.log("dEURC:            ", address(dEURC));

        // ------------------------------------------------------------------
        // 7. cirBTC collateral tokens (no borrowing)
        // ------------------------------------------------------------------
        sToken     sCIRBTC  = new sToken("SteadFi Supply cirBTC", "sfcirBTC", 8, address(pool), CIR_BTC);
        DebtToken  dCIRBTC  = new DebtToken("SteadFi Debt cirBTC", "dcirBTC", 8, address(pool), CIR_BTC);
        console.log("sCIRBTC:          ", address(sCIRBTC));
        console.log("dCIRBTC:          ", address(dCIRBTC));

        // ------------------------------------------------------------------
        // 8. WETH collateral tokens (no borrowing)
        // ------------------------------------------------------------------
        sToken     sWETH    = new sToken("SteadFi Supply WETH", "sfWETH", 18, address(pool), WETH);
        DebtToken  dWETH    = new DebtToken("SteadFi Debt WETH", "ddWETH", 18, address(pool), WETH);
        console.log("sWETH:            ", address(sWETH));
        console.log("dWETH:            ", address(dWETH));

        // ------------------------------------------------------------------
        // 9. Add markets to pool
        // ------------------------------------------------------------------

        // USDC market — supply + borrow, 10M cap
        pool.addMarket(USDC, ILendingPool.MarketConfig({
            sToken:         address(sUSDC),
            debtToken:      address(dUSDC),
            interestModel:  address(irmStable),
            oracle:         address(oracle),   // USDC: oracle returns hardcoded $1
            decimals:       6,
            ltv:            8500,  // 85%
            liqThreshold:   9000,  // 90%
            liqBonus:       500,   // 5%
            reserveFactor:  1000,  // 10%
            closeFactor:    5000,  // 50%
            supplyCap:      10_000_000e6,  // 10M USDC
            borrowCap:      8_000_000e6,   // 8M USDC
            borrowEnabled:  true,
            active:         true,
            paused:         false
        }));

        // EURC market — supply + borrow, 5M cap
        pool.addMarket(EURC, ILendingPool.MarketConfig({
            sToken:         address(sEURC),
            debtToken:      address(dEURC),
            interestModel:  address(irmStable),
            oracle:         address(oracle),
            decimals:       6,
            ltv:            8300,  // 83%
            liqThreshold:   8800,  // 88%
            liqBonus:       500,   // 5%
            reserveFactor:  1000,  // 10%
            closeFactor:    5000,  // 50%
            supplyCap:      5_000_000e6,
            borrowCap:      4_000_000e6,
            borrowEnabled:  true,
            active:         true,
            paused:         false
        }));

        // cirBTC — collateral only
        pool.addMarket(CIR_BTC, ILendingPool.MarketConfig({
            sToken:         address(sCIRBTC),
            debtToken:      address(dCIRBTC),
            interestModel:  address(irmStable),
            oracle:         address(oracle),
            decimals:       8,
            ltv:            7000,  // 70%
            liqThreshold:   7800,  // 78%
            liqBonus:       800,   // 8%
            reserveFactor:  1500,  // 15%
            closeFactor:    5000,  // 50%
            supplyCap:      50e8,  // 50 cirBTC
            borrowCap:      0,     // no borrow
            borrowEnabled:  false,
            active:         true,
            paused:         false
        }));

        // WETH — collateral only
        pool.addMarket(WETH, ILendingPool.MarketConfig({
            sToken:         address(sWETH),
            debtToken:      address(dWETH),
            interestModel:  address(irmStable),
            oracle:         address(oracle),
            decimals:       18,
            ltv:            7200,  // 72%
            liqThreshold:   8000,  // 80%
            liqBonus:       800,   // 8%
            reserveFactor:  1500,  // 15%
            closeFactor:    5000,  // 50%
            supplyCap:      200e18,  // 200 WETH
            borrowCap:      0,
            borrowEnabled:  false,
            active:         true,
            paused:         false
        }));

        vm.stopBroadcast();

        console.log("\n=== Phase 1 Deployment Complete ===");
        console.log("Deployer:         ", deployer);
        console.log("Chain ID:         ", block.chainid);
        console.log("\nCopy these addresses into deployments/testnet.json");
    }
}
