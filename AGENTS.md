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

### All Arc Testnet Deployments (Phase 1 — live redeploy 2026-10-24, loan durations + oracle resilience)
| Contract | Address | Explorer |
|---|---|---|
| Timelock | `0x6C50DDcf4CAf08C8C41644b9372a1B2c1f245947` | https://explorer.testnet.arc.io/address/0x6C50DDcf4CAf08C8C41644b9372a1B2c1f245947 |
| LendingPool | `0x252E8662C945e340195B35816a3f9259CA264e8C` | https://explorer.testnet.arc.io/address/0x252E8662C945e340195B35816a3f9259CA264e8C |
| IRM_Stable | `0xA4eCC81c1566abFc55355ba8ED2725400E41D1e6` | https://explorer.testnet.arc.io/address/0xA4eCC81c1566abFc55355ba8ED2725400E41D1e6 |
| IRM_Collateral | `0xFB64d2c8dac257F7c29a0A7fD7A4FA8d668DF7C1` | https://explorer.testnet.arc.io/address/0xFB64d2c8dac257F7c29a0A7fD7A4FA8d668DF7C1 |
| PythOracleAdapter (Pyth Pro) | `0x42c69A87e59Cf8Dd845df2197d569745E7bb5730` | https://explorer.testnet.arc.io/address/0x42c69A87e59Cf8Dd845df2197d569745E7bb5730 |
| sUSDC | `0xd1bb560d75374eF90C78C9dEdf1e2C1d2e881b1C` | https://explorer.testnet.arc.io/address/0xd1bb560d75374eF90C78C9dEdf1e2C1d2e881b1C |
| dUSDC | `0x36F1dF20B6f61ae840B7ACf5B6B6D2E14Dd3e07E` | https://explorer.testnet.arc.io/address/0x36F1dF20B6f61ae840B7ACf5B6B6D2E14Dd3e07E |
| sEURC | `0x781CD39D22bD8511DDB453BF0CDc717F54A53d11` | https://explorer.testnet.arc.io/address/0x781CD39D22bD8511DDB453BF0CDc717F54A53d11 |
| dEURC | `0xA6634Fd478583a15eE6487d15f66Fe8D1665187E` | https://explorer.testnet.arc.io/address/0xA6634Fd478583a15eE6487d15f66Fe8D1665187E |
| sCIRBTC | `0x37bEE970fBA42c25f766dB7eE5e7fF2D4EF79063` | https://explorer.testnet.arc.io/address/0x37bEE970fBA42c25f766dB7eE5e7fF2D4EF79063 |
| dCIRBTC | `0xC7ec43E4A867F3A0217248718679CeAa08e2e6De` | https://explorer.testnet.arc.io/address/0xC7ec43E4A867F3A0217248718679CeAa08e2e6De |
| sWETH | `0x9F48c6c273A23f9e3Cc141BFFfD796EcdA1Fe7D4` | https://explorer.testnet.arc.io/address/0x9F48c6c273A23f9e3Cc141BFFfD796EcdA1Fe7D4 |
| dWETH | `0x0Be718E5F962Ea4b84defe0ec46e787376BE1832` | https://explorer.testnet.arc.io/address/0x0Be718E5F962Ea4b84defe0ec46e787376BE1832 |

Pool deployed at block `68770501` (`POOL_DEPLOY_BLOCK` in `src/lib/steadfi.ts`).

### Loan durations (new 2026-10-24)
- `borrowWithTerm(asset, amount, durationDays)` — predefined terms **7/14/30/60/90/180 days** (`isValidDuration`).
- Term metadata on-chain: `getLoanTerm(user, asset) → (borrowedAt, durationDays, dueTimestamp)`, `isLoanOverdue`.
- Repay any time (no penalty); liquidation remains purely HF-driven. Full repay or full liquidation clears the term.

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
