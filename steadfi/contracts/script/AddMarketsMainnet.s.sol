// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script, console} from "forge-std/Script.sol";
import {LendingPool}       from "../src/LendingPool.sol";
import {PythOracleAdapter} from "../src/PythOracleAdapter.sol";
import {sToken}            from "../src/sToken.sol";
import {DebtToken}         from "../src/DebtToken.sol";
import {ILendingPool}      from "../src/interfaces/ILendingPool.sol";

interface IERC20Meta {
    function decimals() external view returns (uint8);
}

/// @notice Adds the EURC (lend + borrow) and WETH (collateral) markets to the
///         existing Arc Mainnet pool deployed by DeployMainnet.s.sol.
///         Reuses the deployed LendingPool, InterestRateModel and PythOracleAdapter.
///
///         9 transactions:
///           sEURC, dEURC, sWETH, dWETH, setFeed(EURC), setFeed(WETH),
///           addMarket(EURC), addMarket(WETH), setBorrowFee(EURC, 50)
///
///         Reads DEPLOYER_PRIVATE_KEY from the environment (with or without 0x),
///         so the key never appears on the command line.
///
///         Run from steadfi/contracts after loading .env:
///           set -a; . ../../.env; set +a
///
///         Simulate (dry-run, no broadcast):
///           forge script script/AddMarketsMainnet.s.sol:AddMarketsMainnet \
///             --rpc-url https://rpc.mainnet.arc.io \
///             --with-gas-price 20gwei --priority-gas-price 0 \
///             --gas-estimate-multiplier 110
///
///         Broadcast:
///           (same command) --broadcast --slow
///
///         If interrupted: add --resume with the same flags (never re-run from scratch).
contract AddMarketsMainnet is Script {
    // Deployed by DeployMainnet.s.sol (deployments/mainnet.json)
    address constant DEPLOYER = 0xbDD5A7a963EcA056f5A416268B1C2AC833E3e432;
    address constant POOL     = 0xc85f7C6DCFC9ca544c72EBAb93881A34485B1652;
    address constant IRM      = 0x84393560Bc91a1C2eDea435dfdb704Ad17df0886;
    address constant ORACLE   = 0x4B526e6f7E1d82959E0f95F14B2e7f7893C67A6B;

    // Arc Mainnet tokens (verified on-chain 2026-10-29: symbol + decimals)
    address constant EURC = 0xbEf5f6d51CB62b58e6A8f77868681825C6fe21c1;
    address constant WETH = 0x128cC466B61f542da60c70e3aA11c10e19B84EDB;

    // Pyth Pro feed IDs (same as testnet)
    uint32 constant FEED_ETH_USD = 2;
    uint32 constant FEED_EUR_USD = 327;

    bytes32 constant OWNER_ROLE      = keccak256("OWNER");
    bytes32 constant RISK_ADMIN_ROLE = keccak256("RISK_ADMIN");

    function run() external {
        require(block.chainid == 5042, "Wrong chain: expected Arc Mainnet (5042)");

        // ------------------------------------------------------------------
        // Pre-flight checks (all reads; nothing is sent if any fails)
        // ------------------------------------------------------------------
        string memory raw = vm.envString("DEPLOYER_PRIVATE_KEY");
        if (bytes(raw).length == 64) raw = string.concat("0x", raw);
        uint256 pk = vm.parseUint(raw);
        require(vm.addr(pk) == DEPLOYER, "DEPLOYER_PRIVATE_KEY is not the mainnet deployer");

        require(POOL.code.length > 0 && IRM.code.length > 0 && ORACLE.code.length > 0, "Core contract missing");
        require(EURC.code.length > 0 && IERC20Meta(EURC).decimals() == 6,  "EURC check failed");
        require(WETH.code.length > 0 && IERC20Meta(WETH).decimals() == 18, "WETH check failed");

        LendingPool pool = LendingPool(payable(POOL));
        PythOracleAdapter oracle = PythOracleAdapter(payable(ORACLE));
        require(pool.hasRole(OWNER_ROLE, DEPLOYER),        "Deployer lacks OWNER on pool");
        require(pool.hasRole(RISK_ADMIN_ROLE, DEPLOYER),   "Deployer lacks RISK_ADMIN on pool");
        require(oracle.hasRole(RISK_ADMIN_ROLE, DEPLOYER), "Deployer lacks RISK_ADMIN on oracle");

        vm.startBroadcast(pk);

        // ------------------------------------------------------------------
        // 1. Market tokens
        // ------------------------------------------------------------------
        sToken    sEURC = new sToken("SteadFi Supply EURC", "sfEURC", 6, POOL, EURC);
        DebtToken dEURC = new DebtToken("SteadFi Debt EURC", "dEURC", 6, POOL, EURC);
        sToken    sWETH = new sToken("SteadFi Supply WETH", "sfWETH", 18, POOL, WETH);
        DebtToken dWETH = new DebtToken("SteadFi Debt WETH", "dWETH", 18, POOL, WETH);

        // ------------------------------------------------------------------
        // 2. Oracle feeds. EUR/USD prices EURC debt; ETH/USD prices WETH collateral.
        //    maxAge 300s, same as cirBTC.
        // ------------------------------------------------------------------
        oracle.setFeed(EURC, FEED_EUR_USD, 300);
        oracle.setFeed(WETH, FEED_ETH_USD, 300);

        // ------------------------------------------------------------------
        // 3. Markets (shared IRM, same parameters as testnet, launch-size caps)
        //
        // EURC: lend + borrow, NOT collateral
        //   supplyCap 10,000 EURC, borrowCap 8,000 EURC (mirrors mainnet USDC)
        //
        // WETH: collateral only, NOT borrowable
        //   LTV 72%, liq threshold 80%, supplyCap 5 WETH
        // ------------------------------------------------------------------
        pool.addMarket(EURC, ILendingPool.MarketConfig({
            sToken:            address(sEURC),
            debtToken:         address(dEURC),
            interestModel:     IRM,
            oracle:            ORACLE,
            decimals:          6,
            ltv:               0,
            liqThreshold:      0,
            liqBonus:          500,    // 5%
            reserveFactor:     1000,   // 10%
            closeFactor:       5000,   // 50%
            supplyCap:         10_000e6,
            borrowCap:         8_000e6,
            borrowEnabled:     true,
            collateralEnabled: false,
            active:            true,
            paused:            false
        }));

        pool.addMarket(WETH, ILendingPool.MarketConfig({
            sToken:            address(sWETH),
            debtToken:         address(dWETH),
            interestModel:     IRM,
            oracle:            ORACLE,
            decimals:          18,
            ltv:               7200,   // 72%
            liqThreshold:      8000,   // 80%
            liqBonus:          800,    // 8%
            reserveFactor:     1500,   // 15%
            closeFactor:       5000,   // 50%
            supplyCap:         5e18,   // 5 WETH
            borrowCap:         0,
            borrowEnabled:     false,
            collateralEnabled: true,
            active:            true,
            paused:            false
        }));

        // ------------------------------------------------------------------
        // 4. Protocol revenue: 0.5% borrow (origination) fee on EURC, same as USDC
        // ------------------------------------------------------------------
        pool.setBorrowFee(EURC, 50);

        vm.stopBroadcast();

        console.log("sEURC:", address(sEURC));
        console.log("dEURC:", address(dEURC));
        console.log("sWETH:", address(sWETH));
        console.log("dWETH:", address(dWETH));
        console.log("Copy these into deployments/mainnet.json and src/lib/steadfi.ts");
    }
}
