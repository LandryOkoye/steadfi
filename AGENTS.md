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

### Phase 1 starts next (pending approval)
Design doc: `steadfi/docs/technical-design.md`

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
