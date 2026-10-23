// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IPriceOracle} from "./interfaces/IPriceOracle.sol";
import {SteadFiAccessControl} from "./SteadFiAccessControl.sol";

/// @title PythOracleAdapter
/// @notice Wraps the Pyth Network oracle (pull model) and exposes IPriceOracle for LendingPool.
///
///         Pyth uses a pull model: price data is published off-chain and submitted on-chain
///         by a keeper before each read. This adapter separates two paths:
///
///         READ path (view):
///           getPrice(asset) — reads the last on-chain Pyth price. Returns the price if it
///           was updated within `maxAge` seconds; reverts as "PY: price too stale" otherwise.
///           This is called via staticcall by LendingPool._assetPriceRay — must remain view.
///
///         UPDATE path (state-mutating):
///           updatePrice(asset, pythPriceUpdateData) — submits fresh Pyth price update data
///           on-chain, paying the Pyth update fee, then reads the fresh price.
///           Called by the keeper before borrow / liquidate.
///
///         Arc-specific rules:
///         - USDC is always $1.00 (hardcoded — no feed needed).
///         - EURC has an additional depeg check: if the EURC price deviates more than
///           `eurcDepegBps` from the EUR/USD price, a DepegAlert event is emitted (non-reverting).
///         - All returned prices are 1e18 USD, matching IPriceOracle.
///
///         Pyth contract on Arc Testnet: 0x2880aB155794e7179c9eE2e38200202908C17B43
///         (verified onchain 2026-10-22 — eth_getCode returns 177 bytes)
///
///         Price feed IDs (stable, same on all EVM chains):
///           BTC/USD: 0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43
///           ETH/USD: 0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace
///           EUR/USD: 0xa995d00bb36a63cef7fd2c287dc105fc8f3d93779f062f09551b0af3e81ec30b
///
///         Pyth prices have variable exponents. The adapter normalises to 1e18 USD.
contract PythOracleAdapter is IPriceOracle, SteadFiAccessControl {

    // -------------------------------------------------------------------------
    // Types — minimal inline Pyth structs (avoids adding pyth-sdk as a dep)
    // -------------------------------------------------------------------------

    struct PythPrice {
        int64  price;
        uint64 conf;
        int32  expo;
        uint   publishTime;
    }

    // -------------------------------------------------------------------------
    // Constants
    // -------------------------------------------------------------------------

    /// @notice Arc ERC-20 USDC — always $1.00.
    address public constant USDC = 0x3600000000000000000000000000000000000000;

    uint256 public constant PRICE_PRECISION = 1e18;
    uint256 public constant BPS_PRECISION   = 10_000;

    // -------------------------------------------------------------------------
    // Storage
    // -------------------------------------------------------------------------

    /// @notice Pyth oracle contract on this chain.
    address public immutable pyth;

    struct AssetConfig {
        bytes32 feedId;     // Pyth price feed ID
        uint256 maxAge;     // Max acceptable price age in seconds (e.g. 60)
    }

    /// @dev asset => config
    mapping(address => AssetConfig) public assetConfigs;

    /// @notice EURC token address (for depeg check).
    address public eurcToken;

    /// @notice EURC depeg alert threshold in bps (default 100 = 1%).
    uint256 public eurcDepegBps = 100;

    /// @notice EUR/USD feed ID for EURC depeg check.
    bytes32 public eurUsdFeedId;

    // -------------------------------------------------------------------------
    // Events
    // -------------------------------------------------------------------------

    event FeedSet(address indexed asset, bytes32 feedId, uint256 maxAge);
    event DepegAlert(address indexed asset, uint256 assetPrice, uint256 referencePrice, uint256 deviationBps);
    event EurcDepegBpsUpdated(uint256 newBps);

    // -------------------------------------------------------------------------
    // Constructor
    // -------------------------------------------------------------------------

    /// @param owner_     Owner / RISK_ADMIN.
    /// @param pyth_      Pyth oracle contract address on this chain.
    /// @param eurcToken_ EURC token address (for depeg guard).
    /// @param eurUsdFeedId_ EUR/USD Pyth feed ID (for EURC depeg check).
    constructor(
        address owner_,
        address pyth_,
        address eurcToken_,
        bytes32 eurUsdFeedId_
    ) SteadFiAccessControl(owner_) {
        require(pyth_ != address(0), "PY: zero pyth");
        pyth          = pyth_;
        eurcToken     = eurcToken_;
        eurUsdFeedId  = eurUsdFeedId_;
    }

    // -------------------------------------------------------------------------
    // Admin
    // -------------------------------------------------------------------------

    /// @notice Register or update a Pyth feed for an asset.
    function setFeed(
        address asset,
        bytes32 feedId,
        uint256 maxAge
    ) external onlyRiskAdmin {
        require(asset  != address(0), "PY: zero asset");
        require(feedId != bytes32(0), "PY: zero feedId");
        require(maxAge > 0,           "PY: zero maxAge");
        assetConfigs[asset] = AssetConfig(feedId, maxAge);
        emit FeedSet(asset, feedId, maxAge);
    }

    /// @notice Set the EURC depeg alert threshold.
    function setEurcDepegBps(uint256 bps) external onlyRiskAdmin {
        require(bps > 0 && bps <= BPS_PRECISION, "PY: bad bps");
        eurcDepegBps = bps;
        emit EurcDepegBpsUpdated(bps);
    }

    // -------------------------------------------------------------------------
    // IPriceOracle — view-safe price read (staticcall compatible)
    // -------------------------------------------------------------------------

    /// @notice Returns USD price for `asset` scaled to 1e18.
    ///         Reads from Pyth's on-chain state via getPriceNoOlderThan; reverts if stale.
    ///         This is view-compatible because Pyth's getPriceNoOlderThan is a view function.
    ///         LendingPool calls this via staticcall for all health-factor checks.
    function getPrice(address asset) external view override returns (uint256 price) {
        if (asset == USDC) return PRICE_PRECISION;

        AssetConfig storage cfg = assetConfigs[asset];
        require(cfg.feedId != bytes32(0), "PY: feed not set");

        // getPriceNoOlderThan(bytes32 id, uint age) is view on Pyth
        // Reverts with 0x19abf40e (StalePrice) if the on-chain price is older than `maxAge`
        price = _readPythPrice(cfg.feedId, cfg.maxAge);
    }

    /// @inheritdoc IPriceOracle
    function isHealthy(address asset) external view override returns (bool) {
        if (asset == USDC) return true;
        AssetConfig storage cfg = assetConfigs[asset];
        if (cfg.feedId == bytes32(0)) return false;
        // Try reading — if it reverts (stale), return false
        try this._tryReadPythPrice(cfg.feedId, cfg.maxAge) returns (uint256 p) {
            return p > 0;
        } catch {
            return false;
        }
    }

    // -------------------------------------------------------------------------
    // Keeper: submit fresh price update data to Pyth, then read price
    // -------------------------------------------------------------------------

    /// @notice Submit a fresh Pyth price update for `asset` and return the new price.
    ///         Called by the keeper before any borrow or liquidation.
    ///         `priceUpdateData` is fetched from Hermes (https://hermes.pyth.network).
    ///         Caller must send enough native USDC to cover the Pyth update fee:
    ///           uint fee = IPyth(pyth).getUpdateFee(priceUpdateData);
    ///           adapter.updatePrice{value: fee}(asset, priceUpdateData);
    function updatePrice(
        address asset,
        bytes[] calldata priceUpdateData
    ) external payable returns (uint256 price) {
        if (asset == USDC) return PRICE_PRECISION;

        AssetConfig storage cfg = assetConfigs[asset];
        require(cfg.feedId != bytes32(0), "PY: feed not set");

        // Pay Pyth update fee and submit update
        uint256 fee = _getUpdateFee(priceUpdateData);
        (bool updateOk,) = pyth.call{value: fee}(
            abi.encodeWithSelector(bytes4(0xa36a15c6), priceUpdateData)
        );
        require(updateOk, "PY: updatePriceFeeds failed");

        // Read freshly updated price
        price = _readPythPrice(cfg.feedId, cfg.maxAge);

        // EURC depeg check
        if (asset == eurcToken && eurUsdFeedId != bytes32(0)) {
            _checkEurcDepeg(price, priceUpdateData);
        }

        // Refund excess payment (Pyth may charge less than getUpdateFee in some cases)
        if (address(this).balance > 0) {
            (bool ok,) = msg.sender.call{value: address(this).balance}("");
            require(ok, "PY: refund failed");
        }
    }

    // -------------------------------------------------------------------------
    // Internal helpers (call Pyth via low-level calls to avoid build dependency)
    // -------------------------------------------------------------------------

    /// @dev Calls Pyth.getPriceNoOlderThan(feedId, maxAge) — view function on Pyth.
    ///      Returns normalised 1e18 price. Reverts if stale or feed not on-chain.
    ///
    ///      PythStructs.Price ABI layout (4 words × 32 bytes):
    ///        word 0: price (int64, padded as int256)
    ///        word 1: conf  (uint64, padded as uint256)
    ///        word 2: expo  (int32, padded as int256)
    ///        word 3: publishTime (uint256)
    function _readPythPrice(bytes32 feedId, uint256 maxAge) internal view returns (uint256) {
        // getPriceNoOlderThan(bytes32,uint256) selector: 0xd49e6776
        (bool ok, bytes memory data) = pyth.staticcall(
            abi.encodeWithSelector(bytes4(0xd49e6776), feedId, maxAge)
        );
        require(ok && data.length >= 128, "PY: price call failed");

        // Manually read word 0 (price, int64) and word 2 (expo, int32) from raw bytes.
        // data layout: [word0: 32][word1: 32][word2: 32][word3: 32]
        // Each word is big-endian, right-aligned in 32 bytes (ABI encoding for int/uint types).
        int256 word0;
        int256 word2val;
        // solhint-disable-next-line no-inline-assembly
        assembly {
            word0   := mload(add(data, 32))   // first 32-byte word (past length prefix)
            word2val := mload(add(data, 96))  // third 32-byte word
        }
        int64 price_ = int64(word0);
        int32 expo_  = int32(word2val);

        return _normalise(price_, expo_);
    }

    /// @dev External wrapper for isHealthy try/catch.
    function _tryReadPythPrice(bytes32 feedId, uint256 maxAge) external view returns (uint256) {
        return _readPythPrice(feedId, maxAge);
    }

    /// @dev Normalise Pyth price (int64, int32 exponent) to uint256 1e18.
    function _normalise(int64 price_, int32 expo_) internal pure returns (uint256) {
        require(price_ > 0, "PY: non-positive price");
        uint256 p = uint256(uint64(price_));
        if (expo_ >= 0) {
            uint256 scale = uint256(int256(expo_));
            // Pyth exponents can be positive (e.g. for very large-integer assets)
            // Multiply by 10^expo then normalise to 1e18
            // e.g. p=95000, expo=0 → 95000 → scaled by 1e18 / 10^0 = 1e18
            // For typical crypto feeds expo is negative (e.g. -8)
            return p * (10 ** (18 + scale));
        } else {
            uint256 negExpo = uint256(int256(-expo_));
            // p * 10^(18 - negExpo)  when negExpo <= 18
            // p / 10^(negExpo - 18)  when negExpo > 18 (very high precision assets)
            if (negExpo <= 18) {
                return p * (10 ** (18 - negExpo));
            } else {
                return p / (10 ** (negExpo - 18));
            }
        }
    }

    /// @dev getUpdateFee(bytes[] calldata updateData) selector: 0x9e2f2b9c
    function _getUpdateFee(bytes[] calldata updateData) internal view returns (uint256 fee) {
        (bool ok, bytes memory data) = pyth.staticcall(
            abi.encodeWithSelector(bytes4(0x9e2f2b9c), updateData)
        );
        require(ok && data.length >= 32, "PY: getUpdateFee failed");
        fee = abi.decode(data, (uint256));
    }

    /// @dev Compare EURC/USD against EUR/USD; emit DepegAlert if outside threshold.
    ///      Non-reverting — advisory only.
    function _checkEurcDepeg(uint256 eurcPrice, bytes[] calldata) internal {
        // EUR/USD: read current on-chain price (must already be updated in this block or recently)
        (bool ok, bytes memory data) = pyth.staticcall(
            abi.encodeWithSelector(bytes4(0xd49e6776), eurUsdFeedId, uint256(3900))
        );
        if (!ok || data.length < 128) return;

        int256 eurWord0;
        int256 eurWord2;
        assembly {
            eurWord0 := mload(add(data, 32))
            eurWord2 := mload(add(data, 96))
        }
        int64 eurRaw  = int64(eurWord0);
        int32 eurExpo = int32(eurWord2);
        if (eurRaw <= 0) return;

        uint256 eurPrice = _normalise(eurRaw, eurExpo);
        if (eurPrice == 0) return;

        uint256 deviation = eurcPrice > eurPrice
            ? (eurcPrice - eurPrice) * BPS_PRECISION / eurPrice
            : (eurPrice - eurcPrice) * BPS_PRECISION / eurPrice;

        if (deviation > eurcDepegBps) {
            emit DepegAlert(eurcToken, eurcPrice, eurPrice, deviation);
        }
    }

    // -------------------------------------------------------------------------
    // Arc safety: accept native USDC for Pyth fees; refund any excess
    // -------------------------------------------------------------------------
    receive() external payable {}
}
