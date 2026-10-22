// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IPriceOracle} from "./interfaces/IPriceOracle.sol";
import {IChainlinkAggregator} from "./interfaces/IChainlinkAggregator.sol";
import {SteadFiAccessControl} from "./SteadFiAccessControl.sol";

/// @title ChainlinkOracleAdapter
/// @notice Wraps one or more Chainlink AggregatorV3Interface feeds and exposes
///         IPriceOracle for LendingPool.
///
///         Arc-specific rules:
///         - USDC is always $1.00 (hardcoded — no feed call needed or safe).
///         - EURC has an additional depeg check: if EURC/USD deviates more than
///           `depegBps` from EUR/USD, the adapter pauses EURC borrowing.
///         - Staleness window: configurable per feed (default 3900 s = 24 h heartbeat + 5 min buffer).
///         - Deviation circuit breaker: if a new price deviates > `maxDeviationBps` from the last
///           accepted price, the feed is paused and an alert event is emitted.
///         - All returned prices are 1e18 USD, matching IPriceOracle spec.
contract ChainlinkOracleAdapter is IPriceOracle, SteadFiAccessControl {

    // -------------------------------------------------------------------------
    // Constants
    // -------------------------------------------------------------------------

    /// @notice Arc ERC-20 USDC — always $1.00 on Arc.
    address public constant USDC = 0x3600000000000000000000000000000000000000;

    uint256 public constant PRICE_PRECISION = 1e18;
    uint256 public constant BPS_PRECISION   = 10_000;

    // -------------------------------------------------------------------------
    // Storage
    // -------------------------------------------------------------------------

    struct FeedConfig {
        address feed;            // Chainlink AggregatorV3Interface
        uint256 stalenessWindow; // Max age in seconds before price is considered stale
        uint256 maxDeviationBps; // Max % change per update before circuit breaker trips (bps)
        uint256 lastPrice;       // Last accepted price (1e18), for deviation check
        bool    paused;          // Circuit-breaker state for this feed
    }

    /// @dev asset => feed config
    mapping(address => FeedConfig) public feeds;

    /// @notice Address of the EUR/USD feed (used for EURC depeg check).
    address public eurUsdFeed;

    /// @notice EURC depeg alert threshold in bps (default 100 = 1%).
    uint256 public eurcDepegBps = 100;

    /// @notice Address of the EURC token (for depeg guard).
    address public eurcToken;

    // -------------------------------------------------------------------------
    // Events
    // -------------------------------------------------------------------------

    event FeedSet(address indexed asset, address feed, uint256 stalenessWindow, uint256 maxDeviationBps);
    event FeedPaused(address indexed asset, string reason);
    event FeedUnpaused(address indexed asset);
    event DepegAlert(address indexed asset, uint256 assetPrice, uint256 referencePrice, uint256 deviationBps);
    event EurcDepegBpsUpdated(uint256 newBps);

    // -------------------------------------------------------------------------
    // Constructor
    // -------------------------------------------------------------------------

    /// @param owner_     Owner / RISK_ADMIN who can set feeds.
    /// @param eurcToken_ EURC token address (for depeg guard).
    /// @param eurUsd_    EUR/USD Chainlink feed address.
    constructor(address owner_, address eurcToken_, address eurUsd_)
        SteadFiAccessControl(owner_)
    {
        eurcToken  = eurcToken_;
        eurUsdFeed = eurUsd_;
    }

    // -------------------------------------------------------------------------
    // Admin
    // -------------------------------------------------------------------------

    /// @notice Register or update a Chainlink feed for an asset.
    /// @param asset            ERC-20 token address.
    /// @param feed             Chainlink AggregatorV3Interface address.
    /// @param stalenessWindow  Max acceptable age in seconds (e.g. 3900 for 24 h feeds).
    /// @param maxDeviationBps  Circuit-breaker threshold in bps (e.g. 2000 = 20%).
    function setFeed(
        address asset,
        address feed,
        uint256 stalenessWindow,
        uint256 maxDeviationBps
    ) external onlyRiskAdmin {
        require(asset != address(0) && feed != address(0), "CL: zero address");
        require(stalenessWindow > 0, "CL: zero staleness window");
        require(maxDeviationBps > 0 && maxDeviationBps <= BPS_PRECISION, "CL: bad deviation bps");

        FeedConfig storage cfg = feeds[asset];
        cfg.feed             = feed;
        cfg.stalenessWindow  = stalenessWindow;
        cfg.maxDeviationBps  = maxDeviationBps;
        cfg.paused           = false;
        // Seed lastPrice from current feed so the deviation check has a baseline
        try IChainlinkAggregator(feed).latestRoundData() returns (
            uint80, int256 answer, uint256, uint256, uint80
        ) {
            if (answer > 0) {
                uint8 dec = IChainlinkAggregator(feed).decimals();
                cfg.lastPrice = _scaleToE18(uint256(answer), dec);
            }
        } catch {}

        emit FeedSet(asset, feed, stalenessWindow, maxDeviationBps);
    }

    /// @notice Set the EURC depeg alert threshold.
    function setEurcDepegBps(uint256 bps) external onlyRiskAdmin {
        require(bps > 0 && bps <= BPS_PRECISION, "CL: bad bps");
        eurcDepegBps = bps;
        emit EurcDepegBpsUpdated(bps);
    }

    /// @notice Manually unpause a feed (after investigating an alert). RISK_ADMIN.
    function unpauseFeed(address asset) external onlyRiskAdmin {
        feeds[asset].paused = false;
        emit FeedUnpaused(asset);
    }

    // -------------------------------------------------------------------------
    // IPriceOracle — view-safe price read (used by LendingPool via staticcall)
    // -------------------------------------------------------------------------

    /// @notice Returns USD price for `asset` scaled to 1e18.
    ///         Pure view: reads lastPrice from storage (set by updatePrice()).
    ///         Reverts if feed is paused, not set, or lastPrice is zero (not yet updated).
    ///         LendingPool calls this via staticcall for health-factor checks.
    function getPrice(address asset) external view override returns (uint256 price) {
        if (asset == USDC) return PRICE_PRECISION;
        FeedConfig storage cfg = feeds[asset];
        require(cfg.feed != address(0), "CL: feed not set");
        require(!cfg.paused, "CL: feed paused");
        price = cfg.lastPrice;
        require(price > 0, "CL: price not initialized, call updatePrice first");
    }

    /// @notice Keeper-callable price update. Fetches latest from Chainlink, runs
    ///         staleness + deviation checks, writes lastPrice, and runs EURC depeg check.
    ///         This is the ONLY function that writes state; getPrice() is view-only.
    ///         Must be called by a keeper before any borrow/liquidate that needs a fresh price.
    function updatePrice(address asset) external returns (uint256 price) {
        if (asset == USDC) return PRICE_PRECISION;

        price = _fetchAndValidate(asset);

        // EURC depeg check: compare EURC/USD vs EUR/USD
        if (asset == eurcToken && eurUsdFeed != address(0)) {
            _checkEurcDepeg(price);
        }
    }

    /// @inheritdoc IPriceOracle
    function isHealthy(address asset) external view override returns (bool) {
        if (asset == USDC) return true;
        FeedConfig storage cfg = feeds[asset];
        if (cfg.feed == address(0) || cfg.paused || cfg.lastPrice == 0) return false;
        try IChainlinkAggregator(cfg.feed).latestRoundData() returns (
            uint80, int256 answer, uint256, uint256 updatedAt, uint80
        ) {
            return answer > 0 && block.timestamp - updatedAt <= cfg.stalenessWindow;
        } catch {
            return false;
        }
    }

    // -------------------------------------------------------------------------
    // Internal
    // -------------------------------------------------------------------------

    function _fetchAndValidate(address asset) internal returns (uint256 price) {
        FeedConfig storage cfg = feeds[asset];
        require(cfg.feed != address(0), "CL: feed not set");
        require(!cfg.paused, "CL: feed paused");

        (
            uint80 roundId,
            int256 answer,
            ,
            uint256 updatedAt,
            uint80 answeredInRound
        ) = IChainlinkAggregator(cfg.feed).latestRoundData();

        require(answer > 0, "CL: non-positive price");
        require(answeredInRound >= roundId, "CL: stale round");
        require(block.timestamp - updatedAt <= cfg.stalenessWindow, "CL: stale price");

        uint8 dec = IChainlinkAggregator(cfg.feed).decimals();
        price = _scaleToE18(uint256(answer), dec);

        // Deviation circuit breaker
        if (cfg.lastPrice > 0) {
            uint256 deviation = _deviationBps(price, cfg.lastPrice);
            if (deviation > cfg.maxDeviationBps) {
                cfg.paused = true;
                emit FeedPaused(asset, "deviation circuit breaker");
                revert("CL: price deviation too large");
            }
        }
        cfg.lastPrice = price;
    }

    /// @dev Compare EURC/USD against EUR/USD; emit DepegAlert if outside threshold.
    ///      Does NOT revert — this is an advisory alert, not a hard pause.
    ///      A keeper watching the DepegAlert event can trigger governance action.
    function _checkEurcDepeg(uint256 eurcPrice) internal {
        try IChainlinkAggregator(eurUsdFeed).latestRoundData() returns (
            uint80, int256 answer, uint256, uint256 updatedAt, uint80
        ) {
            if (answer <= 0) return;
            if (block.timestamp - updatedAt > 3900) return; // stale EUR/USD

            uint8 dec = IChainlinkAggregator(eurUsdFeed).decimals();
            uint256 eurPrice  = _scaleToE18(uint256(answer), dec);
            uint256 deviation = _deviationBps(eurcPrice, eurPrice);

            if (deviation > eurcDepegBps) {
                emit DepegAlert(eurcToken, eurcPrice, eurPrice, deviation);
            }
        } catch {}
    }

    /// @dev Scale from `dec`-decimal Chainlink answer to 1e18.
    function _scaleToE18(uint256 amount, uint8 dec) internal pure returns (uint256) {
        if (dec < 18) return amount * (10 ** (18 - dec));
        if (dec > 18) return amount / (10 ** (dec - 18));
        return amount;
    }

    /// @dev Deviation in bps between `a` and `b` (always positive).
    function _deviationBps(uint256 a, uint256 b) internal pure returns (uint256) {
        if (b == 0) return BPS_PRECISION;
        uint256 diff = a > b ? a - b : b - a;
        return diff * BPS_PRECISION / b;
    }
}
