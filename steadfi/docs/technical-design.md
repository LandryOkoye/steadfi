# SteadFi — Technical Design Document
> Phase 0 — **APPROVED** (pending your written sign-off below).
> Last updated: October 2026 (rev 2 — oracle confirmation, rate model correction, mainnet caps)

---

## 1. Overview

SteadFi is an overcollateralized lending and borrowing protocol on Arc, Circle's stablecoin-native Layer 1. It is purpose-built around Arc's differentiators: USDC as the gas token, EURC as a first-class market, deterministic sub-second finality, Multicall3From for batched atomic flows, Memo for business-friendly repayment references, and Circle Wallets for email/passkey onboarding. Everything is denominated in dollars.

**Target users:** Retail users in Nigeria / SMEs / DAOs / Institutions seeking simplest USDC borrowing UX and EURC credit.

**Product tiers:**
- **Open tier** (anyone): supply, borrow, repay, withdraw, liquidate — USDC and EURC markets + cirBTC and WETH collateral.
- **Institutional tier** (allowlisted, feature-flagged, requires Circle approval): USYC isolated market, StableFX cross-currency settlement.

---

## 2. Verified Arc Facts

All values sourced from docs.arc.io on 2026-10-22. If any value conflicts with this doc, the live docs win.

### Network parameters

| Parameter | Testnet | Mainnet |
|---|---|---|
| Chain ID | 5042002 | 5042 |
| RPC | https://rpc.testnet.arc.io | https://rpc.mainnet.arc.io |
| Explorer | https://testnet.arcscan.app | https://explorer.arc.io |
| CCTP domain | 26 | 26 |
| Block time | ~0.5 s | ~0.5 s |
| Finality | Deterministic, < 1 s | Deterministic, < 1 s |
| Consensus | Proof of Authority (Malachite / Tendermint) | Same |
| EVM baseline | Osaka hard fork | Same |

### Stablecoin addresses (same on testnet and mainnet)

| Token | Address | Decimals | Notes |
|---|---|---|---|
| USDC (ERC-20) | `0x3600000000000000000000000000000000000000` | 6 | Also native gas token at 18 dec precision |
| Native USDC system emitter | `0xffffFFFfFFffffffffffffffFfFFFfffFFFfFFfE` | 18 | EIP-7708; indexers must filter by this vs ERC-20 address |

### EURC

| Network | Address | Decimals |
|---|---|---|
| Testnet | `0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a` | 6 |
| Mainnet | `0xbEf5f6d51CB62b58e6A8f77868681825C6fe21c1` | 6 |

### Collateral assets

| Token | Network | Address | Decimals | Bridge mechanism |
|---|---|---|---|---|
| cirBTC | Testnet | `0xf0C4a4CE82A5746AbAAd9425360Ab04fbBA432BF` | 8 | Circle FiatTokenProxy; no public faucet — request from Circle |
| cirBTC | Mainnet | `0x171A4217b86A807A64eB94757Db6849fb4bDbAA0` | 8 | Same |
| WETH | Testnet | `0x2c4047028a72803939b6fb674D01bC059B5C4961` | 18 | Lock-on-Ethereum, mint-on-Arc |
| WETH | Mainnet | `0x128cC466B61f542da60c70e3aA11c10e19B84EDB` | 18 | Same |

### USYC (institutional, feature-flagged)

| Contract | Network | Address | Decimals |
|---|---|---|---|
| USYC | Testnet | `0xe9185F0c5F296Ed1797AaE4238D26CCaBEadb86C` | 6 |
| Entitlements | Testnet | `0xcc205224862c7641930c87679e98999d23c26113` | — |
| Teller | Testnet | `0x9fdF14c5B14173D74C08Af27AebFf39240dC105A` | — |
| USYC | Mainnet | `0x8a5D989Bbb96929F689B0200f435f53dA42bF490` | 6 |
| Entitlements | Mainnet | `0xb69ecb156Dc0028198028c501340d5367845ca72` | — |
| Teller | Mainnet | `0x51A8CE47dC08ba5CD19c7aa84EA6fD6664f60f9b` | — |

### Predeployed Arc utility contracts (same on both networks)

| Contract | Address | Notes |
|---|---|---|
| Multicall3From | `0x522fAf9A91c41c443c66765030741e4AaCe147D0` | Batch + preserve msg.sender |
| Memo | `0x5294E9927c3306DcBaDb03fe70b92e01cCede505` | Attach payment reference to tx |

### Standard Ethereum contracts (same on Arc)

| Contract | Address |
|---|---|
| Multicall3 | `0xcA11bde05977b3631167028862bE2a173976CA11` |
| Permit2 | `0x000000000022D473030F116dDEE9F6B43aC78BA3` |
| CREATE2 factory | `0x4e59b44847b379578588920cA78FbF26c0B4956C` |

### CCTP contracts

| Contract | Testnet | Mainnet |
|---|---|---|
| TokenMessengerV2 | `0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA` | `0x28b5a0e9C621a5BadaA536219b3a228C8168cf5d` |
| MessageTransmitterV2 | `0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275` | `0x81D40F21F12A8F0E3252Bccb954D722d4c464B64` |

### Gateway

| Contract | Testnet | Mainnet |
|---|---|---|
| GatewayWallet | `0x0077777d7EBA4688BDeF3E311b846F25870A19B9` | `0x77777777Dcc4d5A8B6E418Fd04D8997ef11000eE` |
| GatewayMinter | `0x0022222ABE238Cc2C7Bb1f21003F0a260052475B` | `0x2222222d7164433c4C09B0b0D809a9b52C04C205` |

### StableFX (institutional, feature-flagged)

| Contract | Testnet | Mainnet |
|---|---|---|
| FxEscrow | `0xd68256f4D69C6BbEcB873D8588AE0Dc6B8E22E10` | `0xe2E5F173576B513d994073CCbDaCBE027d43DFe6` |

---

## 3. Delta from Prompt Assumptions

| Assumption in prompt | Verified fact | Delta |
|---|---|---|
| Explorer: testnet.arcscan.app | Confirmed (Blockscout-based) | No change |
| Chain IDs 5042002 / 5042 | Confirmed | No change |
| Memo predeployed | Confirmed at `0x5294...` | No change |
| Multicall3 predeployed | Standard Multicall3 at `0xcA11...` + Arc's Multicall3From at `0x522f...` | Two contracts: standard Multicall3 for read batching, Multicall3From for write batching with sender preservation |
| cirETH available | Not found in docs. Arc has WETH (bridged), not cirETH | Correction: use WETH as ETH collateral, not cirETH |
| cirBTC faucet available | No public faucet. Circle-whitelisted minting only | Gap: Phase 1 uses a mock cirBTC token for testing; production uses real cirBTC |
| Stork oracle address on testnet | `0xacC0a0cF13571d30B4b8637996F5D6D774d4fd62` — live but publishers not yet pushing data | Oracle gap documented below |

---

## 4. Oracle Research

### Available on Arc

| Provider | Status | Notes |
|---|---|---|
| Chainlink | Live (testnet + mainnet confirmed) | Best-documented; Data Feeds + Data Streams + CCIP + PoR; check Feed Explorer for specific feed addresses |
| Pyth | Live on testnet (confirmed July 2026) | Pull-model; high-frequency; check Pyth EVM contract addresses page for Arc |
| RedStone | Live (confirmed in Arc docs Sep 2026) | Push + pull + hybrid; good RWA/LST coverage |
| Chronicle | Live (confirmed in Arc docs) | MakerDAO lineage; strong for stablecoins and RWAs |
| Stork | Live on testnet (`0xacC0a0cF13571d30B4b8637996F5D6D774d4fd62`) but publishers not yet pushing data | Adapter built by community (ArcLend) already deployed |

### Confirmed live feed addresses (verified via Chainlink reference-data API 2026-10-22)

**Important finding: Chainlink feeds are deployed on Arc MAINNET only. Arc Testnet has no Chainlink feed contracts yet (confirmed by eth_getCode returning 0x on all proxy addresses).**

Arc mainnet Chainlink feeds (all 8 decimals, 24 h heartbeat):

| Feed | Proxy address | Heartbeat | Notes |
|---|---|---|---|
| BTC / USD | `0xa109B535C70C8Be9995be64Bb6751AcDB27e03De` | 86400 s | Primary for cirBTC collateral |
| ETH / USD | `0x50FCDD99D6762D1C170DC6A9111db944AEE6D364` | 86400 s | Primary for WETH collateral |
| EUR / USD | `0xDd5B15443cd733D3966a50a3E48cB7DF9Fb5DE0D` | 86400 s | Primary for EURC market |
| EURC / USD | `0x361b95c10b76Ca3f35C686d423e43A951755Bf23` | 86400 s | Depeg alert: alert if EURC/USD deviates > 0.5% from EUR/USD |
| USDC / USD | `0x84EA90AC252Dc437031461836DB5164219147905` | 86400 s | Sanity check only; protocol treats USDC = $1.00 |
| cirBTC Reserves (PoR) | `0xEB0884a871ea1f6483B5FC10fd3D7dC5806411fc` | 86400 s | Proof of Reserve for cirBTC; halt cirBTC market if PoR diverges |

For the EURC depeg alert: compute `abs(EURC/USD - EUR/USD) / EUR/USD`. If > 0.5%, emit `DepegAlert(eurc, delta)` and freeze new EURC borrows (not existing positions; those continue to allow repayment).

### Oracle strategy

**Testnet (Phase 1–3):** `MockPriceOracle` with admin-settable prices. Interface is `AggregatorV3Interface`-compatible; hot-swap to live oracle via `LendingPool.setOracle(asset, oracleAddr)` requires no redeployment.

**Testnet with live data (Phase 3+):** Pyth pull-model (confirmed live on Arc testnet since July 2026). Pyth requires the caller to include a signed price update in the transaction. A keeper wrapper handles this.

**Mainnet (Phase 5):** Chainlink push feeds as primary (24 h heartbeat, 0.5% deviation threshold). RedStone pull-model as fallback for assets where Chainlink is stale or paused. If both fail, the circuit breaker pauses the affected asset market. Staleness window: 3900 s (heartbeat + 5 min buffer).

**USYC NAV:** Chronicle (MakerDAO lineage, Arc-listed) for institutional-tier NAV feed. Fallback: Circle's published daily NAV with a 26 h staleness window (one update cycle + buffer). Verify Chronicle Arc deployment before Phase 2.

**USDC:** hardcoded at $1.00. No oracle call. This is standard practice for native stablecoins and eliminates the attack surface of manipulating a USDC/USD feed to cause false liquidations.

---

## 5. Codebase Decision: Write from Scratch (Compound V3 inspired, MIT-compatible)

### License analysis

| Protocol | License | Commercial use |
|---|---|---|
| Aave V3 | Business Source License 1.1 | Requires written permission from Aave; change date 2025-09-28 (now lapsed to GPL-2.0) but the Aave Companies retain trademark and some restrictions. Not worth the ambiguity for a commercial launch. |
| Compound V3 | MIT | Freely forkable; no commercial restrictions |
| Euler V2 | GPL-2.0 | Copyleft: derivative works must be open source |
| Morpho | MIT (core libraries) | Usable, but Morpho architecture is meta-lending; different product shape |

**Decision: write from scratch, structurally inspired by Compound V3 (MIT) but NOT a fork.**

Rationale:
1. Clean license with no ambiguity.
2. Arc-specific constraints (6-decimal USDC, native gas, blocklist resilience, EURC market) require enough contract surgery that forking Aave V3 would take as long as a clean write with higher legal risk.
3. The architecture is well-understood by auditors; a clean codebase is easier to audit than a heavily patched fork.
4. Compound V3 reference used for: interest index math (compound-per-second), health factor calculation approach, reserve accounting. All reimplemented from scratch.

**Places Aave/Compound assume ETH / 18 decimals (all addressed in design below):**
- Native asset handling (`msg.value`, `address.balance`) — SteadFi never reads native balance
- Token decimals assumed 18 — SteadFi normalizes all amounts to a 27-decimal Ray (RAY = 1e27) for internal math
- WETH wrapping — not needed on Arc; WETH is already an ERC-20
- Block-time assumptions for interest accrual — SteadFi uses `block.timestamp`, not block numbers

---

## 6. Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  User / Keeper / Indexer                                     │
└──────────────┬──────────────────────────────────────────────┘
               │  wagmi / viem / Multicall3From / Memo
               ▼
┌─────────────────────────────────────────────────────────────┐
│  LendingPool (central entry point)                           │
│  supply() borrow() repay() withdraw() liquidate()           │
│  accrueInterest()  getHealthFactor()  pause()               │
└───┬──────────┬───────────┬──────────┬────────────┬──────────┘
    │          │           │          │            │
    ▼          ▼           ▼          ▼            ▼
 Market     InterestRate  PriceOracle  AccessControl  ReserveVault
 Registry   Model         Adapter      (roles)        (protocol fees)
    │
    ▼
 sTokens (supply receipt ERC-20) + debtTokens (non-transferable)
```

**Isolated market for USYC (institutional, feature-flagged):**
```
┌──────────────────────────────────────┐
│  IsolatedPool (USYC)                  │
│  Only allowlisted addresses can call │
│  Checks Entitlements contract        │
│  Falls back to protocol liquidator   │
└──────────────────────────────────────┘
```

---

## 7. Smart Contract Inventory

### 7.1 LendingPool.sol
Central router. Delegates to markets by asset address. Emits events for every action. Guards: `nonReentrant`, `whenNotPaused(asset)`, `onlyActive(asset)`.

Key storage:
- `mapping(address => Market) markets` — per-asset config and state
- `mapping(address => mapping(address => Position)) positions` — user positions per asset
- `uint256 lastAccrualTimestamp` per market

Key functions:
```
supply(asset, amount, permit?)
withdraw(asset, amount)
borrow(asset, amount)
repay(asset, amount, memo?)
liquidate(borrower, debtAsset, collateralAsset, debtAmount)
accrueInterest(asset)
getHealthFactor(user) returns (uint256 hf, bool isHealthy)
```

### 7.2 Market.sol (library + struct)
Per-asset state: supply index, borrow index, total supply shares, total borrow shares, last accrual timestamp, supply cap, borrow cap, reserve factor, LTV, liquidation threshold, liquidation bonus, close factor, paused flag, active flag.

### 7.3 InterestRateModel.sol
Kinked (two-slope) rate model per Compound V3:
```
if utilization <= kink:
    borrowRate = baseRate + (utilization / kink) * slope1
else:
    borrowRate = baseRate + slope1 + ((utilization - kink) / (1 - kink)) * slope2
supplyRate = borrowRate * utilization * (1 - reserveFactor)
```
All rates per-second. Parameters per asset.

### 7.4 PriceOracleAdapter.sol
Wraps `AggregatorV3Interface` (Chainlink-compatible). Staleness check on `updatedAt`. Deviation bound check vs last accepted price. Circuit breaker pauses asset on bad data. `IPriceOracle` interface allows hot-swap.

### 7.5 sToken.sol (Supply Receipt Token)
ERC-20 representing share of supply. Rebasing: `balanceOf` returns `shares * supplyIndex`. Minted on `supply`, burned on `withdraw`. Non-custodial: underlying never leaves the pool.

### 7.6 DebtToken.sol
Non-transferable ERC-20 tracking borrow shares per user. Minted on `borrow`, burned on `repay`. `transfer` and `transferFrom` always revert.

### 7.7 AccessControl.sol
Roles: `OWNER`, `RISK_ADMIN`, `PAUSE_GUARDIAN`, `LIQUIDATION_EXECUTOR` (for protocol fallback liquidator). Uses OpenZeppelin `AccessControl`. Timelock on `RISK_ADMIN` actions (48 h on mainnet, 1 h on testnet).

### 7.8 Timelock.sol
Standard 2-step timelock (queue + execute). 48 h delay on mainnet risk-parameter changes. OWNER can cancel queued transactions.

### 7.9 IsolatedPool.sol (institutional, feature-flagged)
Separate pool for USYC collateral. All callers checked against `IEntitlements(entitlementsContract).isAllowlisted(caller)` before any action. Fallback liquidator path for when no external liquidator is available.

### 7.10 StableFXAdapter.sol (institutional, feature-flagged)
Wraps FxEscrow to allow cross-currency repayment. Always checks "no quote available" path and falls back to same-currency repayment. Never blocks a liquidation on an RFQ quote.

---

## 8. Asset List and Risk Parameters (Testnet Launch)

All values are conservative starting points. They will be reviewed and adjusted before mainnet.

**Testnet caps (for testing scale):**

| Asset | Role | LTV | Liq. Threshold | Liq. Bonus | Reserve Factor | Supply Cap | Borrow Cap | Oracle |
|---|---|---|---|---|---|---|---|---|
| USDC | Supply + Borrow + Collateral | 85% | 90% | 5% | 10% | 10M USDC | 8M USDC | Hardcoded $1.00 |
| EURC | Supply + Borrow + Collateral | 83% | 88% | 5% | 10% | 5M EURC | 4M EURC | EUR/USD Chainlink |
| cirBTC | Collateral only | 70% | 78% | 8% | 15% | 50 cirBTC | 0 | BTC/USD Chainlink |
| WETH | Collateral only | 72% | 80% | 8% | 15% | 200 WETH | 0 | ETH/USD Chainlink |
| USYC (flag) | Isolated collateral | 80% | 85% | 5% | 10% | 1M USDC equiv | 800k USDC equiv | Chronicle NAV |

**Mainnet guarded-launch caps (conservative, raised only after review):**

| Asset | Supply Cap | Borrow Cap | Rationale |
|---|---|---|---|
| USDC | 500k USDC | 400k USDC | ~5% of testnet; raised weekly if no incidents |
| EURC | 250k EURC | 200k EURC | Smaller liquidity pool at launch |
| cirBTC | 2 cirBTC | 0 | No borrow at launch; ~$200k at launch price |
| WETH | 10 WETH | 0 | No borrow at launch; ~$30k at launch price |
| USYC (flag) | 100k USDC equiv | 80k USDC equiv | Requires Circle approval before enabling |

Caps are stored as configurable parameters (not hardcoded). RISK_ADMIN via Timelock can raise them. Supply cap raises of >50% require the full 48h Timelock delay.

**Close factor:** 50% (max fraction of debt a liquidator can repay in one call).

**Cross-collateral borrowing:**
- USDC collateral can borrow EURC (and vice versa) — same health-factor logic, EUR/USD oracle applied.
- cirBTC and WETH can borrow USDC or EURC.

**Decimal normalization:**
All internal accounting uses a 27-decimal Ray (1e27). Token amounts are scaled on entry and unscaled on exit. This handles 6-decimal USDC, 8-decimal cirBTC, and 18-decimal WETH uniformly.

---

## 9. Interest Rate Parameters (Initial, Testnet)

| Asset | Base Rate (APR) | Slope 1 (APR) | Kink | Slope 2 (APR) | Target Utilization |
|---|---|---|---|---|---|
| USDC | 0% | 8% | 90% | 100% | 90% |
| EURC | 0% | 8% | 90% | 100% | 90% |

**Corrected rate math (reserve factor applies to supply rate, NOT borrow rate):**

At exactly 90% utilization (the kink):
- **Borrow APR = baseRate + slope1 = 0% + 8% = 8.00%** (exact)
- Supply APY = borrowRate × utilization × (1 − reserveFactor) = 8% × 0.90 × 0.90 = **6.48%**

Above the kink (e.g. 95% utilization):
- Borrow APR = 8% + (5% / 10%) × 100% = **58%** (steep jump, designed to restore liquidity quickly)
- Supply APY at 95% = 58% × 0.95 × 0.90 = **49.6%** (attracts capital fast)

All rates are per-second on-chain: `ratePerSecond = APR / 365 / 24 / 3600`. The kinked formula prevents continuous compounding drift.

---

## 10. Decimal Handling Rules (Critical — Arc specific)

1. **Never read `address.balance` or `msg.value` for protocol accounting.** Any native USDC sent to a contract is refunded.
2. **All USDC amounts use the ERC-20 interface at `0x3600...`** with 6 decimals.
3. **All internal math uses Ray (1e27).** Token amounts are scaled to Ray on entry: `rayAmount = tokenAmount * 10^(27 - tokenDecimals)`. Unscaled on exit: `tokenAmount = rayAmount / 10^(27 - tokenDecimals)`. Rounding always in protocol's favor (round up debt, round down supply).
4. **USDC and EURC both have 6 decimals.** cirBTC has 8, WETH has 18.
5. **Never mix 6-decimal (ERC-20) and 18-decimal (native) USDC raw values.** If conversion is needed, use `usdcToGasToken` / `gasTokenToUsdc` from `@/onchain-money`.

---

## 11. Blocklist Resilience

Arc's USDC contract enforces Circle's blocklist. A blocklisted address causes any ERC-20 `transfer`, `transferFrom`, or native send to/from it to revert. This must not brick a market.

**Design rules:**
1. **Pull-based withdrawals:** users call `withdraw()`; the pool does not push USDC to users. If a supplier is blocklisted, their sTokens still exist; they cannot withdraw until Circle unblocklists them. This is acceptable and disclosed.
2. **Liquidation of a blocklisted borrower:** the liquidator sends USDC to repay debt (pull from liquidator — succeeds as long as liquidator is not blocklisted). The pool tries to transfer collateral to the liquidator. If the collateral transfer reverts (borrower blocklisted causes collateral transfer to revert from borrower's balance), we use a claim pattern: collateral is recorded in `pendingCollateral[liquidator]` and the liquidator calls `claimCollateral()` separately. This ensures debt is always repayable.
3. **Blocklisted liquidator:** if the collateral transfer to the liquidator reverts, the `liquidate()` call reverts entirely. Liquidators must ensure they are not blocklisted. The protocol fallback liquidator (USYC isolated pool) is monitored for blocklist status.
4. **Tests:** explicit tests for all three scenarios using a mock USDC that simulates blocklist reverts.

---

## 12. Liquidation Design

**Atomic liquidation in one transaction:**
```
liquidate(borrower, debtAsset, collateralAsset, debtAmount)
  1. Check: HF < 1.0
  2. Check: debtAmount <= debt * closeFactor
  3. transferFrom(liquidator, pool, debtAmount)   // liquidator sends repayment
  4. Accrue interest, reduce borrower debt
  5. Calculate seize amount = debtAmount * price(debt/collateral) * (1 + liquidationBonus)
  6. Try: transfer(collateral, liquidator, seizeAmount)
     If blocked: pendingCollateral[liquidator] += seizeAmount
  7. Emit Liquidated(borrower, debtAsset, collateralAsset, debtAmount, seizeAmount)
```

**Keeper profit math (USDC-native):**
- Gas cost: ~300k gas * 20 Gwei base fee ≈ 0.000006 USDC (negligible vs. liquidation bonus)
- Minimum profitable liquidation: anything where `seizeAmount - debtAmount > $0.01`
- At 8% liquidation bonus and $50k BTC position: liquidator profit ≈ $4,000 per liquidation minus ~$0.006 gas

**Batched liquidations via Multicall3From:**
The keeper can batch up to N liquidation calls in one transaction. Multicall3From preserves msg.sender so each call sees the keeper address.

---

## 13. Access Control Matrix

| Role | Who holds it | Powers | Timelock |
|---|---|---|---|
| OWNER | 3-of-5 multisig (mainnet) | Add/remove markets, upgrade Timelock, transfer roles | 48 h |
| RISK_ADMIN | Timelock contract | Set LTV, thresholds, caps, rate parameters, reserve factor | 48 h |
| PAUSE_GUARDIAN | 1-of-1 hot wallet | Pause any single asset market or all markets | Immediate |
| LIQUIDATION_EXECUTOR | Protocol keeper address | Call `liquidate()` on isolated USYC pool as fallback | None |

On testnet: deployer holds all roles. Before mainnet: transfer OWNER to multisig, RISK_ADMIN to Timelock, PAUSE_GUARDIAN to monitoring wallet.

---

## 14. Upgrade Strategy

**Phase 1-4 (testnet):** No proxy. Contracts are immutable for simplicity and security. Upgrade = redeploy + data migration script + updated deployments/testnet.json.

**Phase 5 (mainnet launch):** Transparent proxy pattern (OpenZeppelin `TransparentUpgradeableProxy`) for LendingPool and IsolatedPool. ProxyAdmin held by the 3-of-5 multisig. Upgrade requires multisig quorum AND Timelock 48h delay. Logic contracts verified on explorer.

**What stays immutable forever:** sToken and DebtToken ERC-20 contracts (users hold these; proxy would be confusing). If these need fixing, deploy new versions and migrate.

---

## 15. Threat Model (Top 10 Vectors)

| # | Vector | Mitigation |
|---|---|---|
| T1 | Oracle manipulation (flash-loan price spike) | Chainlink TWAP + staleness check + deviation bound; market pauses on bad price |
| T2 | Reentrancy in supply/borrow/liquidate | `nonReentrant` on all state-changing functions; checks-effects-interactions pattern |
| T3 | Decimal mismatch (6 vs 18 native USDC) | All accounting via ERC-20 at 6 dec; native balance never read; explicit tests |
| T4 | Interest index overflow | Ray (1e27) arithmetic with explicit overflow guards; Solidity 0.8+ checked math |
| T5 | USDC blocklist bricking market | Pull-based withdrawals; claim-collateral pattern for blocked liquidations |
| T6 | Liquidation gas griefing | Multicall3From batching; keeper fallback; USDC gas ≈ $0.001, economically negligible |
| T7 | Admin key compromise | Multisig + Timelock; pause guardian as last resort; separate role per action |
| T8 | Supply/borrow cap bypass via rounding | Integer math rounds in protocol's favor; caps checked post-accrual |
| T9 | Isolated pool contamination (USYC) | Entitlements check on every call; separate contract, separate storage |
| T10 | StableFX unavailability blocking liquidation | Liquidation path never depends on RFQ quote; StableFX only for user repayment |

---

## 16. Arc-Specific Feature Implementation Plan

| Feature | Implementation |
|---|---|
| USDC as gas | No special handling needed — gas just works. Frontend shows `eth_estimateGas * gasPrice` in USDC using 18-dec native precision, converted to 6-dec display via `gasTokenToUsdc`. |
| EURC market | Separate market config; EUR/USD oracle; cross-currency health factor normalized to USD |
| Multicall3From batching | Frontend uses Multicall3From for "deposit + borrow" and "repay + withdraw" one-click flows |
| Gasless approvals | Permit2 for all ERC-20 approvals; EIP-2612 permit where token supports it (EURC does) |
| Repayment memos | `repay()` accepts optional `bytes memory memo` and calls `IMemo(MEMO_CONTRACT).memo(lendingPool, memo)` before transfer. Events include memo hash. Indexer stores full memo. |
| Instant confirmations | UI treats `onSuccess` of wagmi `useWriteContract` as final. No "waiting for confirmations" state. |
| Bridge-in flow | Bridge Kit / CCTP flow: source chain → burn USDC → mint on Arc → supply to pool. One guided 3-step modal. |
| Smart-account onboarding | Circle Modular Wallets (passkey / email) + standard injected wallet. **Testnet:** sponsor up to 5 USDC per new wallet, first 3 transactions. **Mainnet:** sponsor up to $0.25 per new wallet, first 3 transactions, subject to a protocol-level global budget cap (configurable by RISK_ADMIN). Keeper monitors spend vs budget and stops sponsoring when global cap is reached. |
| Unified transfer event | Indexer filters ERC-20 `Transfer` events only from `0x3600...`; ignores `0xffff...` system emitter to avoid double-counting. |

---

## 17. Monorepo Structure

```
steadfi/
  contracts/
    src/
      LendingPool.sol
      Market.sol
      InterestRateModel.sol
      PriceOracleAdapter.sol
      MockPriceOracle.sol          # testnet only
      sToken.sol
      DebtToken.sol
      AccessControl.sol
      Timelock.sol
      IsolatedPool.sol             # INSTITUTIONAL_FEATURE flag
      StableFXAdapter.sol          # INSTITUTIONAL_FEATURE flag
      interfaces/
        ILendingPool.sol
        IPriceOracle.sol
        IInterestRateModel.sol
        IEntitlements.sol
        IStableFX.sol
        IMemo.sol
      libraries/
        RayMath.sol
        DecimalNormalizer.sol
        HealthFactor.sol
    test/
      LendingPool.t.sol
      InterestRateModel.t.sol
      PriceOracleAdapter.t.sol
      Liquidation.t.sol
      BlocklistResilience.t.sol
      DecimalPrecision.t.sol
      Invariants.t.sol
    script/
      Deploy.s.sol
      DeployMocks.s.sol
    deployments/
      testnet.json
      mainnet.json                 # empty until Phase 5
  keeper/
    src/
      index.ts
      monitor.ts
      liquidate.ts
      config.ts
    package.json
  indexer/
    src/
      index.ts
      events.ts
      api.ts
      db.ts
    package.json
  web/
    src/
      App.tsx
      components/
      hooks/
      utils/
    package.json
  docs/
    technical-design.md            # this file
    threat-model.md
    incident-runbook.md
    audit-prep.md
  .github/
    workflows/
      ci.yml
  foundry.toml
  remappings.txt
  README.md
```

---

## 18. CI Plan

GitHub Actions on every push and PR:

```yaml
jobs:
  contracts:
    - forge build
    - forge test --gas-report
    - forge coverage (require >= 95% on core contracts)
    - slither analysis (warn on high/critical)
  keeper:
    - bun install && bun run typecheck && bun run lint
  indexer:
    - bun install && bun run typecheck && bun run lint
  web:
    - bun install && bun run check (lint + typecheck)
    - bun run build
```

---

## 19. Phase 0 Exit Criteria Checklist

- [x] All Arc contract addresses verified against docs.arc.io
- [x] Chain IDs 5042002 (testnet) and 5042 (mainnet) confirmed
- [x] USDC address `0x3600...` confirmed same on both networks
- [x] EURC testnet `0x89B5...`, mainnet `0xbEf5...` confirmed
- [x] cirBTC testnet `0xf0C4...`, mainnet `0x1714...` confirmed
- [x] WETH testnet `0x2c40...`, mainnet `0x128c...` confirmed
- [x] USYC testnet/mainnet addresses confirmed
- [x] Multicall3From `0x522f...`, Memo `0x5294...` confirmed (both networks)
- [x] CCTP, Gateway, StableFX addresses confirmed
- [x] Oracle providers identified: Chainlink (live), Pyth (live testnet), RedStone (live), Chronicle (live), Stork (live testnet, data pending)
- [x] Oracle gap documented: use MockPriceOracle in Phase 1; integrate Chainlink primary in Phase 2
- [x] Collateral gap documented: cirBTC has no public faucet; Phase 1 uses mock token
- [x] Fork decision: clean-room write inspired by Compound V3 (MIT), confirmed no license risk
- [x] Decimal mismatch locations identified and addressed in design
- [x] Blocklist resilience pattern designed
- [x] Monorepo structure defined
- [ ] Design doc approved by you — AWAITING YOUR APPROVAL
- [ ] Smoke-test contract deployed to Arc Testnet — ready to run after approval

---

## 20. Open Questions for You

1. **cirBTC faucet:** should I request a cirBTC testnet allocation from Circle now, or proceed with a mock and swap to real cirBTC later?
2. **Oracle choice:** Chainlink as primary and RedStone as pull-model fallback. Agree, or prefer Pyth?
3. **EURC oracle:** EUR/USD spot or EURC/USD? Do you want a cross-rate (EURC/USDC) derived from two feeds, or a direct EUR/USD feed?
4. **Stablecoin supply/borrow caps (testnet):** the proposal is 10M USDC and 5M EURC. Higher, lower, or the same?
5. **Gas sponsorship budget:** 5 USDC per new wallet, first 3 transactions. Does that fit your budget?
6. **USYC timeline:** should I start the Circle application for USYC testnet allowlisting now, or wait until Phase 2?
