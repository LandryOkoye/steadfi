/**
 * SteadFi deployed contract addresses and ABIs.
 * Supports Arc Mainnet (chain 5042) and Arc Testnet (chain 5042002).
 * Active network is selected by VITE_NETWORK=mainnet|testnet (default mainnet).
 * Never hardcode addresses elsewhere — import from here.
 */

// ── Network selection ─────────────────────────────────────────────────────────

const _network = String(import.meta.env.VITE_NETWORK ?? 'mainnet').toLowerCase()
export const IS_MAINNET = _network !== 'testnet'

/**
 * Chain ID of the active network.
 * 5042    = Arc Mainnet
 * 5042002 = Arc Testnet
 *
 * Renamed from ARC_CHAIN_ID so it works for both networks.
 * @deprecated ARC_CHAIN_ID is an alias kept for any code not yet updated.
 */
export const ARC_CHAIN_ID: number = IS_MAINNET ? 5042 : 5042002

/** @deprecated Alias for backward compat — use ARC_CHAIN_ID */
export const ARC_TESTNET_CHAIN_ID: number = IS_MAINNET ? 5042 : 5042002

export const NETWORK_NAME = IS_MAINNET ? 'Arc' : 'Arc Testnet'

// ── Mainnet addresses ─────────────────────────────────────────────────────────

const MAINNET_TOKENS = {
  USDC: {
    address: '0x3600000000000000000000000000000000000000' as `0x${string}`,
    decimals: 6,
    symbol: 'USDC',
    collateralEnabled: false,
    borrowEnabled: true,
  },
  cirBTC: {
    address: '0x171A4217b86A807A64eB94757Db6849fb4bDbAA0' as `0x${string}`,
    decimals: 8,
    symbol: 'cirBTC',
    collateralEnabled: true,
    borrowEnabled: false,
  },
} as const

const MAINNET_CONTRACTS = {
  LendingPool:  '0xc85f7C6DCFC9ca544c72EBAb93881A34485B1652' as `0x${string}`,
  Timelock:     null as `0x${string}` | null,  // No Timelock on mainnet v1
  PythOracle:   '0x4B526e6f7E1d82959E0f95F14B2e7f7893C67A6B' as `0x${string}`,
  sUSDC:   '0x72540DB2aFe9f6C0b07Ae1E8358c1D22AD12fF1F' as `0x${string}`,
  sEURC:   null as `0x${string}` | null,
  sCIRBTC: '0xe3e65b944aaa9c7B6fF632DDA7a36d2cE71ac672' as `0x${string}`,
  sWETH:   null as `0x${string}` | null,
  dUSDC:   '0x4AaFD6AA21712E0231EE276C40F9981E6Bd52433' as `0x${string}`,
  dEURC:   null as `0x${string}` | null,
  dCIRBTC: '0x1f279771B5A0E38e68BC0EcaEC8C7827430Bf564' as `0x${string}`,
  dWETH:   null as `0x${string}` | null,
} as const

const MAINNET_POOL_DEPLOY_BLOCK = 28_392_864n
const MAINNET_LEGACY_POOL = null as `0x${string}` | null

// ── Testnet addresses ─────────────────────────────────────────────────────────

const TESTNET_TOKENS = {
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

const TESTNET_CONTRACTS = {
  LendingPool:  '0x57E1066DA815DD1c1DD1adA82859729ce7f82989' as `0x${string}`,
  Timelock:     '0x6C50DDcf4CAf08C8C41644b9372a1B2c1f245947' as `0x${string}`,
  PythOracle:   '0x42c69A87e59Cf8Dd845df2197d569745E7bb5730' as `0x${string}`,
  sUSDC:   '0x8e48bC49b0D356467c97c6A0C3Fb27f1d5407836' as `0x${string}`,
  sEURC:   '0x2aa7BcE6187CBCb3636b24a0a955b390a2b04E2f' as `0x${string}`,
  sCIRBTC: '0xa01abcae53928d48113487228f21943106C826cc' as `0x${string}`,
  sWETH:   '0xcd04ECa348427B272cEEead3973a7aFd7Ca270B6' as `0x${string}`,
  dUSDC:   '0x3C757dd39e31E2887791Ee247421d389cdAa197C' as `0x${string}`,
  dEURC:   '0x3173b17F76401a2a7295EEF464A12b13cC35F870' as `0x${string}`,
  dCIRBTC: '0x32332a2b83dE3a4Bd758Ea24F81d362D28918880' as `0x${string}`,
  dWETH:   '0x770ec4BDe6E655893C7bb3B8288Ec57732ed9F83' as `0x${string}`,
} as const

const TESTNET_POOL_DEPLOY_BLOCK = 69_205_409n
const TESTNET_LEGACY_POOL = '0x252E8662C945e340195B35816a3f9259CA264e8C' as `0x${string}`

// ── Active exports ─────────────────────────────────────────────────────────────

/**
 * Token definitions for the active network.
 * On mainnet: USDC + cirBTC only.
 * On testnet: USDC + EURC + cirBTC + WETH.
 */
export const TOKENS = (IS_MAINNET ? MAINNET_TOKENS : TESTNET_TOKENS) as typeof TESTNET_TOKENS

export type TokenSymbol = keyof typeof TOKENS

export const COLLATERAL_TOKENS: TokenSymbol[] = IS_MAINNET
  ? ['cirBTC']
  : ['cirBTC', 'WETH']

export const BORROW_TOKENS: TokenSymbol[] = IS_MAINNET
  ? ['USDC']
  : ['USDC', 'EURC']

/** All symbols for the active network — drives market lists, hooks, admin pages. */
export const SYMBOLS: TokenSymbol[] = IS_MAINNET
  ? ['USDC', 'cirBTC']
  : ['USDC', 'EURC', 'cirBTC', 'WETH']

export const CONTRACTS = (IS_MAINNET ? MAINNET_CONTRACTS : TESTNET_CONTRACTS)

export const POOL_DEPLOY_BLOCK = IS_MAINNET ? MAINNET_POOL_DEPLOY_BLOCK : TESTNET_POOL_DEPLOY_BLOCK

/**
 * Previous LendingPool (testnet only — superseded 2026-10-24).
 * Null on mainnet (no legacy pool).
 */
export const LEGACY_POOL = IS_MAINNET ? MAINNET_LEGACY_POOL : TESTNET_LEGACY_POOL

// Map token symbol to its sToken address (only non-null entries)
export const S_TOKEN_ADDRESS: Partial<Record<TokenSymbol, `0x${string}`>> = Object.fromEntries(
  SYMBOLS
    .map(sym => {
      const key = `s${sym === 'cirBTC' ? 'CIRBTC' : sym}` as keyof typeof CONTRACTS
      const addr = CONTRACTS[key]
      return addr ? [sym, addr] : null
    })
    .filter(Boolean) as [TokenSymbol, `0x${string}`][]
)

// Map token symbol to its debtToken address (only non-null entries)
export const D_TOKEN_ADDRESS: Partial<Record<TokenSymbol, `0x${string}`>> = Object.fromEntries(
  SYMBOLS
    .map(sym => {
      const key = `d${sym === 'cirBTC' ? 'CIRBTC' : sym}` as keyof typeof CONTRACTS
      const addr = CONTRACTS[key]
      return addr ? [sym, addr] : null
    })
    .filter(Boolean) as [TokenSymbol, `0x${string}`][]
)

// ── Explorer ───────────────────────────────────────────────────────────────────

export const EXPLORER_BASE = IS_MAINNET
  ? 'https://explorer.arc.io'
  : 'https://explorer.testnet.arc.io'

export function txUrl(hash: string): string {
  return `${EXPLORER_BASE}/tx/${hash}`
}

export function addrUrl(address: string): string {
  return `${EXPLORER_BASE}/address/${address}`
}

// ── CCTP (testnet only) ────────────────────────────────────────────────────────

/** CCTP contracts for Arc Testnet (domain 26). Not available on mainnet. */
export const CCTP = IS_MAINNET ? null : {
  TokenMessengerV2: '0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA' as `0x${string}`,
  MessageTransmitterV2: '0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275' as `0x${string}`,
  domain: 26,
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
  // Borrow with a predefined fixed term (7/14/30/60/90/180 days)
  {
    name: 'borrowWithTerm',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'asset', type: 'address' },
      { name: 'amount', type: 'uint256' },
      { name: 'durationDays', type: 'uint16' },
    ],
    outputs: [],
  },
  // getLoanTerm
  {
    name: 'getLoanTerm',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'user', type: 'address' }, { name: 'asset', type: 'address' }],
    outputs: [
      { name: 'borrowedAt', type: 'uint40' },
      { name: 'durationDays', type: 'uint16' },
      { name: 'dueTimestamp', type: 'uint40' },
    ],
  },
  // isLoanOverdue
  {
    name: 'isLoanOverdue',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'user', type: 'address' }, { name: 'asset', type: 'address' }],
    outputs: [{ name: '', type: 'bool' }],
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
  // borrowFeeBps — one-time origination fee added to debt on every borrow
  {
    name: 'borrowFeeBps',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'asset', type: 'address' }],
    outputs: [{ name: '', type: 'uint16' }],
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
  ...(['baseRatePerYear', 'slope1PerYear', 'slope2PerYear', 'kink'] as const).map(name => ({
    name,
    type: 'function' as const,
    stateMutability: 'view' as const,
    inputs: [],
    outputs: [{ name: '', type: 'uint256' as const }],
  })),
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
