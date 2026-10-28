// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script, console} from "forge-std/Script.sol";
import {LendingPool}       from "../src/LendingPool.sol";
import {InterestRateModel} from "../src/InterestRateModel.sol";
import {PythOracleAdapter} from "../src/PythOracleAdapter.sol";
import {sToken}            from "../src/sToken.sol";
import {DebtToken}         from "../src/DebtToken.sol";
import {ILendingPool}      from "../src/interfaces/ILendingPool.sol";

interface IERC20Decimals {
    function decimals() external view returns (uint8);
}

/// @notice Lean SteadFi launch on Arc MAINNET (chain 5042), sized for a ~0.25 USDC
///         gas budget: LendingPool, one interest-rate model, the Pyth Pro oracle
///         adapter, and two markets — USDC (lend/borrow) and cirBTC (collateral).
///         EURC and WETH markets can be added later with addMarket once funded
///         (~0.045 USDC each: 2 token deploys + addMarket + setFeed).
///
///         Differences from testnet: no Timelock (deployer holds OWNER /
///         RISK_ADMIN / PAUSE_GUARDIAN directly), one IRM shared by both markets
///         (same 0% / 8% / 100% / 90% kink curve), and low caps (unaudited code).
///
///         Arc's base fee floor is 20 gwei (docs.arc.io/arc/references/gas-and-fees)
///         and mainnet sits at the floor, so ~10.9M gas costs ~0.22 USDC.
///
///         From steadfi/contracts, with DEPLOYER_PRIVATE_KEY loaded from the root .env.
///         Simulate first (no transactions sent):
///           forge script script/DeployMainnet.s.sol:DeployMainnet --rpc-url https://rpc.mainnet.arc.io
///         Then broadcast (key read from env, never passed on the command line):
///           forge script script/DeployMainnet.s.sol:DeployMainnet --rpc-url https://rpc.mainnet.arc.io \
///             --broadcast --slow --with-gas-price 20gwei --priority-gas-price 0 --gas-estimate-multiplier 110
///         (11 txs, ~11.9M gas limit → needs 0.239 USDC up front; ~0.217 USDC actually spent)
contract DeployMainnet is Script {
    // Arc Mainnet tokens (docs.arc.io/arc/references/contract-addresses, verified
    // 2026-10-28 via eth_getCode + decimals() on rpc.mainnet.arc.io)
    address constant USDC    = 0x3600000000000000000000000000000000000000;
    address constant CIR_BTC = 0x171A4217b86A807A64eB94757Db6849fb4bDbAA0;

    // Pyth Pro verifier on Arc mainnet (docs.pyth.network/price-feeds/pro/contract-addresses).
    // Same address as testnet; verified 2026-10-28 that a live Pyth Pro update
    // verifies on mainnet (verification_fee() = 1 wei).
    address constant PYTH_PRO = 0xACeA761c27A909d4D3895128EBe6370FDE2dF481;

    uint32 constant FEED_BTC_USD = 1;
    uint256 constant FEED_MAX_AGE = 300; // seconds; push a price before using the app

    // Launch caps — deliberately small while the contracts are unaudited.
    // Raise later with setSupplyCap/setBorrowCap (RISK_ADMIN) from /admin.
    uint256 constant USDC_SUPPLY_CAP   = 10_000e6;
    uint256 constant USDC_BORROW_CAP   = 8_000e6;
    uint256 constant CIRBTC_SUPPLY_CAP = 0.25e8; // 0.25 cirBTC

    uint16 constant BORROW_FEE_BPS = 50; // 0.5% origination fee on USDC

    function run() external {
        require(block.chainid == 5042, "Wrong chain: expected Arc Mainnet (5042)");
        _checkToken(USDC, 6);
        _checkToken(CIR_BTC, 8);
        require(PYTH_PRO.code.length > 0, "Pyth Pro verifier missing");

        // Accept the key with or without a 0x prefix (.env stores it bare).
        string memory raw = vm.envString("DEPLOYER_PRIVATE_KEY");
        bytes memory rb = bytes(raw);
        bool prefixed = rb.length >= 2 && rb[0] == "0" && (rb[1] == "x" || rb[1] == "X");
        uint256 pk = vm.parseUint(prefixed ? raw : string.concat("0x", raw));
        address deployer = vm.addr(pk);

        vm.startBroadcast(pk);

        LendingPool pool = new LendingPool(deployer);

        // base 0%, slope1 8%, slope2 100%, kink 90% (same as testnet)
        InterestRateModel irm = new InterestRateModel(0, 0.08e27, 1.00e27, 0.90e27);

        // USDC is priced at $1.00 by the adapter and needs no feed.
        PythOracleAdapter oracle = new PythOracleAdapter(deployer, PYTH_PRO);
        oracle.setFeed(CIR_BTC, FEED_BTC_USD, FEED_MAX_AGE);

        sToken    sUSDC   = new sToken("SteadFi Supply USDC", "sfUSDC", 6, address(pool), USDC);
        DebtToken dUSDC   = new DebtToken("SteadFi Debt USDC", "dUSDC", 6, address(pool), USDC);
        sToken    sCIRBTC = new sToken("SteadFi Supply cirBTC", "sfcirBTC", 8, address(pool), CIR_BTC);
        DebtToken dCIRBTC = new DebtToken("SteadFi Debt cirBTC", "dcirBTC", 8, address(pool), CIR_BTC);

        // USDC: lend-and-borrow only. cirBTC: collateral only.
        pool.addMarket(USDC, ILendingPool.MarketConfig({
            sToken: address(sUSDC), debtToken: address(dUSDC), interestModel: address(irm),
            oracle: address(oracle), decimals: 6,
            ltv: 0, liqThreshold: 0, liqBonus: 500, reserveFactor: 1000, closeFactor: 5000,
            supplyCap: USDC_SUPPLY_CAP, borrowCap: USDC_BORROW_CAP,
            borrowEnabled: true, collateralEnabled: false, active: true, paused: false
        }));
        pool.addMarket(CIR_BTC, ILendingPool.MarketConfig({
            sToken: address(sCIRBTC), debtToken: address(dCIRBTC), interestModel: address(irm),
            oracle: address(oracle), decimals: 8,
            ltv: 7000, liqThreshold: 7800, liqBonus: 800, reserveFactor: 1500, closeFactor: 5000,
            supplyCap: CIRBTC_SUPPLY_CAP, borrowCap: 0,
            borrowEnabled: false, collateralEnabled: true, active: true, paused: false
        }));

        pool.setBorrowFee(USDC, BORROW_FEE_BPS);

        vm.stopBroadcast();

        console.log("=== SteadFi Arc Mainnet deployment ===");
        console.log("Chain ID:", block.chainid);
        console.log("Deployer:", deployer);
        console.log("LendingPool:", address(pool));
        console.log("InterestRateModel:", address(irm));
        console.log("PythOracleAdapter:", address(oracle));
        console.log("sUSDC:", address(sUSDC));
        console.log("dUSDC:", address(dUSDC));
        console.log("sCIRBTC:", address(sCIRBTC));
        console.log("dCIRBTC:", address(dCIRBTC));
    }

    function _checkToken(address token, uint8 decimals) internal view {
        require(token.code.length > 0, "token has no code");
        require(IERC20Decimals(token).decimals() == decimals, "token decimals mismatch");
    }
}
