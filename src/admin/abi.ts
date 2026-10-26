/**
 * Admin-only ABIs and constants. Lives in the lazily loaded admin bundle so
 * none of it is downloaded by ordinary users of the app.
 */
import { keccak256, toBytes } from 'viem'

// ── Roles (SteadFiAccessControl) ─────────────────────────────────────────────
export const ROLES = {
  OWNER:          keccak256(toBytes('OWNER')),
  RISK_ADMIN:     keccak256(toBytes('RISK_ADMIN')),
  PAUSE_GUARDIAN: keccak256(toBytes('PAUSE_GUARDIAN')),
  LIQ_EXECUTOR:   keccak256(toBytes('LIQUIDATION_EXECUTOR')),
} as const
export type RoleName = keyof typeof ROLES

export const ROLE_LABELS: Record<RoleName, string> = {
  OWNER:          'Owner',
  RISK_ADMIN:     'Risk admin',
  PAUSE_GUARDIAN: 'Pause guardian',
  LIQ_EXECUTOR:   'Liquidation executor',
}

export const ROLE_DESCRIPTIONS: Record<RoleName, string> = {
  OWNER:          'Withdraws protocol revenue, grants and revokes roles, adds markets.',
  RISK_ADMIN:     'Changes risk parameters, borrow fees and oracles. Should be the Timelock only in production.',
  PAUSE_GUARDIAN: 'Pauses and unpauses markets instantly in an emergency.',
  LIQ_EXECUTOR:   'Protocol fallback liquidator.',
}

/** Contract bounds, mirrored for client-side validation (LendingPool.sol). */
export const MAX_BORROW_FEE_BPS = 200
export const MAX_LIQ_BONUS_BPS = 2_000

/** Dedicated keeper wallet that pays gas for Pyth price updates. Public address only. */
export const KEEPER_ADDRESS = '0x5dD3A19CB8C5979C745c12072E6be757F6CE7e7a' as `0x${string}`

/** Keeper gas runway warning threshold, in USDC (Arc gas token). */
export const KEEPER_LOW_BALANCE_USDC = 2

// ── LendingPool admin functions ──────────────────────────────────────────────
export const POOL_ADMIN_ABI = [
  {
    name: 'hasRole', type: 'function', stateMutability: 'view',
    inputs: [{ name: 'role', type: 'bytes32' }, { name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    name: 'grantRole', type: 'function', stateMutability: 'nonpayable',
    inputs: [{ name: 'role', type: 'bytes32' }, { name: 'account', type: 'address' }],
    outputs: [],
  },
  {
    name: 'revokeRole', type: 'function', stateMutability: 'nonpayable',
    inputs: [{ name: 'role', type: 'bytes32' }, { name: 'account', type: 'address' }],
    outputs: [],
  },
  {
    name: 'setMarketPaused', type: 'function', stateMutability: 'nonpayable',
    inputs: [{ name: 'asset', type: 'address' }, { name: 'paused', type: 'bool' }],
    outputs: [],
  },
  {
    name: 'setBorrowFee', type: 'function', stateMutability: 'nonpayable',
    inputs: [{ name: 'asset', type: 'address' }, { name: 'feeBps', type: 'uint16' }],
    outputs: [],
  },
  {
    name: 'setRiskParams', type: 'function', stateMutability: 'nonpayable',
    inputs: [
      { name: 'asset', type: 'address' },
      { name: 'ltv', type: 'uint16' },
      { name: 'liqThreshold', type: 'uint16' },
      { name: 'liqBonus', type: 'uint16' },
      { name: 'reserveFactor', type: 'uint16' },
      { name: 'closeFactor', type: 'uint16' },
      { name: 'supplyCap', type: 'uint256' },
      { name: 'borrowCap', type: 'uint256' },
    ],
    outputs: [],
  },
  {
    name: 'withdrawReserves', type: 'function', stateMutability: 'nonpayable',
    inputs: [
      { name: 'asset', type: 'address' },
      { name: 'to', type: 'address' },
      { name: 'amountRay', type: 'uint256' },
    ],
    outputs: [],
  },
  {
    name: 'RoleGranted', type: 'event',
    inputs: [
      { name: 'role', type: 'bytes32', indexed: true },
      { name: 'account', type: 'address', indexed: true },
      { name: 'by', type: 'address', indexed: true },
    ],
  },
  {
    name: 'RoleRevoked', type: 'event',
    inputs: [
      { name: 'role', type: 'bytes32', indexed: true },
      { name: 'account', type: 'address', indexed: true },
      { name: 'by', type: 'address', indexed: true },
    ],
  },
] as const

// ── Timelock ─────────────────────────────────────────────────────────────────
const TIMELOCK_TX_INPUTS = [
  { name: 'target', type: 'address' },
  { name: 'value', type: 'uint256' },
  { name: 'signature', type: 'string' },
  { name: 'data', type: 'bytes' },
  { name: 'eta', type: 'uint256' },
] as const

const TIMELOCK_EVENT_INPUTS = [
  { name: 'txHash', type: 'bytes32', indexed: true },
  { name: 'target', type: 'address', indexed: true },
  { name: 'value', type: 'uint256', indexed: false },
  { name: 'signature', type: 'string', indexed: false },
  { name: 'data', type: 'bytes', indexed: false },
  { name: 'eta', type: 'uint256', indexed: false },
] as const

export const TIMELOCK_ABI = [
  { name: 'admin', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'address' }] },
  { name: 'delay', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'uint256' }] },
  {
    name: 'queuedTransactions', type: 'function', stateMutability: 'view',
    inputs: [{ name: '', type: 'bytes32' }], outputs: [{ name: '', type: 'bool' }],
  },
  { name: 'queueTransaction', type: 'function', stateMutability: 'nonpayable', inputs: TIMELOCK_TX_INPUTS, outputs: [{ name: '', type: 'bytes32' }] },
  { name: 'cancelTransaction', type: 'function', stateMutability: 'nonpayable', inputs: TIMELOCK_TX_INPUTS, outputs: [] },
  { name: 'executeTransaction', type: 'function', stateMutability: 'payable', inputs: TIMELOCK_TX_INPUTS, outputs: [{ name: '', type: 'bytes' }] },
  { name: 'QueueTransaction', type: 'event', inputs: TIMELOCK_EVENT_INPUTS },
  { name: 'CancelTransaction', type: 'event', inputs: TIMELOCK_EVENT_INPUTS },
  { name: 'ExecuteTransaction', type: 'event', inputs: TIMELOCK_EVENT_INPUTS },
] as const

/** Timelock.GRACE_PERIOD — a queued change expires this long after its eta. */
export const TIMELOCK_GRACE_PERIOD_S = 14n * 86_400n

// ── Pyth adapter storage (price freshness) ───────────────────────────────────
export const ORACLE_ADMIN_ABI = [
  {
    name: 'storedPrices', type: 'function', stateMutability: 'view',
    inputs: [{ name: '', type: 'address' }],
    outputs: [
      { name: 'price', type: 'uint256' },
      { name: 'publishTime', type: 'uint64' },
      { name: 'set', type: 'bool' },
    ],
  },
  {
    name: 'assetConfigs', type: 'function', stateMutability: 'view',
    inputs: [{ name: '', type: 'address' }],
    outputs: [
      { name: 'feedId', type: 'uint32' },
      { name: 'maxAge', type: 'uint256' },
    ],
  },
] as const
