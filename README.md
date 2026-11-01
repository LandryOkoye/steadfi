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
| **Borrow against crypto** | Deposit cirBTC or WETH as collateral; borrow USDC or EURC. Loan terms of 7, 14, 30, 60, 90, or 180 days |
| **Flexible repayment** | Repay any time with no penalty; liquidation is purely health-factor driven |
| **Real-time interest accrual** | Per-second, utilization-based interest rate model (0% base, 8% slope to a 90% kink, 100% above it) |
| **Protocol revenue** | One-time borrow (origination) fee plus interest spread, collected into reserves |
| **Governed risk parameters** | Applied directly by RISK_ADMIN or queued through a Timelock (testnet only; mainnet v1 has no Timelock) |
| **On-chain admin console** | `/admin/*` — pause markets, tune risk, manage treasury, execute timelocked changes (requires an on-chain role) |
| **Keeper console** | `/admin/keeper` — run the price keeper and liquidator from the browser; open to any wallet |
| **Automated keeper** | `steadfi/keeper` (Node) or the browser keeper console — refreshes oracle prices and liquidates undercollateralized positions |

---

## Architecture

| Layer | Tech |
|-------|------|
| Contracts | Solidity 0.8.28, Foundry, OpenZeppelin v5 |
| Frontend | React 18, TypeScript, Vite, Tailwind CSS, wagmi v2, viem, ConnectKit |
| Charts | Recharts |
| Wallets / bridge | ConnectKit, Circle App Kit (CCTP bridge) |
| Oracles | Pyth Pro (Lazer) price feeds via an on-chain adapter |
| Automation | Browser keeper console (`src/admin/keeper`) and Node keeper (`steadfi/keeper`) |
| Hosting | Vercel: static frontend plus one serverless function (`api/pyth-latest.ts`) that proxies Pyth prices. The keeper runs in a browser tab or on your machine; there is no always-on server keeper |

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

### Transaction hashes (Arc Mainnet, chainId 5042)

View any of these at `https://explorer.arc.io/tx/<hash>`.

| Action | Tx hash |
|--------|---------|
| LendingPool deployment | `0x73bada35d44104f5af7f5675147336669e87148c5ff812317bf53878a901ea55` |
| InterestRateModel deployment | `0xb088c485f8dd3038bfe91f3192b8b62905c4edfbda5e8ebb21438009a13f6bb7` |
| PythOracleAdapter deployment | `0xd5ddc8c7e473793b8badc6b36df9f0528fab6c26916a6b84a6490635976cd51e` |
| USDC market added | `0xfdf20c3fd26efe481b8d10df8c969ba58610e056d5a9782513862558e1b61af1` |
| cirBTC market added | `0x01fb1f8f39b98ffcbbdd4f4ec72be0e2efad03c155ed2fa26de5672e72d6d909` |
| First supply (0.02 USDC) | `0x159a2a2561a77819dd5354fd6165f749c25b3f95e1f3a9f28977d124193d07e1` |
| First withdraw (0.019 USDC) | `0x1bba472b99f4bb1d6f79502a44ccf17ef9c7a8e59670e9b8cc83561d317f6b73` |


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
- **Caps (launch-size):** USDC supply 10,000 / borrow 8,000; EURC supply 10,000 / borrow 8,000; cirBTC supply 0.25 (borrowing disabled); WETH supply 5 (borrowing disabled).
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
4. Run the keeper from `/admin/keeper` with any wallet (see section 2). It spends real USDC gas; a price push costs about 0.003 USDC
5. The rest of the admin console (`/admin/overview`, markets, treasury, access) only opens for wallets holding an on-chain role

### What requires local setup
- Supply / withdraw / borrow / repay on the hosted site send real transactions to mainnet — only do this if you intend to commit real funds.
- The keeper runs either in your browser tab (`/admin/keeper`) or as the Node keeper on your machine; nothing runs it for you in the background.

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
bun run contracts:test    # forge test
```

### Code quality
```bash
bun run typecheck   # tsc --noEmit
bun run lint        # oxlint
```

---

## 2. Run the keeper

Price pushes and liquidations are permissionless on-chain, so anyone can run a keeper. Two options:

### Option A: browser keeper console (no install)

Open `/admin/keeper` on the hosted app (or locally). No admin role is needed.

1. Connect any wallet on Arc (top right).
2. Create a **browser keeper wallet** with a passphrase (or import a key). The key is encrypted with your passphrase and stored only in this browser, separately for mainnet and testnet.
3. **Fund** it from your connected wallet (about 0.05 USDC is plenty).
4. Press **Run once** to fetch signed Pyth prices and push them if they are due, then follow the tx link in the Activity log.
5. Press **Start** to run every 60 seconds, and **Stop** when done. **Withdraw all** sends the remaining USDC back to your connected wallet.

What it does each cycle:
- Reads every borrower's health factor.
- Pushes prices only when Pyth has a newer, still-fresh price for a feed that is stale or about to be (or a loan is near liquidation). A feed that Pyth itself isn't updating, like EUR/USD over the weekend, never triggers a push.
- Liquidates loans with a health factor below 1 if the keeper holds enough of the debt token.

Built-in safety: every transaction is simulated before sending, a **session gas budget** and a **minimum balance** stop the keeper automatically, there is a **dry-run** mode, and only one tab can run the same keeper wallet. The keeper runs while the tab is open; switching admin tabs is fine, closing the tab stops it.

In connected-wallet mode the keeper uses your own wallet, so every transaction asks for confirmation and only **Run once** is available.

### Option B: Node keeper (your machine)

```bash
cd steadfi/keeper
bun install
```

Create a `.env` inside `steadfi/keeper/` (never commit it; Bun loads it automatically):

| Variable | Required? | Description |
|----------|-----------|-------------|
| `KEEPER_PRIVATE_KEY` | Yes | Funded keeper wallet private key (dedicated wallet recommended) |
| `PYTH_API_KEY` | Yes | Pyth Pro (Lazer) API key for price updates |
| `NETWORK` | No | `mainnet` (default) or `testnet` |
| `RPC_URL` | No | Overrides default RPC for the selected network |
| `POLL_INTERVAL_MS` | No | Default `60000` (1 minute) |
| `RUN_ONCE` | No | Set `1` to push one price update and exit |

```bash
# Continuous price pushing + liquidations, mainnet
NETWORK=mainnet bun run src/keeper.ts

# One price update, then exit
NETWORK=mainnet RUN_ONCE=1 bun run src/keeper.ts

# Continuous on testnet
NETWORK=testnet bun run src/keeper.ts
```

The Node keeper pushes prices every cycle (~0.003 USDC per push, about 4–5 USDC/day at 60s). The browser keeper's gas saver pushes far less often.

### Safety rules
- **One keeper per wallet.** Two keepers sharing the same key cause nonce clashes ("nonce too low"). Don't run the Node keeper and the browser keeper on the same wallet at the same time.
- **Never reuse testnet keys on mainnet.** Generate fresh mainnet keeper and deployer keys.
- **Keep keeper wallets small.** They are hot wallets; on mainnet the gas is real USDC.

---

## 3. Testnet testing (risk-free)

To test supply/borrow/liquidation without real money, run the app against Arc Testnet:

1. Get testnet USDC from [Circle’s faucet](https://faucet.circle.com/) (select Arc Testnet).
2. **Note:** There is **no public cirBTC faucet** on testnet — cirBTC is Circle-whitelisted minting only. Testnet liquidations against cirBTC collateral require an allocation from Circle.
3. Set `VITE_NETWORK=testnet` and run `bun run dev`.
4. Connect your wallet, supply/borrow/repay, then run the keeper from `/admin/keeper` or locally with `NETWORK=testnet`.

---

## 4. Repository layout

```
src/                  # React frontend (app, admin console, hooks, lib)
steadfi/contracts/    # Solidity sources, Foundry tests, deploy scripts
steadfi/keeper/       # Node price-update + liquidation keeper
api/                  # Vercel serverless function: Pyth price proxy for the browser keeper
contracts/            # Studio-generated contract workspace (foundry.toml)
docs/                 # Security review notes
vercel.json           # Hosting config (SPA fallback, RPC proxy, api/ routes)
```

### Key frontend files
- `src/App.tsx` — app router
- `src/components/` — UI components
- `src/config.ts` — wagmi config (chains, connectors, transports)
- `src/lib/steadfi.ts` — deployed addresses, ABIs, dual-network helpers
- `src/hooks/useSteadFi.ts` — wagmi hooks for live reads/writes
- `src/admin/keeper/` — browser keeper engine, encrypted wallet, provider
- `src/admin/pages/Keeper.tsx` — keeper console page

### Deploying the frontend (Vercel)
The repo deploys as-is (`vercel.json`). Set these in Vercel → Project → Settings → Environment Variables:

| Variable | Where it's used | Note |
|----------|-----------------|------|
| `VITE_NETWORK` | Frontend build | `mainnet` (default) or `testnet` |
| `PYTH_API_KEY` | `api/pyth-latest.ts` (server only) | Needed by the browser keeper. **Never** prefix it with `VITE_`; `VITE_*` values are bundled into public JS |
| `VITE_ARC_RPC_URL` | Frontend build | Optional dedicated RPC endpoint |

---

## Security & audit status

- **No external audit has been performed.** Use at your own risk.
- The deployer holds all roles on mainnet v1 (no Timelock).
- Oracle prices are pushed by a keeper; stale prices (>300s) block borrow/withdraw/liquidate actions involving collateral.
- The browser keeper wallet is a hot wallet encrypted in browser storage; keep its balance small.
- See `docs/security-review.md` for the internal pre-audit review (checklist item “External audit firm engaged” is unticked).

---

## License

This project is licensed under the **GNU General Public License v3.0** — see `LICENSE.md`.

---

<!--t-->
