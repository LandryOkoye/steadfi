# SteadFi

> Overcollateralized USDC/EURC lending and borrowing on Arc — the simplest stablecoin borrowing UX, powered by Circle.

**Status:** Phase 0 — design doc pending approval. No protocol contracts deployed yet.

## Architecture

| Component | Stack | Path |
|---|---|---|
| Smart Contracts | Solidity 0.8.28 + Arc Foundry | `contracts/` |
| Liquidation Keeper | TypeScript + Bun | `keeper/` |
| Indexer + API | TypeScript + Bun | `indexer/` |
| Web App | React 18 + Vite + wagmi v2 | `web/` |
| Design Docs | Markdown | `docs/` |

## Quickstart

### Prerequisites
- [Arc Foundry](https://docs.arc.io/arc/tutorials/install-arc-foundry.md) (arc-forge, arc-cast, arc-anvil)
- [Bun](https://bun.sh) >= 1.0
- A funded Arc Testnet wallet (get USDC from https://faucet.circle.com)

### Contracts
```bash
cd contracts
arc-forge install
arc-forge build
arc-forge test
```

### Keeper
```bash
cd keeper
bun install
cp .env.example .env  # fill in RPC_URL and KEEPER_PRIVATE_KEY
bun run dev
```

### Indexer
```bash
cd indexer
bun install
cp .env.example .env
bun run dev
```

### Web
```bash
cd web
bun install
bun run dev
```

## Deployment addresses

- Testnet: `contracts/deployments/testnet.json`
- Mainnet: `contracts/deployments/mainnet.json` (empty until Phase 5 approval)

## Key Arc facts

| Fact | Value |
|---|---|
| Testnet chain ID | 5042002 |
| Mainnet chain ID | 5042 |
| USDC (ERC-20, both networks) | `0x3600000000000000000000000000000000000000` |
| EURC testnet | `0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a` |
| EURC mainnet | `0xbEf5f6d51CB62b58e6A8f77868681825C6fe21c1` |
| cirBTC testnet | `0xf0C4a4CE82A5746AbAAd9425360Ab04fbBA432BF` |
| WETH testnet | `0x2c4047028a72803939b6fb674D01bC059B5C4961` |
| Multicall3From (both) | `0x522fAf9A91c41c443c66765030741e4AaCe147D0` |
| Memo (both) | `0x5294E9927c3306DcBaDb03fe70b92e01cCede505` |

USDC is the native gas token on Arc. All fees are in USDC. Never mix the 6-decimal ERC-20 view with the 18-decimal native view.

## Phase roadmap

| Phase | Goal | Status |
|---|---|---|
| 0 | Setup, research, design doc | In progress |
| 1 | Core lending contracts | Pending approval |
| 2 | Arc-native features | Pending |
| 3 | Frontend, keeper, indexer | Pending |
| 4 | Testing, audit, security gate | Pending |
| 5 | Mainnet launch (requires written approval) | Pending |
| 6 | Post-launch, roadmap features | Pending |

## Rules

- Never deploy to mainnet without explicit written approval.
- Never hardcode secrets or private keys.
- Verify Arc facts in docs.arc.io before using any address or parameter.
- Security over speed: stop and ask when in doubt.
