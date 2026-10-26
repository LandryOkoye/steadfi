/**
 * useAdmin — reads and writes for the admin console. Every value is an
 * on-chain read; every action is a transaction the contracts authorise by
 * role, so the UI gate is a convenience, never the security boundary.
 */
import { useEffect, useState } from 'react'
import {
  useAccount, useBalance, usePublicClient, useReadContract, useReadContracts, useWriteContract,
} from 'wagmi'
import { decodeFunctionData, encodeFunctionData, type AbiEvent } from 'viem'
import {
  ARC_TESTNET_CHAIN_ID, CONTRACTS, ERC20_ABI, LENDING_POOL_ABI, POOL_DEPLOY_BLOCK, TOKENS, TokenSymbol,
} from '../lib/steadfi'
import { SYMBOLS, useConfirmTx, useOraclePrices } from '../hooks/useSteadFi'
import { getLogsChunked } from '../lib/logs'
import {
  KEEPER_ADDRESS, ORACLE_ADMIN_ABI, POOL_ADMIN_ABI, ROLES, RoleName, TIMELOCK_ABI,
} from './abi'

const RAY_DIGITS = 27

/** Native token units → Ray (27 decimals), as LendingPool stores reserves. */
export function toRay(amount: bigint, decimals: number): bigint {
  return amount * 10n ** BigInt(RAY_DIGITS - decimals)
}
/** Ray → native token units, rounded down. */
export function fromRay(amountRay: bigint, decimals: number): bigint {
  return amountRay / 10n ** BigInt(RAY_DIGITS - decimals)
}

// ── Roles of the connected wallet ────────────────────────────────────────────

export interface AdminRoles {
  isOwner: boolean
  isRiskAdmin: boolean
  isPauseGuardian: boolean
  /** Can queue/execute Timelock transactions (the production path for risk changes). */
  isTimelockAdmin: boolean
  isAnyAdmin: boolean
  loading: boolean
  /** The role reads failed (RPC), so "no role" can't be concluded. */
  error: boolean
  refetch: () => void
}

export function useAdminRoles(account?: `0x${string}`): AdminRoles {
  const { address } = useAccount()
  const who = account ?? address
  const roleNames: RoleName[] = ['OWNER', 'RISK_ADMIN', 'PAUSE_GUARDIAN']
  const res = useReadContracts({
    contracts: [
      ...roleNames.map(r => ({
        address: CONTRACTS.LendingPool,
        abi: POOL_ADMIN_ABI,
        functionName: 'hasRole' as const,
        args: [ROLES[r], who!] as const,
        chainId: ARC_TESTNET_CHAIN_ID,
      })),
      {
        address: CONTRACTS.Timelock,
        abi: TIMELOCK_ABI,
        functionName: 'admin' as const,
        chainId: ARC_TESTNET_CHAIN_ID,
      },
    ],
    // allowFailure: false makes any failed read fail the whole query, and
    // react-query keeps the last good data when a background refetch fails,
    // so a flaky RPC never flips a loaded admin session to "denied".
    allowFailure: false,
    query: { enabled: !!who, refetchInterval: 60_000 },
  })
  const data = res.data as readonly [boolean, boolean, boolean, `0x${string}`] | undefined
  const isOwner = data?.[0] === true
  const isRiskAdmin = data?.[1] === true
  const isPauseGuardian = data?.[2] === true
  const timelockAdmin = data?.[3] ?? null
  const isTimelockAdmin = !!who && !!timelockAdmin && timelockAdmin.toLowerCase() === who.toLowerCase()
  return {
    isOwner, isRiskAdmin, isPauseGuardian, isTimelockAdmin,
    isAnyAdmin: isOwner || isRiskAdmin || isPauseGuardian || isTimelockAdmin,
    loading: !!who && res.isLoading,
    error: res.isError && !data,
    refetch: () => { void res.refetch() },
  }
}

// ── Protocol-wide market metrics ─────────────────────────────────────────────

export interface MarketConfigView {
  oracle: `0x${string}`
  interestModel: `0x${string}`
  ltv: number
  liqThreshold: number
  liqBonus: number
  reserveFactor: number
  closeFactor: number
  supplyCap: bigint
  borrowCap: bigint
  borrowEnabled: boolean
  collateralEnabled: boolean
  active: boolean
  paused: boolean
}

export interface AdminMarket {
  symbol: TokenSymbol
  decimals: number
  config: MarketConfigView | null
  totalSupply: bigint
  totalDebt: bigint
  /** Pool's actual token balance — what can leave the pool right now. */
  cash: bigint
  /** Protocol revenue accrued (interest spread + borrow fees), native units. */
  reserves: bigint
  reservesRay: bigint
  utilizationPct: number
  borrowAprPct: number
  supplyApyPct: number
  /** null when the deployed pool predates the fee. */
  borrowFeeBps: number | null
  price18: bigint | null
  /** Seconds since the last stored Pyth price, null for USDC (fixed $1) or unset. */
  priceAgeS: number | null
  maxPriceAgeS: number | null
  lastAccrual: number
}

export function useAdminMarkets(): { markets: AdminMarket[]; loading: boolean } {
  const { prices } = useOraclePrices()
  const PER = 7
  const res = useReadContracts({
    contracts: SYMBOLS.flatMap(sym => {
      const asset = TOKENS[sym].address
      return [
        { address: CONTRACTS.LendingPool, abi: LENDING_POOL_ABI, functionName: 'getMarketConfig' as const, args: [asset] as const, chainId: ARC_TESTNET_CHAIN_ID },
        { address: CONTRACTS.LendingPool, abi: LENDING_POOL_ABI, functionName: 'getMarketState' as const, args: [asset] as const, chainId: ARC_TESTNET_CHAIN_ID },
        { address: CONTRACTS.LendingPool, abi: LENDING_POOL_ABI, functionName: 'getMarketTotals' as const, args: [asset] as const, chainId: ARC_TESTNET_CHAIN_ID },
        { address: CONTRACTS.LendingPool, abi: LENDING_POOL_ABI, functionName: 'getMarketRates' as const, args: [asset] as const, chainId: ARC_TESTNET_CHAIN_ID },
        { address: CONTRACTS.LendingPool, abi: LENDING_POOL_ABI, functionName: 'borrowFeeBps' as const, args: [asset] as const, chainId: ARC_TESTNET_CHAIN_ID },
        { address: asset, abi: ERC20_ABI, functionName: 'balanceOf' as const, args: [CONTRACTS.LendingPool] as const, chainId: ARC_TESTNET_CHAIN_ID },
        { address: CONTRACTS.PythOracle, abi: ORACLE_ADMIN_ABI, functionName: 'storedPrices' as const, args: [asset] as const, chainId: ARC_TESTNET_CHAIN_ID },
      ]
    }),
    query: { refetchInterval: 15_000 },
  })
  const maxAges = useReadContracts({
    contracts: SYMBOLS.map(sym => ({
      address: CONTRACTS.PythOracle, abi: ORACLE_ADMIN_ABI, functionName: 'assetConfigs' as const,
      args: [TOKENS[sym].address] as const, chainId: ARC_TESTNET_CHAIN_ID,
    })),
  })
  const nowS = Math.floor(useNow() / 1000)

  const markets = SYMBOLS.map((sym, i): AdminMarket => {
    const d = res.data
    const get = <T,>(k: number): T | undefined =>
      d?.[i * PER + k]?.status === 'success' ? d[i * PER + k].result as T : undefined
    const decimals = TOKENS[sym].decimals
    const config = get<MarketConfigView>(0) ?? null
    const state = get<{ reservesRay: bigint; lastAccrualTimestamp: bigint }>(1)
    const totals = get<readonly [bigint, bigint]>(2)
    const rates = get<readonly [bigint, bigint]>(3)
    const fee = get<number>(4)
    const cash = get<bigint>(5) ?? 0n
    const stored = get<readonly [bigint, bigint, boolean]>(6)
    const ageCfg = maxAges.data?.[i]?.status === 'success'
      ? maxAges.data[i].result as readonly [number, bigint]
      : undefined

    const totalSupply = totals?.[0] ?? 0n
    const totalDebt = totals?.[1] ?? 0n
    const secondsPerYear = 31_536_000
    const rateToPct = (r: bigint) => Number(r) / 1e27 * secondsPerYear * 100
    const reservesRay = state?.reservesRay ?? 0n

    return {
      symbol: sym,
      decimals,
      config,
      totalSupply,
      totalDebt,
      cash,
      reserves: fromRay(reservesRay, decimals),
      reservesRay,
      utilizationPct: totalSupply > 0n ? Number((totalDebt * 10_000n) / totalSupply) / 100 : 0,
      borrowAprPct: rates ? rateToPct(rates[0]) : 0,
      supplyApyPct: rates ? rateToPct(rates[1]) : 0,
      borrowFeeBps: fee ?? null,
      price18: prices[sym],
      priceAgeS: sym === 'USDC' || !stored?.[2] || nowS === 0 ? null : nowS - Number(stored[1]),
      maxPriceAgeS: ageCfg ? Number(ageCfg[1]) : null,
      lastAccrual: state ? Number(state.lastAccrualTimestamp) : 0,
    }
  })
  return { markets, loading: res.isLoading }
}

/** Wall clock refreshed every 15s; 0 on first paint (never read during render). */
function useNow(): number {
  const [now, setNow] = useState(0)
  useEffect(() => {
    const tick = () => setNow(Date.now())
    const t0 = setTimeout(tick, 0)
    const t = setInterval(tick, 15_000)
    return () => { clearTimeout(t0); clearInterval(t) }
  }, [])
  return now
}

export function useKeeperBalance() {
  return useBalance({
    address: KEEPER_ADDRESS,
    chainId: ARC_TESTNET_CHAIN_ID,
    query: { refetchInterval: 30_000 },
  })
}

export function useTimelockInfo() {
  const res = useReadContracts({
    contracts: [
      { address: CONTRACTS.Timelock, abi: TIMELOCK_ABI, functionName: 'admin' as const, chainId: ARC_TESTNET_CHAIN_ID },
      { address: CONTRACTS.Timelock, abi: TIMELOCK_ABI, functionName: 'delay' as const, chainId: ARC_TESTNET_CHAIN_ID },
      {
        address: CONTRACTS.LendingPool, abi: POOL_ADMIN_ABI, functionName: 'hasRole' as const,
        args: [ROLES.RISK_ADMIN, CONTRACTS.Timelock] as const, chainId: ARC_TESTNET_CHAIN_ID,
      },
    ],
  })
  return {
    admin: res.data?.[0]?.status === 'success' ? res.data[0].result as `0x${string}` : null,
    delayS: res.data?.[1]?.status === 'success' ? res.data[1].result as bigint : null,
    hasRiskAdmin: res.data?.[2]?.status === 'success' ? res.data[2].result as boolean : null,
  }
}

// ── Writes ───────────────────────────────────────────────────────────────────

type PoolAdminFn = 'setMarketPaused' | 'setBorrowFee' | 'setRiskParams' | 'withdrawReserves' | 'grantRole' | 'revokeRole'

/** Direct call to a LendingPool admin function. Resolves once mined. */
export function usePoolAdminWrite() {
  const { writeContractAsync } = useWriteContract()
  const confirm = useConfirmTx()
  return async (functionName: PoolAdminFn, args: readonly unknown[]) => {
    const hash = await writeContractAsync({
      address: CONTRACTS.LendingPool,
      abi: POOL_ADMIN_ABI,
      functionName,
      args: args as never,
      chainId: ARC_TESTNET_CHAIN_ID,
    })
    return confirm(hash)
  }
}

/**
 * Risk changes (fees, risk params). A wallet holding RISK_ADMIN directly
 * applies them at once; otherwise the Timelock admin queues them, to be
 * executed after the delay. Production should be Timelock-only.
 */
export function useRiskChange() {
  const roles = useAdminRoles()
  const { delayS } = useTimelockInfo()
  const direct = usePoolAdminWrite()
  const { writeContractAsync } = useWriteContract()
  const confirm = useConfirmTx()

  const mode: 'direct' | 'timelock' | 'none' =
    roles.isRiskAdmin ? 'direct' : roles.isTimelockAdmin ? 'timelock' : 'none'

  async function submit(functionName: 'setBorrowFee' | 'setRiskParams', args: readonly unknown[]) {
    if (mode === 'direct') return { hash: await direct(functionName, args), queued: false }
    if (mode === 'timelock') {
      if (delayS === null) throw new Error('Timelock delay not loaded yet')
      const data = encodeFunctionData({ abi: POOL_ADMIN_ABI, functionName, args: args as never })
      // 2-minute buffer so the tx still satisfies eta >= now + delay when mined.
      const eta = BigInt(Math.floor(Date.now() / 1000)) + delayS + 120n
      const hash = await writeContractAsync({
        address: CONTRACTS.Timelock,
        abi: TIMELOCK_ABI,
        functionName: 'queueTransaction',
        args: [CONTRACTS.LendingPool, 0n, '', data, eta],
        chainId: ARC_TESTNET_CHAIN_ID,
      })
      return { hash: await confirm(hash), queued: true }
    }
    throw new Error('This wallet has neither RISK_ADMIN nor Timelock admin rights')
  }
  return { mode, submit }
}

// ── Timelock queue ───────────────────────────────────────────────────────────

export interface QueuedTx {
  txHash: `0x${string}`
  target: `0x${string}`
  value: bigint
  signature: string
  data: `0x${string}`
  eta: bigint
  /** Human-readable call, e.g. setBorrowFee(USDC, 50). */
  summary: string
}

const QUEUE_EVENTS = TIMELOCK_ABI.filter(e => e.type === 'event') as unknown as AbiEvent[]

function describeCall(data: `0x${string}`): string {
  try {
    const { functionName, args } = decodeFunctionData({ abi: POOL_ADMIN_ABI, data })
    const symByAddr = Object.fromEntries(
      Object.entries(TOKENS).map(([s, t]) => [t.address.toLowerCase(), s]),
    )
    const shown = (args ?? []).map(a =>
      typeof a === 'string' && symByAddr[a.toLowerCase()] ? symByAddr[a.toLowerCase()] : String(a),
    )
    return `${functionName}(${shown.join(', ')})`
  } catch {
    return `raw call ${data.slice(0, 10)}…`
  }
}

/** Timelock transactions that are queued and not yet executed or cancelled. */
export function useTimelockQueue(reloadKey: number) {
  const client = usePublicClient({ chainId: ARC_TESTNET_CHAIN_ID })
  const [items, setItems] = useState<QueuedTx[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!client) return
    let cancelled = false
    async function load() {
      setLoading(true); setError(null)
      try {
        const logs = await getLogsChunked(
          client!, CONTRACTS.Timelock, QUEUE_EVENTS, POOL_DEPLOY_BLOCK,
          { cacheKey: 'timelock-queue', isCancelled: () => cancelled },
        )
        type L = { eventName?: string; args?: Omit<QueuedTx, 'summary'> }
        const latest = new Map<string, QueuedTx | null>()
        for (const log of logs as unknown as L[]) {
          const a = log.args
          if (!a) continue
          latest.set(a.txHash, log.eventName === 'QueueTransaction'
            ? { ...a, summary: describeCall(a.data) }
            : null)
        }
        const pending = [...latest.values()].filter((x): x is QueuedTx => x !== null)
        // Confirm against contract storage; events alone can't see every edge case.
        const still = await Promise.all(pending.map(p => client!.readContract({
          address: CONTRACTS.Timelock, abi: TIMELOCK_ABI, functionName: 'queuedTransactions', args: [p.txHash],
        })))
        if (!cancelled) setItems(pending.filter((_, i) => still[i]))
      } catch (err) {
        console.error('Failed to load timelock queue', err)
        if (!cancelled) setError('Could not load the Timelock queue from the Arc RPC.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => { cancelled = true }
  }, [client, reloadKey])

  return { items, loading, error }
}

export function useTimelockAction() {
  const { writeContractAsync } = useWriteContract()
  const confirm = useConfirmTx()
  return async (functionName: 'executeTransaction' | 'cancelTransaction', tx: QueuedTx) => {
    const hash = await writeContractAsync({
      address: CONTRACTS.Timelock,
      abi: TIMELOCK_ABI,
      functionName,
      args: [tx.target, tx.value, tx.signature, tx.data, tx.eta],
      chainId: ARC_TESTNET_CHAIN_ID,
    })
    return confirm(hash)
  }
}

// ── Role holders (replayed from RoleGranted / RoleRevoked) ───────────────────

const ROLE_EVENTS = POOL_ADMIN_ABI.filter(e => e.type === 'event') as unknown as AbiEvent[]

export function useRoleHolders(reloadKey: number) {
  const client = usePublicClient({ chainId: ARC_TESTNET_CHAIN_ID })
  const [holders, setHolders] = useState<Record<RoleName, `0x${string}`[]> | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!client) return
    let cancelled = false
    async function load() {
      setError(null)
      try {
        const logs = await getLogsChunked(
          client!, CONTRACTS.LendingPool, ROLE_EVENTS, POOL_DEPLOY_BLOCK,
          { cacheKey: 'roles', isCancelled: () => cancelled },
        )
        const sets = new Map<string, Set<`0x${string}`>>()
        type L = { eventName?: string; args?: { role: `0x${string}`; account: `0x${string}` } }
        for (const log of logs as unknown as L[]) {
          if (!log.args) continue
          const set = sets.get(log.args.role) ?? new Set()
          if (log.eventName === 'RoleGranted') set.add(log.args.account)
          else set.delete(log.args.account)
          sets.set(log.args.role, set)
        }
        const out = {} as Record<RoleName, `0x${string}`[]>
        for (const [name, hash] of Object.entries(ROLES) as [RoleName, `0x${string}`][]) {
          out[name] = [...(sets.get(hash) ?? [])]
        }
        if (!cancelled) setHolders(out)
      } catch (err) {
        console.error('Failed to load role holders', err)
        if (!cancelled) setError('Could not load role holders from the Arc RPC.')
      }
    }
    void load()
    return () => { cancelled = true }
  }, [client, reloadKey])

  return { holders, error }
}

/** Single role check for any address (used by the Access page lookup). */
export function useHasRole(role: RoleName, account: `0x${string}` | undefined) {
  return useReadContract({
    address: CONTRACTS.LendingPool,
    abi: POOL_ADMIN_ABI,
    functionName: 'hasRole',
    args: [ROLES[role], account!],
    chainId: ARC_TESTNET_CHAIN_ID,
    query: { enabled: !!account },
  })
}
