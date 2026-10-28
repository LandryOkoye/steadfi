// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script, console} from "forge-std/Script.sol";
import {LendingPool}       from "../src/LendingPool.sol";
import {InterestRateModel} from "../src/InterestRateModel.sol";
import {PythOracleAdapter} from "../src/PythOracleAdapter.sol";
import {sToken}            from "../src/sToken.sol";
import {DebtToken}         from "../src/DebtToken.sol";
import {Timelock}          from "../src/Timelock.sol";
import {ILendingPool}      from "../src/interfaces/ILendingPool.sol";

interface IERC20Decimals {
    function decimals() external view returns (uint8);
}

/// @notice Deploys the full SteadFi protocol to Arc MAINNET (chain 5042):
///         Timelock, 2 interest-rate models, Pyth Pro oracle adapter,
///         LendingPool and the 8 market tokens, with conservative launch caps.
///
///         Same contracts and risk parameters as the live testnet pool
///         (RedeployPool.s.sol), except: mainnet token addresses, a 24h
///         Timelock delay and low supply/borrow caps (unaudited code).
///
///         From steadfi/contracts, with DEPLOYER_PRIVATE_KEY loaded from the root .env.
///         Simulate first (no transactions sent):
///           forge script script/DeployMainnet.s.sol:DeployMainnet --rpc-url https://rpc.mainnet.arc.io
///         Then broadcast (key read from env, never passed on the command line):
///           forge script script/DeployMainnet.s.sol:DeployMainnet --rpc-url https://rpc.mainnet.arc.io \
///             --broadcast --slow
///         Needs ~0.85 USDC of gas in the deployer (21M gas; actual spend ~0.42 at 20 gwei).
contract DeployMainnet is Script {
    // Arc Mainnet tokens (docs.arc.io/arc/references/contract-addresses, verified
    // 2026-10-28 via eth_getCode + decimals() on rpc.mainnet.arc.io)
    address constant USDC    = 0x3600000000000000000000000000000000000000;
    address constant EURC    = 0xbEf5f6d51CB62b58e6A8f77868681825C6fe21c1;
    address constant CIR_BTC = 0x171A4217b86A807A64eB94757Db6849fb4bDbAA0;
    address constant WETH    = 0x128cC466B61f542da60c70e3aA11c10e19B84EDB;

    // Pyth Pro verifier on Arc mainnet (docs.pyth.network/price-feeds/pro/contract-addresses).
    // Same address as testnet; verified 2026-10-28 that a live Pyth Pro update
    // verifies on mainnet (verification_fee() = 1 wei).
    address constant PYTH_PRO = 0xACeA761c27A909d4D3895128EBe6370FDE2dF481;

    uint32 constant FEED_BTC_USD = 1;
    uint32 constant FEED_ETH_USD = 2;
    uint32 constant FEED_EUR_USD = 327;
    uint256 constant FEED_MAX_AGE = 300; // seconds; keeper must push more often than this

    uint256 constant TIMELOCK_DELAY = 1 days;

    // Launch caps — deliberately small while the contracts are unaudited.
    // Raise later with setSupplyCap/setBorrowCap (RISK_ADMIN) from /admin.
    uint256 constant USDC_SUPPLY_CAP = 10_000e6;
    uint256 constant USDC_BORROW_CAP = 8_000e6;
    uint256 constant EURC_SUPPLY_CAP = 10_000e6;
    uint256 constant EURC_BORROW_CAP = 8_000e6;
    uint256 constant CIRBTC_SUPPLY_CAP = 0.25e8; // 0.25 cirBTC
    uint256 constant WETH_SUPPLY_CAP   = 5e18;   // 5 WETH

    uint16 constant BORROW_FEE_BPS = 50; // 0.5% origination fee on USDC/EURC

    function run() external {
        require(block.chainid == 5042, "Wrong chain: expected Arc Mainnet (5042)");
        _checkToken(USDC, 6);
        _checkToken(EURC, 6);
        _checkToken(CIR_BTC, 8);
        _checkToken(WETH, 18);
        require(PYTH_PRO.code.length > 0, "Pyth Pro verifier missing");

        // Accept the key with or without a 0x prefix (.env stores it bare).
        string memory raw = vm.envString("DEPLOYER_PRIVATE_KEY");
        bytes memory rb = bytes(raw);
        bool prefixed = rb.length >= 2 && rb[0] == "0" && (rb[1] == "x" || rb[1] == "X");
        uint256 pk = vm.parseUint(prefixed ? raw : string.concat("0x", raw));
        address deployer = vm.addr(pk);

        vm.startBroadcast(pk);

        Timelock timelock = new Timelock(deployer, TIMELOCK_DELAY);
        LendingPool pool = new LendingPool(deployer);

        // base 0%, slope1 8%, slope2 100%, kink 90% (same as testnet)
        InterestRateModel irmStable     = new InterestRateModel(0, 0.08e27, 1.00e27, 0.90e27);
        InterestRateModel irmCollateral = new InterestRateModel(0, 0.08e27, 1.00e27, 0.90e27);

        // USDC is priced at $1.00 by the adapter and needs no feed.
        PythOracleAdapter oracle = new PythOracleAdapter(deployer, PYTH_PRO);
        oracle.setFeed(CIR_BTC, FEED_BTC_USD, FEED_MAX_AGE);
        oracle.setFeed(WETH,    FEED_ETH_USD, FEED_MAX_AGE);
        oracle.setFeed(EURC,    FEED_EUR_USD, FEED_MAX_AGE);

        sToken    sUSDC   = new sToken("SteadFi Supply USDC", "sfUSDC", 6, address(pool), USDC);
        DebtToken dUSDC   = new DebtToken("SteadFi Debt USDC", "dUSDC", 6, address(pool), USDC);
        sToken    sEURC   = new sToken("SteadFi Supply EURC", "sfEURC", 6, address(pool), EURC);
        DebtToken dEURC   = new DebtToken("SteadFi Debt EURC", "dEURC", 6, address(pool), EURC);
        sToken    sCIRBTC = new sToken("SteadFi Supply cirBTC", "sfcirBTC", 8, address(pool), CIR_BTC);
        DebtToken dCIRBTC = new DebtToken("SteadFi Debt cirBTC", "dcirBTC", 8, address(pool), CIR_BTC);
        sToken    sWETH   = new sToken("SteadFi Supply WETH", "sfWETH", 18, address(pool), WETH);
        DebtToken dWETH   = new DebtToken("SteadFi Debt WETH", "dWETH", 18, address(pool), WETH);

        // USDC/EURC: lend-and-borrow only. cirBTC/WETH: collateral only.
        pool.addMarket(USDC, _stable(address(sUSDC), address(dUSDC), address(irmStable), address(oracle),
            USDC_SUPPLY_CAP, USDC_BORROW_CAP));
        pool.addMarket(EURC, _stable(address(sEURC), address(dEURC), address(irmStable), address(oracle),
            EURC_SUPPLY_CAP, EURC_BORROW_CAP));
        pool.addMarket(CIR_BTC, _collateral(address(sCIRBTC), address(dCIRBTC), address(irmCollateral),
            address(oracle), 8, 7000, 7800, CIRBTC_SUPPLY_CAP));
        pool.addMarket(WETH, _collateral(address(sWETH), address(dWETH), address(irmCollateral),
            address(oracle), 18, 7200, 8000, WETH_SUPPLY_CAP));

        pool.setBorrowFee(USDC, BORROW_FEE_BPS);
        pool.setBorrowFee(EURC, BORROW_FEE_BPS);

        // Risk changes can also go through the Timelock (deployer keeps OWNER).
        pool.grantRole(pool.RISK_ADMIN_ROLE(), address(timelock));

        vm.stopBroadcast();

        console.log("=== SteadFi Arc Mainnet deployment ===");
        console.log("Chain ID:", block.chainid);
        console.log("Deployer:", deployer);
        console.log("Timelock:", address(timelock));
        console.log("LendingPool:", address(pool));
        console.log("IRM_Stable:", address(irmStable));
        console.log("IRM_Collateral:", address(irmCollateral));
        console.log("PythOracleAdapter:", address(oracle));
        console.log("sUSDC:", address(sUSDC));
        console.log("dUSDC:", address(dUSDC));
        console.log("sEURC:", address(sEURC));
        console.log("dEURC:", address(dEURC));
        console.log("sCIRBTC:", address(sCIRBTC));
        console.log("dCIRBTC:", address(dCIRBTC));
        console.log("sWETH:", address(sWETH));
        console.log("dWETH:", address(dWETH));
    }

    function _checkToken(address token, uint8 decimals) internal view {
        require(token.code.length > 0, "token has no code");
        require(IERC20Decimals(token).decimals() == decimals, "token decimals mismatch");
    }

    function _stable(address s, address d, address irm, address oracle, uint256 supplyCap, uint256 borrowCap)
        internal pure returns (ILendingPool.MarketConfig memory)
    {
        return ILendingPool.MarketConfig({
            sToken: s, debtToken: d, interestModel: irm, oracle: oracle, decimals: 6,
            ltv: 0, liqThreshold: 0, liqBonus: 500, reserveFactor: 1000, closeFactor: 5000,
            supplyCap: supplyCap, borrowCap: borrowCap,
            borrowEnabled: true, collateralEnabled: false, active: true, paused: false
        });
    }

    function _collateral(
        address s, address d, address irm, address oracle,
        uint8 decimals, uint16 ltv, uint16 liq, uint256 supplyCap
    ) internal pure returns (ILendingPool.MarketConfig memory) {
        return ILendingPool.MarketConfig({
            sToken: s, debtToken: d, interestModel: irm, oracle: oracle, decimals: decimals,
            ltv: ltv, liqThreshold: liq, liqBonus: 800, reserveFactor: 1500, closeFactor: 5000,
            supplyCap: supplyCap, borrowCap: 0,
            borrowEnabled: false, collateralEnabled: true, active: true, paused: false
        });
    }
}
