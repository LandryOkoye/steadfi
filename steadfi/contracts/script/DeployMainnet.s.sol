// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script, console} from "forge-std/Script.sol";
import {LendingPool}       from "../src/LendingPool.sol";
import {InterestRateModel} from "../src/InterestRateModel.sol";
import {PythOracleAdapter} from "../src/PythOracleAdapter.sol";
import {sToken}            from "../src/sToken.sol";
import {DebtToken}         from "../src/DebtToken.sol";
import {ILendingPool}      from "../src/interfaces/ILendingPool.sol";
import {RayMath}           from "../src/libraries/RayMath.sol";

/// @notice Deploys SteadFi Phase 1 to Arc Mainnet (chain 5042).
///
///         Lean scope for hackathon launch:
///           - 2 markets: USDC (lend + borrow) and cirBTC (collateral only)
///           - 1 IRM: stable curve (base 0%, slope1 8%, kink 90%, slope2 100%)
///           - 1 PythOracleAdapter with BTC/USD feed only (feed id 1)
///           - No Timelock: deployer holds OWNER + RISK_ADMIN + PAUSE_GUARDIAN
///           - 0.5% borrow (origination) fee on USDC
///
///         Run from steadfi/contracts after loading .env:
///           set -a; . ../../.env; set +a
///
///         Simulate (dry-run, no broadcast):
///           forge script script/DeployMainnet.s.sol:DeployMainnet \
///             --rpc-url https://rpc.mainnet.arc.io \
///             --with-gas-price 20gwei --priority-gas-price 0 \
///             --gas-estimate-multiplier 110
///
///         Broadcast:
///           forge script script/DeployMainnet.s.sol:DeployMainnet \
///             --rpc-url https://rpc.mainnet.arc.io \
///             --with-gas-price 20gwei --priority-gas-price 0 \
///             --gas-estimate-multiplier 110 \
///             --broadcast --slow
///
///         If interrupted: add --resume with the same flags (never re-run from scratch).
contract DeployMainnet is Script {
    // -------------------------------------------------------------------------
    // Arc Mainnet token addresses (docs.arc.io verified 2026-10-28)
    // -------------------------------------------------------------------------

    /// @dev Arc USDC is the same address on mainnet and testnet.
    address constant USDC    = 0x3600000000000000000000000000000000000000;
    /// @dev cirBTC mainnet (Circle-issued, 8 decimals).
    address constant CIR_BTC = 0x171A4217b86A807A64eB94757Db6849fb4bDbAA0;

    // -------------------------------------------------------------------------
    // Pyth Pro (Lazer) verifier — same on both networks.
    // -------------------------------------------------------------------------
    address constant PYTH_PRO = 0xACeA761c27A909d4D3895128EBe6370FDE2dF481;

    // Pyth Pro feed ID for BTC/USD (numeric).
    uint32 constant FEED_BTC_USD = 1;

    uint256 constant RAY = RayMath.RAY;

    function run() external {
        require(block.chainid == 5042, "Wrong chain: expected Arc Mainnet (5042)");

        vm.startBroadcast();
        address deployer = msg.sender;

        // ------------------------------------------------------------------
        // 1. LendingPool — deployer keeps all roles (no Timelock on mainnet v1)
        // ------------------------------------------------------------------
        LendingPool pool = new LendingPool(deployer);
        console.log("LendingPool:       ", address(pool));

        // ------------------------------------------------------------------
        // 2. Interest Rate Model
        //    base=0%, slope1=8%, kink=90%, slope2=100%
        // ------------------------------------------------------------------
        InterestRateModel irm = new InterestRateModel(
            0,       // baseRate: 0%
            0.08e27, // slope1:   8%
            1.00e27, // slope2: 100%
            0.90e27  // kink:    90%
        );
        console.log("IRM:               ", address(irm));

        // ------------------------------------------------------------------
        // 3. PythOracleAdapter with BTC/USD feed only
        //    maxAge 300s: usable through 4 missed 60s keeper ticks
        // ------------------------------------------------------------------
        PythOracleAdapter oracle = new PythOracleAdapter(deployer, PYTH_PRO);
        oracle.setFeed(CIR_BTC, FEED_BTC_USD, 300);
        // USDC: getPrice(USDC) always returns $1 (no feed needed)
        console.log("PythOracleAdapter: ", address(oracle));

        // ------------------------------------------------------------------
        // 4. USDC market tokens
        // ------------------------------------------------------------------
        sToken    sUSDC = new sToken("SteadFi Supply USDC", "sfUSDC", 6, address(pool), USDC);
        DebtToken dUSDC = new DebtToken("SteadFi Debt USDC", "dUSDC", 6, address(pool), USDC);
        console.log("sUSDC:             ", address(sUSDC));
        console.log("dUSDC:             ", address(dUSDC));

        // ------------------------------------------------------------------
        // 5. cirBTC collateral tokens
        // ------------------------------------------------------------------
        sToken    sCIRBTC = new sToken("SteadFi Supply cirBTC", "sfcirBTC", 8, address(pool), CIR_BTC);
        DebtToken dCIRBTC = new DebtToken("SteadFi Debt cirBTC", "dcirBTC", 8, address(pool), CIR_BTC);
        console.log("sCIRBTC:           ", address(sCIRBTC));
        console.log("dCIRBTC:           ", address(dCIRBTC));

        // ------------------------------------------------------------------
        // 6. Add markets
        //
        // USDC: lend + borrow, NOT collateral
        //   supplyCap  10,000 USDC (conservative launch cap)
        //   borrowCap   8,000 USDC
        //
        // cirBTC: collateral only, NOT borrowable
        //   supplyCap  0.25 cirBTC (= 25_000_000 in 8-decimal units)
        // ------------------------------------------------------------------
        pool.addMarket(USDC, ILendingPool.MarketConfig({
            sToken:            address(sUSDC),
            debtToken:         address(dUSDC),
            interestModel:     address(irm),
            oracle:            address(oracle),
            decimals:          6,
            ltv:               0,
            liqThreshold:      0,
            liqBonus:          500,    // 5%
            reserveFactor:     1000,   // 10%
            closeFactor:       5000,   // 50%
            supplyCap:         10_000e6,   // 10,000 USDC
            borrowCap:         8_000e6,    //  8,000 USDC
            borrowEnabled:     true,
            collateralEnabled: false,
            active:            true,
            paused:            false
        }));

        pool.addMarket(CIR_BTC, ILendingPool.MarketConfig({
            sToken:            address(sCIRBTC),
            debtToken:         address(dCIRBTC),
            interestModel:     address(irm),
            oracle:            address(oracle),
            decimals:          8,
            ltv:               7000,   // 70%
            liqThreshold:      7800,   // 78%
            liqBonus:          800,    // 8%
            reserveFactor:     1500,   // 15%
            closeFactor:       5000,   // 50%
            supplyCap:         25_000_000,  // 0.25 cirBTC (8 decimals → 25_000_000)
            borrowCap:         0,
            borrowEnabled:     false,
            collateralEnabled: true,
            active:            true,
            paused:            false
        }));

        // ------------------------------------------------------------------
        // 7. Protocol revenue: 0.5% one-time borrow (origination) fee on USDC
        // ------------------------------------------------------------------
        pool.setBorrowFee(USDC, 50);

        vm.stopBroadcast();

        console.log("\n=== Arc Mainnet Deployment Complete ===");
        console.log("Deployer:          ", deployer);
        console.log("Chain ID:          ", block.chainid);
        console.log("\nCopy these addresses into deployments/mainnet.json");
        console.log("\nMarkets: USDC (lend+borrow), cirBTC (collateral)");
        console.log("Keeper: push one price update before any borrow can proceed.");
    }
}
