# SteadFi

> Overcollateralized USDC/EURC lending and borrowing on Arc — built with Arc Studio.

SteadFi is a DeFi lending protocol where lenders supply USDC or EURC to earn interest, and borrowers post cirBTC or WETH as collateral to take out fixed-term loans. Interest accrues in real time via Ray-based math, prices are streamed from Pyth (Lazer), and a keeper bot monitors health factors and executes liquidations when positions fall below their liquidation threshold.

Built end-to-end with [Arc Studio](https://studio.arc.io/) — protocol contracts, React frontend, keeper bot, and deployment to Arc.

**Hosted app:** https://steadfi.vercel.app  
**License:** GNU General Public License v3.0 (`LICENSE.md`)

---

## What it does

| Feature | Details |
|---------|---------|
| **Supply / lend** | USDC and EURC — anyone can supply; lenders fund all borrows and earn the supply-side spread |
| **Borrow against crypto** | Deposit cirBTC or WETH as collateral; borrow USDC or EURC. Loan terms of 7, 14, 30, 60, or 180 days |
| **Flexible repayment** | Repay any time with no penalty; liquidation is purely health-factor driven |
| **Real-time interest accrual** | Per-block interest rate models — stable-market IRM plus a steeper IRM for collateral markets |
| **Protocol revenue** | One-time borrow (origination) fee plus interest spread, collected into reserves |
| **Governed risk parameters** | Applied directly by RISK_ADMIN or queued through a Timelock (testnet only; mainnet v1 has no Timelock) |
| **On-chain admin console** | `/admin/*` — pause markets, tune risk, manage treasury, execute timelocked changes |
| **Automated keeper** | `steadfi/keeper` — refreshes oracle prices and liquidates undercollateralized positions |

---

## Architecture

| Layer | Tech |
|-------|------|
| Contracts | Solidity 0.8.28, Foundry, OpenZeppelin v5 |
| Frontend | React 18, TypeScript, Vite, Tailwind CSS, wagmi v2, viem, ConnectKit |
| Charts | Recharts |
| Wallets / bridge | ConnectKit, Circle App Kit (CCTP bridge) |
| Oracles | Pyth Pro (Lazer) price feeds via an on-chain adapter |
| Automation | TypeScript keeper (`steadfi/keeper`) |
| Hosting | Frontend on Vercel; **keeper runs locally** (no hosted keeper) |

### Core contracts (Arc Mainnet, chainId 5042)

| Contract | Address |
|----------|---------|
| LendingPool | `0xc85f7C6DCFC9ca544c72EBAb93881A34485B1652` |
| InterestRateModel | `0x84393560Bc91a1C2eDea435dfdb704Ad17df0886` |
| PythOracleAdapter | `0x4B526e6f7E1d82959E0f95F14B2e7f7893C67A6B` |
| sUSDC | `0x72540DB2aFe9f6C0b07Ae1E8358c1D22AD12fF1F` |
| dUSDC | `0x4AaFD6AA21712E0231EE276C40F9981E6Bd52433` |
| sEURC | `0x0cC0032b8299b517A1111E59E11a476F71b9A9Ab` |
| dEURC | `0xa5dc8CDb0D575D894DDc40f7eF914B852a091E08` |
| sCIRBTC | `0xe3e65b944aaa9c7B6fF632DDA7a36d2cE71ac672` |
| dCIRBTC | `0x1f279771B5A0E38e68BC0EcaEC8C7827430Bf564` |
| sWETH | `0xC0d1B3E34939c5942745CfF3d9D51850aC4c5D5c` |
| dWETH | `0x4264570Af421bbD69BAD69594E11E07A378fa105` |

### Transaction Hashes (Arc Mainnet, chainId 5042)

| Action | Tx hash |  |
|----------|---------|-------------|
| LendingPool deployment| `0xc85f7C6DCFC9ca544c72EBAb93881A34485B1652` | ` ` |
| PythOracleAdapter deployment| `` |
| First Supply | `` |
| First Borrow | `` |
| First Repay | `` |

### Collateral model

| Asset | Role | LTV | Liq. threshold | Liq. bonus |
|-------|------|-----|----------------|------------|
| cirBTC | Collateral only | 70% | 78% | 8% |
| WETH | Collateral only | 72% | 80% | 8% |
| USDC | Lend & borrow | — | — | — |
| EURC | Lend & borrow | — | — | — |

### Mainnet notes

- **No Timelock on mainnet v1** — the deployer (`0xbDD5A7a963EcA056f5A416268B1C2AC833E3e432`) holds OWNER, RISK_ADMIN, and PAUSE_GUARDIAN.
- **Borrow fee:** 0.5% (50 bps) on USDC and EURC, added to debt on every borrow.
- **Caps:** USDC supply 10M / borrow 8M; EURC supply 10M / borrow 8M; cirBTC supply 0.25 (borrowing disabled); WETH supply 5 (borrowing disabled).
- **Oracle:** Pyth Pro (Lazer), feeds BTC/USD (1), ETH/USD (2), EUR/USD (327), maxAge 300s. The keeper must push at least one price update before any borrow/collateral action involving cirBTC, WETH, or EURC. USDC price is hardcoded to $1.
- **Gas:** Arc uses USDC as the native gas token (18 decimals).

---

## Try the hosted app (no install)

**URL:** https://steadfi.vercel.app  
**Network:** Arc Mainnet (chainId 5042)

### Important: real money warning
The hosted site is connected to **Arc Mainnet**. Supply, borrow, repay, and liquidate transactions spend **real USDC** (which is also the gas token). Test carefully with small amounts, or use the testnet instructions below to avoid any risk.

### What you can do without installing anything
1. Connect your wallet (injected: MetaMask, etc.)
2. Browse markets and loan terms
3. Read your positions, health factor, borrow power, and live prices
4. Open the admin console at `/admin/*` (read-only unless your wallet holds an on-chain role)

### What requires local setup
- Supply / withdraw / borrow / repay on the hosted site send real transactions to mainnet — only do this if you intend to commit real funds.
- Running the keeper bot must be done locally (see below); there is no hosted keeper.

---

## 1. Run locally (requires your machine)

### Prerequisites
- **Bun** (the repo uses `bun.lock`; `package.json` scripts target Bun)
- An Arc-compatible wallet (MetaMask, etc.) connected to Arc Mainnet or Arc Testnet

### Install
```bash
git clone git@github.com:LandryOkoye/steadfi.git
cd steadfi
bun install
```

### Start the frontend
```bash
bun run dev          # Vite dev server, http://localhost:5173
bun run build        # production build → dist/
bun run preview      # preview the production build
```

### Network selection
The app reads `VITE_NETWORK` (default `mainnet`):

| `VITE_NETWORK` | Chain | RPC | Explorer |
|----------------|-------|-----|----------|
| `mainnet` (default) | Arc Mainnet (5042) | `https://rpc.mainnet.arc.io` | `https://explorer.arc.io` |
| `testnet` | Arc Testnet (5042002) | `https://rpc.testnet.arc.io` | `https://explorer.testnet.arc.io` |

Create a `.env` in the repo root to override:
```bash
VITE_NETWORK=testnet
```

### Contracts (Foundry)
```bash
bun run contracts:build   # forge build
bun run contracts:test    # forge test (107 tests pass)
```

### Code quality
```bash
bun run typecheck   # tsc --noEmit
bun run lint        # oxlint
```

---

## 2. Run the keeper bot (local only)

There is **no hosted keeper**. The keeper must be run locally from your machine to push oracle prices and execute liquidations.

### Setup
```bash
cd steadfi/keeper
bun install   # viem + tsx from repo node_modules
```

### Required environment variables
Create a `.env` inside `steadfi/keeper/` (never commit it):

| Variable | Required? | Description |
|----------|-----------|-------------|
| `KEEPER_PRIVATE_KEY` | Yes | Funded keeper wallet private key (dedicated wallet recommended) |
| `PYTH_API_KEY` | Yes | Pyth Pro (Lazer) API key for price updates |
| `NETWORK` | No | `mainnet` (default) or `testnet` |
| `RPC_URL` | No | Overrides default RPC for the selected network |
| `POLL_INTERVAL_MS` | No | Default `60000` (1 minute) |
| `RUN_ONCE` | No | Set `1` to push one price update and exit |

### Example usage
```bash
# Continuous price pushing + liquidations, mainnet
NETWORK=mainnet bun run src/keeper.ts

# One price update, then exit
NETWORK=mainnet RUN_ONCE=1 bun run src/keeper.ts

# Continuous on testnet
NETWORK=testnet bun run src/keeper.ts
```

### Keeper wallet funding
The keeper wallet must hold **USDC** (Arc’s gas token) to pay for price updates (~0.003 USDC per push at default 60s interval ≈ 4–5 USDC/day) and liquidations. On mainnet this is real money — fund it from your connected wallet, keep only what you need, and monitor the balance.

### Safety rules
- **One keeper at a time.** Two instances sharing the same key cause nonce clashes ("nonce too low").
- **Never reuse testnet keys on mainnet.** Generate fresh mainnet keeper and deployer keys.
- **Do not point the keeper at mainnet if a Render/hosted worker is already running** — only one keeper should be active per wallet.
- Fund/Withdraw buttons in the keeper UI are informational prompts (they tell you to send USDC manually from your connected wallet); they do not execute on-chain transfers automatically.

---

## 3. Testnet testing (risk-free)

To test supply/borrow/liquidation without real money, run the app against Arc Testnet:

1. Get testnet USDC from [Circle’s faucet](https://faucet.circle.com/) (select Arc Testnet).
2. **Note:** There is **no public cirBTC faucet** on testnet — cirBTC is Circle-whitelisted minting only. Testnet liquidations against cirBTC collateral require an allocation from Circle.
3. Set `VITE_NETWORK=testnet` and run `bun run dev`.
4. Connect your wallet, supply/borrow/repay, then run the keeper locally with `NETWORK=testnet`.

---

## 4. Repository layout

```
src/                  # React frontend (app, admin console, hooks, lib)
steadfi/contracts/    # Solidity sources, Foundry tests, deploy scripts
steadfi/keeper/       # Price-update + liquidation keeper (local only)
contracts/            # Studio-generated contract workspace (foundry.toml)
docs/                 # Security review notes
vercel.json           # Frontend hosting config (SPA fallback, RPC proxy)
```

### Key frontend files
- `src/App.tsx` — app router
- `src/components/` — UI components
- `src/config.ts` — wagmi config (chains, connectors, transports)
- `src/lib/steadfi.ts` — deployed addresses, ABIs, dual-network helpers
- `src/hooks/useSteadFi.ts` — wagmi hooks for live reads/writes

---

## Security & audit status

- **No external audit has been performed.** Use at your own risk.
- The deployer holds all roles on mainnet v1 (no Timelock).
- Oracle prices are pushed by the keeper; stale prices (>300s) block borrow/withdraw/liquidate actions involving collateral.
- See `docs/security-review.md` for the internal pre-audit review (checklist item “External audit firm engaged” is unticked).

---

## License

This project is licensed under the **GNU General Public License v3.0** — see `LICENSE.md`.

---

<!--t-->
