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

### All Arc Testnet Deployments (Phase 1)
| Contract | Address | Explorer |
|---|---|---|
| Timelock | `0x84393560Bc91a1C2eDea435dfdb704Ad17df0886` | https://explorer.testnet.arc.io/address/0x84393560Bc91a1C2eDea435dfdb704Ad17df0886 |
| LendingPool | `0x4B526e6f7E1d82959E0f95F14B2e7f7893C67A6B` | https://explorer.testnet.arc.io/address/0x4B526e6f7E1d82959E0f95F14B2e7f7893C67A6B |
| IRM_Stable | `0x041A09a5e8aCF1c618b2C7b76F560bE9D5c179A9` | https://explorer.testnet.arc.io/address/0x041A09a5e8aCF1c618b2C7b76F560bE9D5c179A9 |
| IRM_Collateral | `0x72540DB2aFe9f6C0b07Ae1E8358c1D22AD12fF1F` | https://explorer.testnet.arc.io/address/0x72540DB2aFe9f6C0b07Ae1E8358c1D22AD12fF1F |
| PythOracleAdapter | `0x4AaFD6AA21712E0231EE276C40F9981E6Bd52433` | https://explorer.testnet.arc.io/address/0x4AaFD6AA21712E0231EE276C40F9981E6Bd52433 |
| sUSDC | `0x2BCF675A744d568107b1F67AC63f1640770E72AE` | https://explorer.testnet.arc.io/address/0x2BCF675A744d568107b1F67AC63f1640770E72AE |
| dUSDC | `0x31D611C9A8369bB05E25a4ADcFc3D393BeD77884` | https://explorer.testnet.arc.io/address/0x31D611C9A8369bB05E25a4ADcFc3D393BeD77884 |
| sEURC | `0x3AF561fF92Ee6dD333484ED283dB0645c69Cf9d4` | https://explorer.testnet.arc.io/address/0x3AF561fF92Ee6dD333484ED283dB0645c69Cf9d4 |
| dEURC | `0x879C8451591688b0a43052aC71A3BA7524967e92` | https://explorer.testnet.arc.io/address/0x879C8451591688b0a43052aC71A3BA7524967e92 |
| sCIRBTC | `0xfE1bb221078673c3CB6243868FB88E1E6eaCD31C` | https://explorer.testnet.arc.io/address/0xfE1bb221078673c3CB6243868FB88E1E6eaCD31C |
| dCIRBTC | `0x06ddD42c7b9CAADa0783C7966B86b9C04D7c3364` | https://explorer.testnet.arc.io/address/0x06ddD42c7b9CAADa0783C7966B86b9C04D7c3364 |
| sWETH | `0x8b16a82f9F2E991856A8Ec133e791BDDB7e6ED3e` | https://explorer.testnet.arc.io/address/0x8b16a82f9F2E991856A8Ec133e791BDDB7e6ED3e |
| dWETH | `0xAD7a658FeB5dbaDe32a2347ec7997D334Fc76D56` | https://explorer.testnet.arc.io/address/0xAD7a658FeB5dbaDe32a2347ec7997D334Fc76D56 |

### Collateral model
- **cirBTC** and **WETH** only: `collateralEnabled=true`, non-zero LTV/liqThreshold
- **USDC** and **EURC**: lend-and-borrow only, `collateralEnabled=false`, `ltv=0`, `liqThreshold=0`

### Oracle
- Pyth Network on Arc Testnet: `0x2880aB155794e7179c9eE2e38200202908C17B43`
- BTC/USD: `0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43`
- ETH/USD: `0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace`
- EUR/USD: `0xa995d00bb36a63cef7fd2c287dc105fc8f3d93779f062f09551b0af3e81ec30b`

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
