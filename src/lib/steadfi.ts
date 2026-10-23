/**
 * SteadFi deployed contract addresses and ABIs for Arc Testnet.
 * All addresses verified from deployments/testnet.json (deployed 2026-10-22).
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
  LendingPool:  '0x4B526e6f7E1d82959E0f95F14B2e7f7893C67A6B' as `0x${string}`,
  Timelock:     '0x84393560Bc91a1C2eDea435dfdb704Ad17df0886' as `0x${string}`,
  PythOracle:   '0x4AaFD6AA21712E0231EE276C40F9981E6Bd52433' as `0x${string}`,
  // sTokens (supply receipt)
  sUSDC:   '0x2BCF675A744d568107b1F67AC63f1640770E72AE' as `0x${string}`,
  sEURC:   '0x3AF561fF92Ee6dD333484ED283dB0645c69Cf9d4' as `0x${string}`,
  sCIRBTC: '0xfE1bb221078673c3CB6243868FB88E1E6eaCD31C' as `0x${string}`,
  sWETH:   '0x8b16a82f9F2E991856A8Ec133e791BDDB7e6ED3e' as `0x${string}`,
  // debtTokens
  dUSDC:   '0x31D611C9A8369bB05E25a4ADcFc3D393BeD77884' as `0x${string}`,
  dEURC:   '0x879C8451591688b0a43052aC71A3BA7524967e92' as `0x${string}`,
  dCIRBTC: '0x06ddD42c7b9CAADa0783C7966B86b9C04D7c3364' as `0x${string}`,
  dWETH:   '0xAD7a658FeB5dbaDe32a2347ec7997D334Fc76D56' as `0x${string}`,
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

/** Convert RAY rate-per-second to APY % (annualised, continuous) */
export function rayRateToApy(ratePerSec: bigint): number {
  // APY = (1 + rate)^31536000 - 1, approximated as rate * seconds-per-year
  const SECONDS_PER_YEAR = 31_536_000n
  return Number(ratePerSec * SECONDS_PER_YEAR * 10000n / RAY) / 100
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
