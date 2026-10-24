// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IPriceOracle} from "./interfaces/IPriceOracle.sol";
import {SteadFiAccessControl} from "./SteadFiAccessControl.sol";

/// @dev Minimal Pyth Pro (Lazer) verifier interface used on Arc Testnet.
interface IPythLazer {
    function verification_fee() external view returns (uint256);
    function verifyUpdate(bytes calldata update) external payable returns (bytes memory payload, address signer);
}

/// @title PythOracleAdapter
/// @notice Stores verified Pyth Pro (Lazer) prices and exposes IPriceOracle to LendingPool.
///
///         Arc Testnet only has the Pyth Pro verifier (0xACeA...2dF481); the legacy
///         Pyth Core deployment stopped receiving Hermes VAA updates when Pyth moved
///         to PNAU accumulator updates. This adapter therefore uses the Pro verifier:
///
///           updatePrices(bytes update) — keeper submits a signed Pro payload. The
///           adapter verifies it through PythLazer.verifyUpdate, parses the feeds,
///           and stores each configured asset's price + publish time.
///
///           getPrice(asset) — view, reads the last stored price. Reverts if the
///           feed was never updated or is older than the asset's maxAge.
///
///         Feed IDs are Pyth Pro numeric IDs:
///           BTC/USD = 1
///           ETH/USD = 2
///           EUR/USD = 327
///
///         USDC is always $1.00 and needs no feed. All stored prices are 1e18 USD.
contract PythOracleAdapter is IPriceOracle, SteadFiAccessControl {
    // -------------------------------------------------------------------------
    // Constants
    // -------------------------------------------------------------------------

    address public constant USDC = 0x3600000000000000000000000000000000000000;

    uint256 public constant PRICE_PRECISION = 1e18;
    uint256 public constant BPS_PRECISION   = 10_000;

    /// @dev Pyth Pro payload magic ("LAZR").
    uint32 private constant PAYLOAD_MAGIC = 2_479_346_549;

    // -------------------------------------------------------------------------
    // Storage
    // -------------------------------------------------------------------------

    struct AssetConfig {
        uint32  feedId;
        uint256 maxAge;
    }

    struct StoredPrice {
        uint256 price;
        uint64  publishTime;
        bool    set;
    }

    struct ParsedFeed {
        uint32  feedId;
        int64   price;
        int16   exponent;
        uint64  confidence;
        uint64  feedUpdateTimestamp;
        bool    hasPrice;
        bool    hasExponent;
        bool    hasConfidence;
        bool    hasFeedUpdateTimestamp;
    }

    /// @notice Pyth Pro verifier (PythLazer) on Arc Testnet.
    address public immutable pythLazer;

    mapping(address => AssetConfig) public assetConfigs;
    mapping(uint32  => address)     public assetByFeed;
    mapping(address => StoredPrice) public storedPrices;

    /// @notice Max confidence interval as bps of price (default 200 = 2%).
    uint256 public maxConfidenceBps = 200;

    // -------------------------------------------------------------------------
    // Events
    // -------------------------------------------------------------------------

    event FeedSet(address indexed asset, uint32 indexed feedId, uint256 maxAge);
    event PriceUpdated(address indexed asset, uint256 price, uint64 publishTime);
    event MaxConfidenceBpsUpdated(uint256 newBps);
    event RefundFailed(address indexed to, uint256 amount);

    // -------------------------------------------------------------------------
    // Constructor
    // -------------------------------------------------------------------------

    constructor(address owner, address pythLazer_) SteadFiAccessControl(owner) {
        require(pythLazer_ != address(0), "PY: zero pyth");
        pythLazer = pythLazer_;
    }

    // -------------------------------------------------------------------------
    // Admin
    // -------------------------------------------------------------------------

    /// @notice Configure the Pyth Pro feed used for `asset`.
    function setFeed(address asset, uint32 feedId, uint256 maxAge) external onlyRiskAdmin {
        require(asset != address(0) && asset != USDC, "PY: bad asset");
        require(feedId != 0, "PY: bad feed");
        require(maxAge > 0, "PY: bad age");

        uint32 old = assetConfigs[asset].feedId;
        if (old != 0) delete assetByFeed[old];

        assetConfigs[asset] = AssetConfig(feedId, maxAge);
        assetByFeed[feedId] = asset;
        emit FeedSet(asset, feedId, maxAge);
    }

    /// @notice Set the maximum acceptable confidence interval (bps of price).
    function setMaxConfidenceBps(uint256 bps) external onlyRiskAdmin {
        require(bps > 0 && bps <= BPS_PRECISION, "PY: bad bps");
        maxConfidenceBps = bps;
        emit MaxConfidenceBpsUpdated(bps);
    }

    // -------------------------------------------------------------------------
    // Keeper path
    // -------------------------------------------------------------------------

    /// @notice Verify one signed Pyth Pro update and store every configured feed it carries.
    /// @dev    The keeper requests all feeds in one payload, so one tx updates BTC, ETH and EUR.
    ///         Caller must send at least `IPythLazer(pythLazer).verification_fee()`.
    function updatePrices(bytes calldata update) external payable returns (uint256 updated) {
        uint256 fee = IPythLazer(pythLazer).verification_fee();
        require(msg.value >= fee, "PY: insufficient fee");

        (bytes memory payload, ) = IPythLazer(pythLazer).verifyUpdate{value: fee}(update);
        (uint64 updateTime, ParsedFeed[] memory feeds) = _parse(payload);

        for (uint256 i = 0; i < feeds.length; i++) {
            ParsedFeed memory f = feeds[i];
            address asset = assetByFeed[f.feedId];
            if (asset == address(0)) continue;

            require(f.hasPrice && f.hasExponent, "PY: missing price");
            AssetConfig memory cfg = assetConfigs[asset];

            uint64 publishTime = f.hasFeedUpdateTimestamp
                ? f.feedUpdateTimestamp / 1_000_000
                : updateTime;

            // A single dormant feed (e.g. EUR/USD idle for hours) must not
            // poison the whole batch — skip it; healthy feeds still update.
            // If NOTHING is fresh, the `updated > 0` require below reverts.
            if (publishTime + cfg.maxAge < block.timestamp) continue;

            // Prevent a replay of an older signed payload from overwriting a newer price.
            StoredPrice memory prev = storedPrices[asset];
            if (prev.set && publishTime <= prev.publishTime) continue;

            uint256 price = _normalise(f.price, f.exponent);

            // Wide-confidence feeds are skipped (keep last-known price) so one
            // volatile feed can't block updates for the others.
            if (f.hasConfidence && f.confidence != 0) {
                uint256 confBps = (uint256(f.confidence) * BPS_PRECISION) / uint256(uint64(f.price));
                if (confBps > maxConfidenceBps) continue;
            }

            storedPrices[asset] = StoredPrice(price, publishTime, true);
            emit PriceUpdated(asset, price, publishTime);
            updated++;
        }

        require(updated > 0, "PY: no fresh configured feeds");

        if (msg.value > fee) {
            (bool ok, ) = payable(msg.sender).call{value: msg.value - fee}("");
            if (!ok) emit RefundFailed(msg.sender, msg.value - fee);
        }
    }

    // -------------------------------------------------------------------------
    // IPriceOracle
    // -------------------------------------------------------------------------

    function getPrice(address asset) external view override returns (uint256) {
        if (asset == USDC) return PRICE_PRECISION;

        StoredPrice memory s = storedPrices[asset];
        require(s.set, "PY: no price");
        AssetConfig memory cfg = assetConfigs[asset];
        require(block.timestamp <= s.publishTime + cfg.maxAge, "PY: stale price");
        return s.price;
    }

    function isHealthy(address asset) external view override returns (bool) {
        if (asset == USDC) return true;
        StoredPrice memory s = storedPrices[asset];
        if (!s.set) return false;
        return block.timestamp <= s.publishTime + assetConfigs[asset].maxAge;
    }

    // -------------------------------------------------------------------------
    // Payload parsing
    // -------------------------------------------------------------------------

    /// @dev Payload layout:
    ///      header: magic u32 | timestamp u64 | channel u8 | feedsLen u8
    ///      feed:   feedId u32 | propertiesLen u8 | properties...
    ///      prop:   propertyId u8 | value
    ///      Values supported here: Price(int64), Exponent(int16), Confidence(u64),
    ///      FeedUpdateTimestamp(exists u8 + u64).
    function _parse(bytes memory payload)
        internal
        pure
        returns (uint64 timestamp, ParsedFeed[] memory feeds)
    {
        require(payload.length >= 14, "PY: short payload");
        require(_readU32(payload, 0) == PAYLOAD_MAGIC, "PY: bad payload magic");

        timestamp = _readU64(payload, 4);
        uint256 pos = 14; // 4 magic + 8 timestamp + 1 channel + 1 feedsLen
        uint8 feedsLen = _readU8(payload, 13);
        feeds = new ParsedFeed[](feedsLen);

        for (uint256 i = 0; i < feedsLen; i++) {
            ParsedFeed memory f;
            f.feedId = _readU32(payload, pos);
            pos += 4;

            uint8 numProps = _readU8(payload, pos);
            pos += 1;

            for (uint256 j = 0; j < numProps; j++) {
                uint8 prop = _readU8(payload, pos);
                pos += 1;

                if (prop == 0) { // Price
                    f.price = _readI64(payload, pos);
                    f.hasPrice = true;
                    pos += 8;
                } else if (prop == 4) { // Exponent
                    f.exponent = _readI16(payload, pos);
                    f.hasExponent = true;
                    pos += 2;
                } else if (prop == 5) { // Confidence
                    f.confidence = _readU64(payload, pos);
                    f.hasConfidence = true;
                    pos += 8;
                } else if (prop == 12) { // FeedUpdateTimestamp
                    uint8 exists = _readU8(payload, pos);
                    pos += 1;
                    if (exists != 0) {
                        f.feedUpdateTimestamp = _readU64(payload, pos);
                        f.hasFeedUpdateTimestamp = true;
                        pos += 8;
                    }
                } else {
                    revert("PY: unsupported property");
                }
            }

            feeds[i] = f;
        }

        require(pos == payload.length, "PY: trailing bytes");
    }

    function _readU8(bytes memory b, uint256 pos) private pure returns (uint8 v) {
        require(pos + 1 <= b.length, "PY: oob");
        assembly {
            v := shr(248, mload(add(add(b, 0x20), pos)))
        }
    }

    function _readU16(bytes memory b, uint256 pos) private pure returns (uint16 v) {
        require(pos + 2 <= b.length, "PY: oob");
        assembly {
            v := shr(240, mload(add(add(b, 0x20), pos)))
        }
    }

    function _readU32(bytes memory b, uint256 pos) private pure returns (uint32 v) {
        require(pos + 4 <= b.length, "PY: oob");
        assembly {
            v := shr(224, mload(add(add(b, 0x20), pos)))
        }
    }

    function _readU64(bytes memory b, uint256 pos) private pure returns (uint64 v) {
        require(pos + 8 <= b.length, "PY: oob");
        assembly {
            v := shr(192, mload(add(add(b, 0x20), pos)))
        }
    }

    function _readI16(bytes memory b, uint256 pos) private pure returns (int16) {
        return int16(_readU16(b, pos));
    }

    function _readI64(bytes memory b, uint256 pos) private pure returns (int64) {
        return int64(_readU64(b, pos));
    }

    /// @dev Pyth Pro price (int64, int16 exponent) to uint256 1e18.
    function _normalise(int64 price_, int16 expo_) internal pure returns (uint256) {
        require(price_ > 0, "PY: non-positive price");
        uint256 p = uint256(uint64(price_));

        if (expo_ >= 0) {
            return p * (10 ** (18 + uint256(uint16(expo_))));
        }

        uint256 negExpo = uint256(-int256(expo_));
        if (negExpo <= 18) {
            return p * (10 ** (18 - negExpo));
        }
        return p / (10 ** (negExpo - 18));
    }

    receive() external payable {}
}
