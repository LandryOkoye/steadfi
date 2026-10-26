// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script, console} from "forge-std/Script.sol";
import {LendingPool}  from "../src/LendingPool.sol";
import {sToken}       from "../src/sToken.sol";
import {DebtToken}    from "../src/DebtToken.sol";
import {ILendingPool} from "../src/interfaces/ILendingPool.sol";

/// @notice Redeploys LendingPool + its 8 market tokens on Arc Testnet, reusing
///         the live Timelock, interest-rate models and Pyth Pro oracle adapter.
///         Ships the 2026-10-26 fixes: delegate checks on *OnBehalfOf, sToken
///         transfer guard, USD-priced debt, borrow-power check on new debt,
///         liquidation/risk-param validation, and the 0.5% borrow fee.
///
///         Run (key read from env, never passed on the command line):
///           DEPLOYER_PRIVATE_KEY=... forge script script/RedeployPool.s.sol \
///             --rpc-url https://rpc.testnet.arc.io --broadcast
contract RedeployPool is Script {
    // Arc Testnet tokens (docs.arc.io, verified 2026-10-22 via eth_getCode)
    address constant USDC    = 0x3600000000000000000000000000000000000000;
    address constant EURC    = 0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a;
    address constant CIR_BTC = 0xf0C4a4CE82A5746AbAAd9425360Ab04fbBA432BF;
    address constant WETH    = 0x2c4047028a72803939b6fb674D01bC059B5C4961;

    // Reused live infrastructure (read from the previous pool's market configs)
    address constant TIMELOCK       = 0x6C50DDcf4CAf08C8C41644b9372a1B2c1f245947;
    address constant IRM_STABLE     = 0xA4eCC81c1566abFc55355ba8ED2725400E41D1e6;
    address constant IRM_COLLATERAL = 0xFB64d2c8dac257F7c29a0A7fD7A4FA8d668DF7C1;
    address constant ORACLE         = 0x42c69A87e59Cf8Dd845df2197d569745E7bb5730;

    function run() external {
        require(block.chainid == 5042002, "Wrong chain: expected Arc Testnet (5042002)");
        require(TIMELOCK.code.length > 0 && IRM_STABLE.code.length > 0
            && IRM_COLLATERAL.code.length > 0 && ORACLE.code.length > 0, "missing reused contract");

        // Accept the key with or without a 0x prefix (.env stores it bare).
        string memory raw = vm.envString("DEPLOYER_PRIVATE_KEY");
        bytes memory rb = bytes(raw);
        bool prefixed = rb.length >= 2 && rb[0] == "0" && (rb[1] == "x" || rb[1] == "X");
        uint256 pk = vm.parseUint(prefixed ? raw : string.concat("0x", raw));
        vm.startBroadcast(pk);
        address deployer = vm.addr(pk);

        LendingPool pool = new LendingPool(deployer);
        console.log("LendingPool:", address(pool));

        sToken    sUSDC   = new sToken("SteadFi Supply USDC", "sfUSDC", 6, address(pool), USDC);
        DebtToken dUSDC   = new DebtToken("SteadFi Debt USDC", "dUSDC", 6, address(pool), USDC);
        sToken    sEURC   = new sToken("SteadFi Supply EURC", "sfEURC", 6, address(pool), EURC);
        DebtToken dEURC   = new DebtToken("SteadFi Debt EURC", "dEURC", 6, address(pool), EURC);
        sToken    sCIRBTC = new sToken("SteadFi Supply cirBTC", "sfcirBTC", 8, address(pool), CIR_BTC);
        DebtToken dCIRBTC = new DebtToken("SteadFi Debt cirBTC", "dcirBTC", 8, address(pool), CIR_BTC);
        sToken    sWETH   = new sToken("SteadFi Supply WETH", "sfWETH", 18, address(pool), WETH);
        DebtToken dWETH   = new DebtToken("SteadFi Debt WETH", "dWETH", 18, address(pool), WETH);
        console.log("sUSDC:", address(sUSDC));
        console.log("dUSDC:", address(dUSDC));
        console.log("sEURC:", address(sEURC));
        console.log("dEURC:", address(dEURC));
        console.log("sCIRBTC:", address(sCIRBTC));
        console.log("dCIRBTC:", address(dCIRBTC));
        console.log("sWETH:", address(sWETH));
        console.log("dWETH:", address(dWETH));

        // Same risk parameters as Phase 1.
        pool.addMarket(USDC, _stable(address(sUSDC), address(dUSDC), 10_000_000e6, 8_000_000e6));
        pool.addMarket(EURC, _stable(address(sEURC), address(dEURC), 5_000_000e6, 4_000_000e6));
        pool.addMarket(CIR_BTC, _collateral(address(sCIRBTC), address(dCIRBTC), 8, 7000, 7800, 50e8));
        pool.addMarket(WETH, _collateral(address(sWETH), address(dWETH), 18, 7200, 8000, 200e18));

        // Protocol revenue: 0.5% one-time borrow fee on the borrowable markets.
        pool.setBorrowFee(USDC, 50);
        pool.setBorrowFee(EURC, 50);

        // Risk changes can also go through the Timelock (deployer keeps OWNER).
        pool.grantRole(pool.RISK_ADMIN_ROLE(), TIMELOCK);

        vm.stopBroadcast();
        console.log("Deployer:", deployer);
    }

    function _stable(address s, address d, uint256 supplyCap, uint256 borrowCap)
        internal pure returns (ILendingPool.MarketConfig memory)
    {
        return ILendingPool.MarketConfig({
            sToken: s, debtToken: d, interestModel: IRM_STABLE, oracle: ORACLE, decimals: 6,
            ltv: 0, liqThreshold: 0, liqBonus: 500, reserveFactor: 1000, closeFactor: 5000,
            supplyCap: supplyCap, borrowCap: borrowCap,
            borrowEnabled: true, collateralEnabled: false, active: true, paused: false
        });
    }

    function _collateral(address s, address d, uint8 decimals, uint16 ltv, uint16 liq, uint256 supplyCap)
        internal pure returns (ILendingPool.MarketConfig memory)
    {
        return ILendingPool.MarketConfig({
            sToken: s, debtToken: d, interestModel: IRM_COLLATERAL, oracle: ORACLE, decimals: decimals,
            ltv: ltv, liqThreshold: liq, liqBonus: 800, reserveFactor: 1500, closeFactor: 5000,
            supplyCap: supplyCap, borrowCap: 0,
            borrowEnabled: false, collateralEnabled: true, active: true, paused: false
        });
    }
}
