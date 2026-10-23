/**
 * SteadFi deployed contract addresses and ABIs for Arc Testnet.
 * All addresses verified from deployments/testnet.json (redeployed 2026-10-23).
 * Never hardcode addresses elsewhere — import from here.
 */

export const ARC_TESTNET_CHAIN_ID = 5042002

// ── Token addresses (Arc Testnet) ─────────────────────────────────────────────
export const TOKENS = {
  USDC: {
    address: '0x3600000000000000000000000000000000000000' as `0x${string}`,
    decimals: 6,
    symbol: 'USDC',
    collateralEnabled: false,
    borrowEnabled: true,
  },
  EURC: {
    address: '0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a' as `0x${string}`,
    decimals: 6,
    symbol: 'EURC',
    collateralEnabled: false,
    borrowEnabled: true,
  },
  cirBTC: {
    address: '0xf0C4a4CE82A5746AbAAd9425360Ab04fbBA432BF' as `0x${string}`,
    decimals: 8,
    symbol: 'cirBTC',
    collateralEnabled: true,
    borrowEnabled: false,
  },
  WETH: {
    address: '0x2c4047028a72803939b6fb674D01bC059B5C4961' as `0x${string}`,
    decimals: 18,
    symbol: 'WETH',
    collateralEnabled: true,
    borrowEnabled: false,
  },
} as const

export type TokenSymbol = keyof typeof TOKENS

export const COLLATERAL_TOKENS: TokenSymbol[] = ['cirBTC', 'WETH']
export const BORROW_TOKENS: TokenSymbol[] = ['USDC', 'EURC']

// ── Protocol contract addresses ────────────────────────────────────────────────
export const CONTRACTS = {
  LendingPool:  '0x8016C259E48514ECadA4fd1082108cd55031680e' as `0x${string}`,
  Timelock:     '0xB47CFE8465d02fF38438700D64F2cAd57FED14DF' as `0x${string}`,
  PythOracle:   '0xb0e392899a9446F22Fc6bbe49c651c013fA35174' as `0x${string}`,
  // sTokens (supply receipt)
  sUSDC:   '0x32339303d275ebd5C95989661edf685ab86dc7C3' as `0x${string}`,
  sEURC:   '0x90bfae20d362782A93E268BD2c8a8b3F6b4B2494' as `0x${string}`,
  sCIRBTC: '0x5dE509d7ACA04a5FbFAc4f55C63f3CB3857247bb' as `0x${string}`,
  sWETH:   '0x308ddd3a8CDe662C12FF01CcfAEBfa3A1C96B3c7' as `0x${string}`,
  // debtTokens
  dUSDC:   '0xCA853E2CcEfbCa888a40090C6265f6135FD1e94E' as `0x${string}`,
  dEURC:   '0x63509D47238D97C19a350BEFE547d5319C2eB576' as `0x${string}`,
  dCIRBTC: '0x303C4863bd1856eD0E7398f8bc01Bc20B9F786a4' as `0x${string}`,
  dWETH:   '0x0B3a08939A5Ef898a5fD593C995061Bdc93ceFD4' as `0x${string}`,
} as const

// Map token symbol to its sToken address
export const S_TOKEN_ADDRESS: Record<TokenSymbol, `0x${string}`> = {
  USDC:   CONTRACTS.sUSDC,
  EURC:   CONTRACTS.sEURC,
  cirBTC: CONTRACTS.sCIRBTC,
  WETH:   CONTRACTS.sWETH,
}

// Map token symbol to its debtToken address
export const D_TOKEN_ADDRESS: Record<TokenSymbol, `0x${string}`> = {
  USDC:   CONTRACTS.dUSDC,
  EURC:   CONTRACTS.dEURC,
  cirBTC: CONTRACTS.dCIRBTC,
  WETH:   CONTRACTS.dWETH,
}

// ── ABIs (minimal — only functions the UI needs) ──────────────────────────────

export const LENDING_POOL_ABI = [
  // Supply
  {
    name: 'supply',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'asset', type: 'address' }, { name: 'amount', type: 'uint256' }],
    outputs: [],
  },
  // Withdraw
  {
    name: 'withdraw',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'asset', type: 'address' }, { name: 'amount', type: 'uint256' }],
    outputs: [],
  },
  // Borrow
  {
    name: 'borrow',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'asset', type: 'address' }, { name: 'amount', type: 'uint256' }],
    outputs: [],
  },
  // Repay
  {
    name: 'repay',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'asset', type: 'address' },
      { name: 'amount', type: 'uint256' },
      { name: 'memo', type: 'bytes' },
    ],
    outputs: [],
  },
  // Liquidate
  {
    name: 'liquidate',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'borrower', type: 'address' },
      { name: 'debtAsset', type: 'address' },
      { name: 'collateralAsset', type: 'address' },
      { name: 'debtAmount', type: 'uint256' },
    ],
    outputs: [],
  },
  // getHealthFactor
  {
    name: 'getHealthFactor',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'user', type: 'address' }],
    outputs: [
      { name: 'hf', type: 'uint256' },
      { name: 'isHealthy', type: 'bool' },
    ],
  },
  // getUserSupply
  {
    name: 'getUserSupply',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'user', type: 'address' }, { name: 'asset', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  // getUserDebt
  {
    name: 'getUserDebt',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'user', type: 'address' }, { name: 'asset', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  // getMarketState
  {
    name: 'getMarketState',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'asset', type: 'address' }],
    outputs: [
      {
        name: '',
        type: 'tuple',
        components: [
          { name: 'supplyIndex', type: 'uint256' },
          { name: 'borrowIndex', type: 'uint256' },
          { name: 'totalSupplyShares', type: 'uint256' },
          { name: 'totalDebtShares', type: 'uint256' },
          { name: 'lastAccrualTimestamp', type: 'uint256' },
          { name: 'reservesRay', type: 'uint256' },
        ],
      },
    ],
  },
  // getMarketConfig
  {
    name: 'getMarketConfig',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'asset', type: 'address' }],
    outputs: [
      {
        name: '',
        type: 'tuple',
        components: [
          { name: 'sToken', type: 'address' },
          { name: 'debtToken', type: 'address' },
          { name: 'interestModel', type: 'address' },
          { name: 'oracle', type: 'address' },
          { name: 'decimals', type: 'uint8' },
          { name: 'ltv', type: 'uint16' },
          { name: 'liqThreshold', type: 'uint16' },
          { name: 'liqBonus', type: 'uint16' },
          { name: 'reserveFactor', type: 'uint16' },
          { name: 'closeFactor', type: 'uint16' },
          { name: 'supplyCap', type: 'uint256' },
          { name: 'borrowCap', type: 'uint256' },
          { name: 'borrowEnabled', type: 'bool' },
          { name: 'collateralEnabled', type: 'bool' },
          { name: 'active', type: 'bool' },
          { name: 'paused', type: 'bool' },
        ],
      },
    ],
  },
  // getUtilization
  {
    name: 'getUtilization',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'asset', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  // getBorrowPower
  {
    name: 'getBorrowPower',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'user', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  // getTotalDebt
  {
    name: 'getTotalDebt',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'user', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  // getMarketTotals
  {
    name: 'getMarketTotals',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'asset', type: 'address' }],
    outputs: [
      { name: 'totalSupply', type: 'uint256' },
      { name: 'totalDebt', type: 'uint256' },
    ],
  },
  // getMarketRates
  {
    name: 'getMarketRates',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'asset', type: 'address' }],
    outputs: [
      { name: 'borrowRatePerSecond', type: 'uint256' },
      { name: 'supplyRatePerSecond', type: 'uint256' },
    ],
  },
  // accrueInterest
  {
    name: 'accrueInterest',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'asset', type: 'address' }],
    outputs: [],
  },
] as const

export const ERC20_ABI = [
  {
    name: 'balanceOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'allowance',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'owner', type: 'address' }, { name: 'spender', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'approve',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'spender', type: 'address' }, { name: 'value', type: 'uint256' }],
    outputs: [{ name: '', type: 'bool' }],
  },
] as const

// Oracle: PythOracleAdapter.getPrice(asset) returns 1e18-scaled USD.
// Reverts if the feed is stale — callers must treat a revert as "price unavailable".
export const ORACLE_ABI = [
  {
    name: 'getPrice',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'asset', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const

// Full event ABIs. These must match LendingPool exactly — omitting share fields
// changes topic0 and makes getLogs silently return nothing.
export const LENDING_POOL_EVENTS_ABI = [
  {
    name: 'Supply',
    type: 'event',
    inputs: [
      { name: 'user', type: 'address', indexed: true },
      { name: 'asset', type: 'address', indexed: true },
      { name: 'amount', type: 'uint256', indexed: false },
      { name: 'shares', type: 'uint256', indexed: false },
    ],
  },
  {
    name: 'Withdraw',
    type: 'event',
    inputs: [
      { name: 'user', type: 'address', indexed: true },
      { name: 'asset', type: 'address', indexed: true },
      { name: 'amount', type: 'uint256', indexed: false },
      { name: 'shares', type: 'uint256', indexed: false },
    ],
  },
  {
    name: 'Borrow',
    type: 'event',
    inputs: [
      { name: 'user', type: 'address', indexed: true },
      { name: 'asset', type: 'address', indexed: true },
      { name: 'amount', type: 'uint256', indexed: false },
      { name: 'debtShares', type: 'uint256', indexed: false },
    ],
  },
  {
    name: 'Repay',
    type: 'event',
    inputs: [
      { name: 'user', type: 'address', indexed: true },
      { name: 'asset', type: 'address', indexed: true },
      { name: 'amount', type: 'uint256', indexed: false },
      { name: 'debtShares', type: 'uint256', indexed: false },
      { name: 'memo', type: 'bytes', indexed: false },
    ],
  },
  {
    name: 'Liquidate',
    type: 'event',
    inputs: [
      { name: 'liquidator', type: 'address', indexed: true },
      { name: 'borrower', type: 'address', indexed: true },
      { name: 'debtAsset', type: 'address', indexed: true },
      { name: 'collateralAsset', type: 'address', indexed: false },
      { name: 'debtRepaid', type: 'uint256', indexed: false },
      { name: 'collateralSeized', type: 'uint256', indexed: false },
    ],
  },
] as const

export const IRM_ABI = [
  {
    name: 'getBorrowRatePerSecond',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'totalSupplyRay', type: 'uint256' }, { name: 'totalDebtRay', type: 'uint256' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'getSupplyRatePerSecond',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'totalSupplyRay', type: 'uint256' },
      { name: 'totalDebtRay', type: 'uint256' },
      { name: 'reserveFactor', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const

// ── Math helpers ───────────────────────────────────────────────────────────────

export const RAY = 10n ** 27n
export const PCT_PRECISION = 10_000n

/** Convert RAY (1e27) health factor to a human-readable float (e.g. 2.40) */
export function rayToHf(hfRay: bigint): number {
  return Number(hfRay * 1000n / RAY) / 1000
}

/** Format a token amount (in native decimals) to a human-readable string */
export function formatToken(amount: bigint, decimals: number, maxFrac = 6): string {
  const divisor = 10 ** decimals
  const whole = Number(amount) / divisor
  return whole.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: maxFrac,
  })
}

export const SECONDS_PER_YEAR = 31_536_000n

/** Convert a Ray per-second rate to a simple annual percentage (e.g. 8.00). */
export function rayRateToApy(ratePerSec: bigint): number {
  return Number(ratePerSec * SECONDS_PER_YEAR / 10n ** 23n) / 100
}

/** Convert a Ray fraction (1e27 = 100%) to a percentage (e.g. 9000 -> 90.00). */
export function rayToPct(ray: bigint): number {
  return Number(ray * 10_000n / RAY) / 100
}

/** Convert a native token amount to a JS number without losing small decimals. */
export function tokenAmountToNumber(amount: bigint, decimals: number): number {
  return Number(amount * 1_000_000n / (10n ** BigInt(decimals))) / 1e6
}

/** USD value of a native token amount, using an 1e18-scaled oracle price. */
export function usdFromTokenAmount(amount: bigint, decimals: number, price18: bigint): number {
  if (price18 === 0n) return 0
  return Number(amount * price18 / (10n ** BigInt(decimals))) / 1e18
}

/** uint256 max for approvals */
export const MAX_UINT256 = 2n ** 256n - 1n

// ── Arc Testnet CCTP addresses (docs.arc.io 2026-10-22) ────────────────────────
export const CCTP = {
  TokenMessengerV2: '0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA' as `0x${string}`,
  MessageTransmitterV2: '0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275' as `0x${string}`,
  domain: 26,
}

export const EXPLORER_BASE = 'https://explorer.testnet.arc.io'

export function txUrl(hash: string): string {
  return `${EXPLORER_BASE}/tx/${hash}`
}

export function addrUrl(address: string): string {
  return `${EXPLORER_BASE}/address/${address}`
}
