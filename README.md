# SteadFi

**Overcollateralized USDC/EURC lending and borrowing on Arc.**

SteadFi is a DeFi lending protocol where lenders supply USDC or EURC to earn interest, and borrowers post cirBTC or WETH as collateral to take out fixed-term loans. Interest accrues in real time via Ray-based math, prices are streamed from Pyth (Lazer), and a keepernet monitors health factors and executes liquidations when positions fall below their liquidation threshold.

SteadFi was designed and built end-to-end with [Arc Studio](https://studio.arc.io/) — the protocol contracts, the React frontend, the keeper bot, and the deployment to Arc.

---

## What it does

- **Supply / lend** USDC and EURC — anyone can supply; lenders fund all borrows and earn the supply-side spread.
- **Borrow against crypto** — deposit cirBTC or WETH as collateral, borrow USDC or EURC. Loan terms of 7, 14, 30, 60, 90, or 180 days.
- **Fixed-term loans with flexible repayment** — repay any time with no penalty; liquidation is purely health-factor driven.
- **Real-time interest accrual** — per-block interest rate models with a stable market IRM and a separate, steeper IRM for collateral markets.
- **Protocol revenue** — a one-time borrow (origination) fee plus an interest spread, collected into reserves and withdrawable by governance.
- **Governed risk parameters** — risk changes are applied directly by a RISK_ADMIN or queued through a Timelock for delayed execution.
- **On-chain admin console** — a gated operator UI for pausing markets, tuning risk parameters, managing treasury, and executing timelocked changes.
- **Automated keeper** — refreshes oracle prices and liquidates undercollateralized positions.

## Architecture

| Layer | Tech |
|---|---|
| Contracts | Solidity 0.8.28, Foundry, OpenZeppelin v5 |
| Frontend | React 18, TypeScript, Vite, Tailwind CSS, wagmi v2, viem, ConnectKit |
| Charts | Recharts |
| Wallets / bridge | ConnectKit, Circle App Kit (CCTP bridge) |
| Oracles | Pyth Pro (Lazer) price feeds via an on-chain adapter |
| Automation | TypeScript keeper (`steadfi/keeper`) |
| Hosting | Frontend on Vercel, keeper on Render |

### Core contracts

| Contract | Purpose |
|---|---|
| `LendingPool` | The pool: supply, withdraw, borrow, repay, liquidate, risk params, reserves |
| `sToken` / `DebtToken` | Lender receipt and borrower debt tokens per market (sUSDC, dUSDC, …) |
| `InterestRateModel` | Per-block interest accrual (stable + collateral market IRMs) |
| `PythOracleAdapter` | Verifies and stores Pyth Pro (Lazer) prices on-chain |
| `Timelock` | Delayed execution of governance/risk changes |
| `SteadFiAccessControl` | OWNER / RISK_ADMIN / PAUSE_GUARDIAN roles |

### Collateral model

- **cirBTC** and **WETH** — collateral-enabled with configurable LTV and liquidation thresholds.
- **USDC** and **EURC** — lend-and-borrow only, never used as collateral.

## Building with Arc Studio

This project was built from start to finish in [Arc Studio](https://studio.arc.io/):

- **Scaffolding** — the React + wagmi + Vite app was generated and configured from the studio, wired to the Arc chain and USDC token from day one.
- **Contract development** — all Solidity sources, Foundry tests, and deployment scripts were written and iterated on inside the studio workspace (`steadfi/contracts`).
- **Integration** — deployed addresses and ABIs flow from the studio-generated project setup (`src/lib/steadfi.ts`, `src/hooks/useSteadFi.ts`) into the wagmi-powered frontend.
- **Deployment** — contracts were compiled and deployed to Arc, and the frontend was built and shipped, directly from the studio-built codebase.

## Mainnet deployment (Arc)

### Contract addresses

| Contract | Address |
|---|---|
| LendingPool | `0xc85f7C6DCFC9ca544c72EBAb93881A34485B1652` |
| Timelock | `0x__MAINNET_TIMELOCK__` |
| IRM | `0x84393560Bc91a1C2eDea435dfdb704Ad17df0886` |
| PythOracleAdapter | `0x4B526e6f7E1d82959E0f95F14B2e7f7893C67A6B` |
| sUSDC | `0x72540DB2aFe9f6C0b07Ae1E8358c1D22AD12fF1F` |
| dUSDC | `0x4AaFD6AA21712E0231EE276C40F9981E6Bd52433` |
| sEURC | `0x0cC0032b8299b517A1111E59E11a476F71b9A9Ab` |
| dEURC | `0xa5dc8CDb0D575D894DDc40f7eF914B852a091E08` |
| sCIRBTC | `0xe3e65b944aaa9c7B6fF632DDA7a36d2cE71ac672` |
| dCIRBTC | `0x1f279771B5A0E38e68BC0EcaEC8C7827430Bf564` |
| sWETH | `0xC0d1B3E34939c5942745CfF3d9D51850aC4c5D5c` |
| dWETH | `0x4264570Af421bbD69BAD69594E11E07A378fa105` |
| WETH | `0x128cC466B61f542da60c70e3aA11c10e19B84EDB` |

### Transaction hashes

| Action | Tx hash |
|---|---|
| LendingPool deployment | `0x__TX_DEPLOY_LENDINGPOOL__` |
| Oracle adapter deployment | `0x__TX_DEPLOY_ORACLE__` |
| Market initialization | `0x__TX_INIT_MARKETS__` |
| First supply | `0x__TX_FIRST_SUPPLY__` |
| First borrow | `0x__TX_FIRST_BORROW__` |
| First repay | `0x__TX_FIRST_REPAY__` |
| First liquidation | `0x__TX_FIRST_LIQUIDATION__` |

## Development

```bash
bun install          # install dependencies
bun run dev         # start the frontend dev server
bun run build       # production build (dist/)

bun run contracts:build   # forge build
bun run contracts:test    # forge test

bun run lint         # oxlint
bun run typecheck    # tsc --noEmit
```

### Environment

Frontend variables (never put secrets in `VITE_*` — they are bundled into the public JS):

```bash
VITE_ARC_RPC_URL=   # dedicated RPC provider (optional; a same-origin proxy is used otherwise)
```

Keeper variables (set in the hosting dashboard, never committed):

```bash
KEEPER_PRIVATE_KEY=
PYTH_API_KEY=
```

## Repository layout

```
src/                  # React frontend (app, admin console, hooks, lib)
steadfi/contracts/    # Solidity sources, Foundry tests, deploy scripts
steadfi/keeper/       # Price-update + liquidation keeper
contracts/           # Studio-generated contract workspace (foundry.toml)
docs/                # Security review notes
vercel.json           # Frontend hosting config (SPA fallback, RPC proxy)
render.yaml           # Keeper hosting config
```

## License

MIT
