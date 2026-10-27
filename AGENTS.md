# SteadFi

> Overcollateralized USDC/EURC lending and borrowing on Arc — built with Arc Studio.

This is the **project memory** — what Arc Studio remembers about building this app.

## SteadFi Phase 0 — Completed 2026-10-22

### Arc Testnet Deployments
| Contract | Address | Explorer |
|---|---|---|
| SmokeTest | `0xc85f7C6DCFC9ca544c72EBAb93881A34485B1652` | https://testnet.arcscan.app/address/0xc85f7C6DCFC9ca544c72EBAb93881A34485B1652 |

### Deployer wallet (testnet only)
`0xbDD5A7a963EcA056f5A416268B1C2AC833E3e432`

### Key verified addresses (Arc Testnet)
- USDC ERC-20: `0x3600000000000000000000000000000000000000`
- EURC: `0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a`
- cirBTC: `0xf0C4a4CE82A5746AbAAd9425360Ab04fbBA432BF`
- WETH: `0x2c4047028a72803939b6fb674D01bC059B5C4961`
- Multicall3From: `0x522fAf9A91c41c443c66765030741e4AaCe147D0`
- Memo: `0x5294E9927c3306DcBaDb03fe70b92e01cCede505`

## SteadFi Phase 1 — Completed 2026-10-22

### All Arc Testnet Deployments (live pool redeployed 2026-10-26: security fixes + 0.5% borrow fee; Timelock/IRMs/oracle reused)
| Contract | Address | Explorer |
|---|---|---|
| Timelock | `0x6C50DDcf4CAf08C8C41644b9372a1B2c1f245947` | https://explorer.testnet.arc.io/address/0x6C50DDcf4CAf08C8C41644b9372a1B2c1f245947 |
| LendingPool | `0x57E1066DA815DD1c1DD1adA82859729ce7f82989` | https://explorer.testnet.arc.io/address/0x57E1066DA815DD1c1DD1adA82859729ce7f82989 |
| IRM_Stable | `0xA4eCC81c1566abFc55355ba8ED2725400E41D1e6` | https://explorer.testnet.arc.io/address/0xA4eCC81c1566abFc55355ba8ED2725400E41D1e6 |
| IRM_Collateral | `0xFB64d2c8dac257F7c29a0A7fD7A4FA8d668DF7C1` | https://explorer.testnet.arc.io/address/0xFB64d2c8dac257F7c29a0A7fD7A4FA8d668DF7C1 |
| PythOracleAdapter (Pyth Pro) | `0x42c69A87e59Cf8Dd845df2197d569745E7bb5730` | https://explorer.testnet.arc.io/address/0x42c69A87e59Cf8Dd845df2197d569745E7bb5730 |
| sUSDC | `0x8e48bC49b0D356467c97c6A0C3Fb27f1d5407836` | https://explorer.testnet.arc.io/address/0x8e48bC49b0D356467c97c6A0C3Fb27f1d5407836 |
| dUSDC | `0x3C757dd39e31E2887791Ee247421d389cdAa197C` | https://explorer.testnet.arc.io/address/0x3C757dd39e31E2887791Ee247421d389cdAa197C |
| sEURC | `0x2aa7BcE6187CBCb3636b24a0a955b390a2b04E2f` | https://explorer.testnet.arc.io/address/0x2aa7BcE6187CBCb3636b24a0a955b390a2b04E2f |
| dEURC | `0x3173b17F76401a2a7295EEF464A12b13cC35F870` | https://explorer.testnet.arc.io/address/0x3173b17F76401a2a7295EEF464A12b13cC35F870 |
| sCIRBTC | `0xa01abcae53928d48113487228f21943106C826cc` | https://explorer.testnet.arc.io/address/0xa01abcae53928d48113487228f21943106C826cc |
| dCIRBTC | `0x32332a2b83dE3a4Bd758Ea24F81d362D28918880` | https://explorer.testnet.arc.io/address/0x32332a2b83dE3a4Bd758Ea24F81d362D28918880 |
| sWETH | `0xcd04ECa348427B272cEEead3973a7aFd7Ca270B6` | https://explorer.testnet.arc.io/address/0xcd04ECa348427B272cEEead3973a7aFd7Ca270B6 |
| dWETH | `0x770ec4BDe6E655893C7bb3B8288Ec57732ed9F83` | https://explorer.testnet.arc.io/address/0x770ec4BDe6E655893C7bb3B8288Ec57732ed9F83 |

Pool deployed at block `69205409` (`POOL_DEPLOY_BLOCK` in `src/lib/steadfi.ts`). Script: `steadfi/contracts/script/RedeployPool.s.sol`.
Previous pool `0x252E8662C945e340195B35816a3f9259CA264e8C` (2026-10-24) is superseded; `LEGACY_POOL` in `src/lib/steadfi.ts`, and the dashboard shows a withdraw banner to anyone with funds there.

### Loan durations (new 2026-10-24)
- `borrowWithTerm(asset, amount, durationDays)` — predefined terms **7/14/30/60/90/180 days** (`isValidDuration`).
- Term metadata on-chain: `getLoanTerm(user, asset) → (borrowedAt, durationDays, dueTimestamp)`, `isLoanOverdue`.
- Repay any time (no penalty); liquidation remains purely HF-driven. Full repay or full liquidation clears the term.

### UI redesign (2026-10-26, Aave-inspired)
- Routes: `/` landing (light, `.theme-light`), user app in `AppShell` (top nav): `/dashboard`, `/markets`, `/markets/:symbol`, `/bridge`, `/history`; `/admin/*` separate shell (amber accent marks the admin environment).
- Supply / Withdraw / Borrow / Repay are **modals** (`src/components/actions/*`, opened via `useActions().openAction(type, symbol)`). Old `/supply` etc. redirect to `/dashboard?action=…`.
- Tokens in `src/index.css` (`:root, .theme-dark` dark; `.theme-light` landing). Components use tokens only. `.mono` = tabular numerals. Chart colour `--color-chart-1` validated with the dataviz palette checker.
- Token logos from `@web3icons/react` (`TokenIcon`). Lazy chunks: AdminApp, AssetDetail (recharts), Bridge (Circle App Kit) — main bundle ~1.7 MB.

### Brand (2026-10-26)
- Logo from `~/Downloads/SteadFi Logo concept.pdf`: rounded tile + single-stroke S (`src/components/ui/Logo.tsx`, `public/favicon.svg`). Steady Navy `#0F172A`, Ledger Green `#10B981`, Paper `#F8FAFC`; wordmark Space Grotesk SemiBold −4.5%. Green tile on dark UI, navy tile on light (landing). Accent tokens use Ledger Green.

### Admin console (added 2026-10-26)
- Route `/admin/*` in the same app, **lazily loaded** (`src/admin/`, own chunk) and gated by on-chain roles (`useAdminRoles`: OWNER / RISK_ADMIN / PAUSE_GUARDIAN on the pool, or Timelock `admin()`). The contracts are the security boundary; the gate is UX only.
- Tabs: Overview (TVL, borrowed, cash, revenue, per-market table, oracle age, keeper gas, alerts), Markets (pause, borrow fee, risk params), Treasury (`withdrawReserves`, capped at pool cash), Access (role holders from events, grant/revoke), Timelock (queued changes, execute/cancel).
- Risk changes: direct if the wallet holds RISK_ADMIN, otherwise queued through the Timelock (`queueTransaction` with raw calldata, eta = now + delay + 2 min).
- No admin link in the user app; admins open `/admin` directly. Hosting must serve `index.html` for unknown paths (SPA fallback) so `/admin` deep links work.
- Product decision: **anyone** can supply USDC/EURC (lenders fund all borrows).

### RPC / logs (2026-10-26)
- Public Arc RPC returns HTTP 429 to parallel `eth_getLogs`; sequential calls are fine (~0.5s each). `src/lib/logs.ts` scans sequentially in 5k-block chunks, filters server-side by topic (History filters by the user), and checkpoints to localStorage after every chunk.
- Production: set `VITE_ARC_RPC_URL` to a dedicated RPC provider (first in the fallback list). Add an indexer before history grows large.

### Hosting (2026-10-27)
- Web app on **Vercel** (`vercel.json`): `bun run build` → `dist`, SPA fallback to `index.html`, and `/arc-rpc` rewritten to the Arc RPC so the same-origin proxy in `src/config.ts` works in production too.
- Keeper on **Render** as a background worker (`render.yaml`, Starter plan): `steadfi/keeper`, `npm run start:node` (tsx). `KEEPER_PRIVATE_KEY` / `PYTH_API_KEY` are set in the Render dashboard (`sync: false`). Run only one keeper at a time.
- Never put secrets in `VITE_*` variables — they are bundled into the public JS.

### Protocol revenue — borrow (origination) fee (added 2026-10-26, live since redeploy)
- `borrowFeeBps[asset]`: one-time fee added to the borrower's **debt** on every borrow (they receive the full amount); credited to `reservesRay`, collected on repay, withdrawn by OWNER via `withdrawReserves`.
- Default 50 bps (0.5%) on USDC/EURC (`DeployPhase1.s.sol`); `setBorrowFee` (RISK_ADMIN) capped at `MAX_BORROW_FEE = 200` (2%). `previewBorrowFee(asset, amount)` rounds up.
- On top of the existing interest spread (`reserveFactor` 10% stable / 15% collateral markets).
- Borrow UI shows fee, "You receive", debt after borrow, total cost and total to repay. Pools without `borrowFeeBps` read as 0%.

### Oracle resilience (fixed 2026-10-24)
- The EUR/USD Lazer feed went dormant for hours; the old adapter reverted the WHOLE `updatePrices` batch when one feed was stale → all prices froze.
- New adapter **skips** stale / wide-confidence feeds and still applies fresh ones (`updated > 0` still required).
- Keeper (`steadfi/keeper/src/keeper.ts`) defaults updated; survives transient RPC/API errors without exiting.

### Frontend hardening (fixed 2026-10-24)
- All wagmi reads/writes pinned to `chainId 5042002` — a wallet on the wrong network can no longer silently produce empty balances/failed txs.
- `WrongNetworkBanner` with one-click switch shown when connected on another chain.
- History scans from `POOL_DEPLOY_BLOCK` in ≤5,000-block chunks (Arc RPC rejects larger `eth_getLogs` ranges); previously a single 100k-block query always failed silently.

### Collateral model
- **cirBTC** and **WETH** only: `collateralEnabled=true`, non-zero LTV/liqThreshold
- **USDC** and **EURC**: lend-and-borrow only, `collateralEnabled=false`, `ltv=0`, `liqThreshold=0`

### Oracle — Pyth Pro (Lazer)
- Pyth Core on Arc (`0x2880aB…7B43`) is stale (v1.4.5-alpha, PNAU-only Hermes) — **do not use**.
- Pyth Pro verifier: `0xACeA761c27A909d4D3895128EBe6370FDE2dF481` (`verification_fee() = 1 wei`)
- Adapter: `0xb0e392899a9446F22Fc6bbe49c651c013fA35174` (stores price + publishTime, `updatePrices(bytes)`)
- Feed IDs: BTC/USD=`1`, ETH/USD=`2`, EUR/USD=`327`; maxAge 300s
- REST: `POST https://pyth-lazer.dourolabs.app/v1/latest_price` with `Authorization: Bearer $PYTH_API_KEY`
- Keeper (`steadfi/keeper/src/keeper.ts`) refreshes prices and liquidates HF<1; supports `RUN_ONCE=1`

### E2E proof txs (2026-10-23, on the superseded pool 0x8016C2… — kept for reference)
- Supply 5 USDC: `0x8520975bfed646dc74007ae305cea27316941581e31b3c0dfa530f8e89618a42`
- Supply 0.0001 cirBTC: `0x942e907f5092d37de1205b9f0261cc60d59246bd318ba115cc0918f7c8c5a19f`
- Borrow 5 USDC: `0x38e54f6e2bb71b4fb90bd86c1a4ff8d120edf1c7ada4d95e837b79bbb83ac29b`
- Repay all (memo): `0x1a8f449399bec9abf340a4a14d4404acdd83abc0d503065c4d053f05782737d9`
- Withdraw 5 USDC: `0xff2cd22d6ccf00fa58f719b02e03094664c58dfcd81e73288bc5c7cfe5a023b6`
- Withdraw 0.0001 cirBTC: `0x672ddb4e616f05cc10e2a55feafffda1cdda3238c8cec5027cbb4256202ce142`
- Liquidation (keeper): `0xa747283f483e8ca567da4b6bc0de34b5403bc904934d2ebed8078a4b36e688e9`
- Temporary risk change + restore: `0x1aec57bd8307af0e5e90a21fbde40916c6f25c2625cb2ea65cceee60b314ee59` / `0x6032399411c2352104be0d4fc8d2e6e298654f6d333397896944c6fecb964b8d`

### Source files
- `src/lib/steadfi.ts` — all deployed addresses + ABIs
- `src/hooks/useSteadFi.ts` — wagmi hooks for live reads/writes
- `steadfi/contracts/deployments/testnet.json` — full deployment manifest

---

## What This App Does

[Brief description of what the app does and its primary use case]

## Tech Stack

- Frontend: React 18, Vite, TypeScript, Tailwind CSS
- Web3: wagmi v2, viem v2, ConnectKit
- Contracts: Solidity 0.8.28 + Foundry. Sources in `contracts/`, unit tests in `contracts/test/*.t.sol`. Build with `bun run contracts:build` (`forge build`), test with `bun run contracts:test` (`forge test`).
- Wallet: injected (MetaMask, etc.)
- Chain: Arc Testnet (Chain ID: 5042002, imported from `viem/chains`)
- Token: USDC (6 decimals) (Address: 0x3600000000000000000000000000000000000000, Chain: Arc Testnet)
- Toasts: Sonner

## Key Files

- `src/App.tsx` - Main application logic
- `src/components/` - UI components
- `src/config.ts` - wagmi config (chains, connectors, transports)

## To Run

```bash
bun install
bun run dev
```
