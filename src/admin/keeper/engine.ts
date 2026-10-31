/**
 * Browser keeper engine (no React). Same job as the Node keeper in
 * steadfi/keeper/src/keeper.ts: push Pyth Pro prices and liquidate HF < 1.
 *
 * One cycle:
 *   1. Read every borrower's health factor (Borrow events, cached scan).
 *   2. Price step: fetch the latest signed update from /api/pyth-latest and
 *      push it only if it would refresh a feed that is stale or about to be
 *      (gas saver), or a borrower is close to liquidation. Feeds that Pyth
 *      itself hasn't updated (EUR/USD on weekends) never trigger a push.
 *   3. Liquidation step: liquidate HF < 1 positions the keeper can afford.
 *
 * Every transaction is simulated first and checked against the session
 * budget; a failed simulation sends nothing. Signing is injected (KeeperSigner)
 * so the same engine runs with a browser key or the connected wallet.
 */

import { parseAbi, parseAbiItem, type Abi, type Address, type Hex, type PublicClient } from 'viem'
import {
  ARC_CHAIN_ID, CONTRACTS, TOKENS, POOL_DEPLOY_BLOCK,
  LENDING_POOL_ABI, ORACLE_ABI, ERC20_ABI, rayToHf,
} from '../../lib/steadfi'
import { getLogsChunked } from '../../lib/logs'
import { ORACLE_ADMIN_ABI } from '../abi'

const PYTH_LAZER: Address = '0xACeA761c27A909d4D3895128EBe6370FDE2dF481'
const LAZER_ABI = parseAbi(['function verification_fee() view returns (uint256)'])
const BORROW_EVENT = parseAbiItem(
  'event Borrow(address indexed user, address indexed asset, uint256 amount, uint256 debtShares)',
)

/** Pyth Pro feed id per collateral/borrow token that needs a price. USDC is fixed at $1. */
const FEED_IDS: Record<string, number> = { cirBTC: 1, WETH: 2, EURC: 327 }

const NEAR_LIQUIDATION_HF = 1.1
const MAX_LOGS = 200
const GWEI = 10n ** 9n
const BASE_FEE_FLOOR = 20n * GWEI
/** USDC is the gas token: keep this much of it when repaying USDC debt. */
const GAS_RESERVE_USDC = 0.01

// ── Types ────────────────────────────────────────────────────────────────────

export interface KeeperSettings {
  intervalSec: number
  /** Push when a feed has at most this many seconds left before going stale. */
  refreshMarginSec: number
  gasSaver: boolean
  liquidationsOn: boolean
  sessionBudgetUsdc: number
  minBalanceUsdc: number
  dryRun: boolean
}

export const DEFAULT_SETTINGS: KeeperSettings = {
  intervalSec: 60,
  refreshMarginSec: 120,
  gasSaver: true,
  liquidationsOn: true,
  sessionBudgetUsdc: 0.05,
  minBalanceUsdc: 0.01,
  dryRun: false,
}

export interface KeeperCall {
  address: Address
  abi: Abi
  functionName: string
  args: readonly unknown[]
  value?: bigint
  gas: bigint
  maxFeePerGas: bigint
  maxPriorityFeePerGas: bigint
}

export interface KeeperSigner {
  address: Address
  /** False for the connected wallet: every tx needs a confirmation, so only "Run once". */
  canAutoRun: boolean
  sendCall(call: KeeperCall): Promise<Hex>
}

export interface PriceRow {
  symbol: string
  feedId: number
  maxAge: number
  onchainPrice: number | null
  onchainPublishTime: number | null
  pythPrice: number | null
  pythPublishTime: number | null
}

export type LogLevel = 'info' | 'warn' | 'error' | 'tx'

export interface LogEntry {
  id: number
  ts: number
  level: LogLevel
  message: string
  txHash?: string
  costUsdc?: number
}

export type KeeperStatus = 'idle' | 'running' | 'stopping'

export interface KeeperSnapshot {
  status: KeeperStatus
  /** A cycle (scheduled or Run once) is in progress. */
  busy: boolean
  autoStopReason: string | null
  startedAt: number | null
  lastCycleAt: number | null
  nextCycleAt: number | null
  lastDecision: string | null
  cycles: number
  txs: number
  spentUsdc: number
  borrowers: number
  nearLiquidation: number
  liquidatable: number
  prices: PriceRow[]
  chainTime: number | null
  settings: KeeperSettings
  logs: LogEntry[]
}

interface PythLatest {
  evmPayload: Hex
  feeds: { feedId: number; price: string; exponent: number; publishTime: number }[]
}

class AutoStop extends Error {}

function errMsg(err: unknown): string {
  const e = err as { shortMessage?: string; message?: string }
  return (e?.shortMessage ?? e?.message ?? String(err)).split('\n')[0]
}

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`

// ── Engine ───────────────────────────────────────────────────────────────────

export class KeeperEngine {
  private client: PublicClient | null = null
  private signer: KeeperSigner | null = null
  private snap: KeeperSnapshot
  private listeners = new Set<() => void>()
  private running = false
  private oneShot = false
  private wake: (() => void) | null = null
  private releaseLock: (() => void) | null = null
  private verificationFee: bigint | null = null
  private warned = new Map<string, string>()
  private logId = Date.now()

  constructor(settings: KeeperSettings, logs: LogEntry[]) {
    this.snap = {
      status: 'idle', busy: false, autoStopReason: null,
      startedAt: null, lastCycleAt: null, nextCycleAt: null, lastDecision: null,
      cycles: 0, txs: 0, spentUsdc: 0,
      borrowers: 0, nearLiquidation: 0, liquidatable: 0,
      prices: [], chainTime: null,
      settings, logs,
    }
  }

  // ── Store (useSyncExternalStore) ──────────────────────────────────────────

  subscribe = (fn: () => void) => {
    this.listeners.add(fn)
    return () => { this.listeners.delete(fn) }
  }

  getSnapshot = () => this.snap

  private patch(p: Partial<KeeperSnapshot>) {
    this.snap = { ...this.snap, ...p }
    this.listeners.forEach(l => l())
  }

  private log(level: LogLevel, message: string, extra: Partial<LogEntry> = {}) {
    const entry: LogEntry = { id: ++this.logId, ts: Date.now(), level, message, ...extra }
    this.patch({ logs: [entry, ...this.snap.logs].slice(0, MAX_LOGS) })
  }

  /** Logs `message` only when it differs from the last one logged under `key`. */
  private logOnce(key: string, level: LogLevel, message: string) {
    if (this.warned.get(key) === message) return
    this.warned.set(key, message)
    this.log(level, message)
  }

  clearLogs() { this.patch({ logs: [] }) }

  // ── Wiring ────────────────────────────────────────────────────────────────

  setClient(client: PublicClient) { this.client = client }

  setSigner(signer: KeeperSigner | null) {
    const prev = this.signer
    this.signer = signer
    const changed = prev?.address !== signer?.address || prev?.canAutoRun !== signer?.canAutoRun
    if (this.running && changed) this.stop('Keeper wallet changed or was locked')
  }

  updateSettings(p: Partial<KeeperSettings>) {
    const s = { ...this.snap.settings, ...p }
    s.intervalSec = Math.max(30, Math.round(s.intervalSec) || 60)
    s.refreshMarginSec = Math.max(0, Math.round(s.refreshMarginSec) || 0)
    s.sessionBudgetUsdc = Math.max(0, s.sessionBudgetUsdc || 0)
    s.minBalanceUsdc = Math.max(0, s.minBalanceUsdc || 0)
    this.patch({ settings: s })
  }

  // ── Control ───────────────────────────────────────────────────────────────

  async start() {
    if (this.running || this.snap.busy) return
    const signer = this.signer
    if (!signer) return this.log('error', 'Unlock or create a keeper wallet first')
    if (!signer.canAutoRun) return this.log('error', 'Auto-run needs the browser keeper wallet; the connected wallet can only Run once')
    if (!await this.acquireLock(signer.address)) {
      return this.log('error', 'This keeper wallet is already running in another tab')
    }
    this.running = true
    this.patch({
      status: 'running', autoStopReason: null, startedAt: Date.now(),
      cycles: 0, txs: 0, spentUsdc: 0,
    })
    this.log('info', `Started (every ${this.snap.settings.intervalSec}s, budget ${this.snap.settings.sessionBudgetUsdc} USDC)`)
    void this.loop()
  }

  stop(reason?: string) {
    if (!this.running) return
    this.running = false
    this.wake?.()
    this.patch({
      status: this.snap.busy ? 'stopping' : 'idle',
      nextCycleAt: null,
      autoStopReason: reason ?? null,
    })
    this.log(reason ? 'warn' : 'info', reason ? `Stopped: ${reason}` : 'Stopped')
  }

  async runOnce() {
    if (this.running || this.snap.busy) return
    const signer = this.signer
    if (!signer) return this.log('error', 'Unlock or create a keeper wallet, or connect a wallet, first')
    if (!await this.acquireLock(signer.address)) {
      return this.log('error', 'This keeper wallet is already running in another tab')
    }
    this.oneShot = true
    this.log('info', 'Run once')
    try {
      await this.safeCycle()
    } finally {
      this.oneShot = false
      this.releaseLock?.()
      this.releaseLock = null
    }
  }

  /** Read-only refresh of prices and chain time for the UI while idle. */
  async refresh() {
    if (this.snap.busy || !this.client) return
    try {
      const block = await this.client.getBlock()
      await this.readPrices(Number(block.timestamp))
    } catch {
      // Display-only; the next refresh retries.
    }
  }

  private async loop() {
    while (this.running) {
      await this.safeCycle()
      if (!this.running) break
      const ms = this.snap.settings.intervalSec * 1000
      this.patch({ nextCycleAt: Date.now() + ms })
      await new Promise<void>(resolve => {
        const t = setTimeout(resolve, ms)
        this.wake = () => { clearTimeout(t); resolve() }
      })
      this.wake = null
    }
    this.releaseLock?.()
    this.releaseLock = null
    this.patch({ status: 'idle', nextCycleAt: null })
  }

  private canSend() { return this.running || this.oneShot }

  private async acquireLock(address: Address): Promise<boolean> {
    const locks = (navigator as Navigator & { locks?: LockManager }).locks
    if (!locks) return true
    return new Promise<boolean>(resolve => {
      void locks.request(`steadfi-keeper-${ARC_CHAIN_ID}-${address.toLowerCase()}`, { ifAvailable: true }, lock => {
        if (!lock) { resolve(false); return }
        resolve(true)
        return new Promise<void>(release => { this.releaseLock = release })
      })
    })
  }

  // ── Cycle ─────────────────────────────────────────────────────────────────

  private async safeCycle() {
    this.patch({ busy: true })
    try {
      await this.cycle()
      this.patch({ cycles: this.snap.cycles + 1, lastCycleAt: Date.now() })
    } catch (err) {
      if (err instanceof AutoStop) {
        if (this.running) this.stop(err.message)
        else this.log('warn', err.message)
      } else {
        this.log('error', `Cycle failed: ${errMsg(err)}`)
      }
    } finally {
      this.patch({ busy: false, ...(this.snap.status === 'stopping' ? { status: 'idle' as const } : {}) })
    }
  }

  private async cycle() {
    const client = this.client
    const signer = this.signer
    if (!client) throw new Error('RPC client not ready')
    if (!signer) throw new AutoStop('Keeper wallet unavailable')

    const balance = await client.getBalance({ address: signer.address })
    if (Number(balance) / 1e18 < this.snap.settings.minBalanceUsdc) {
      throw new AutoStop(`Keeper balance is below the ${this.snap.settings.minBalanceUsdc} USDC minimum — fund it`)
    }
    this.checkBudget(0)

    const health = await this.readHealth()
    await this.priceStep(signer, health.near > 0)
    if (this.snap.settings.liquidationsOn && health.candidates.length > 0) {
      await this.liquidationStep(signer, health.candidates)
    }
  }

  private checkBudget(nextCostUsdc: number) {
    const { sessionBudgetUsdc } = this.snap.settings
    if (sessionBudgetUsdc > 0 && this.snap.spentUsdc + nextCostUsdc > sessionBudgetUsdc) {
      throw new AutoStop(`Session gas budget of ${sessionBudgetUsdc} USDC reached`)
    }
  }

  // ── Health ────────────────────────────────────────────────────────────────

  private async borrowersList(): Promise<Address[]> {
    const logs = await getLogsChunked(this.client!, CONTRACTS.LendingPool, [BORROW_EVENT], POOL_DEPLOY_BLOCK, {
      cacheKey: 'keeper-borrowers',
    })
    return [...new Set(logs.map(l => (l.args.user as Address).toLowerCase() as Address))]
  }

  private async healthFactor(user: Address): Promise<number | null> {
    try {
      const [hf] = await this.client!.readContract({
        address: CONTRACTS.LendingPool, abi: LENDING_POOL_ABI, functionName: 'getHealthFactor', args: [user],
      })
      return rayToHf(hf)
    } catch {
      return null // reverts while a price is stale
    }
  }

  /** Borrowers with HF < 1, or unknown HF (stale price), become liquidation candidates. */
  private async readHealth() {
    let borrowers: Address[] = []
    try {
      borrowers = await this.borrowersList()
    } catch (err) {
      this.logOnce('borrowers', 'warn', `Borrower scan failed, retrying next cycle: ${errMsg(err)}`)
    }
    let near = 0
    let liquidatable = 0
    const candidates: Address[] = []
    for (const b of borrowers) {
      const hf = await this.healthFactor(b)
      if (hf === null || hf < 1) candidates.push(b)
      if (hf !== null && hf < 1) liquidatable++
      if (hf === null || hf < NEAR_LIQUIDATION_HF) near++
    }
    this.patch({ borrowers: borrowers.length, nearLiquidation: near, liquidatable })
    return { near, candidates }
  }

  // ── Prices ────────────────────────────────────────────────────────────────

  private feedAssets() {
    return Object.values(TOKENS)
      .filter(t => FEED_IDS[t.symbol] !== undefined)
      .map(t => ({ symbol: t.symbol as string, asset: t.address as Address, feedId: FEED_IDS[t.symbol] }))
  }

  private async fetchPyth(feedIds: number[]): Promise<PythLatest> {
    const res = await fetch('/api/pyth-latest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ feedIds }),
    })
    const body = await res.json().catch(() => ({})) as PythLatest & { error?: string }
    if (!res.ok) throw new Error(body.error ?? `Price service HTTP ${res.status}`)
    return body
  }

  /** Reads on-chain and Pyth prices; returns the rows plus the signed payload. */
  private async readPrices(now: number) {
    const client = this.client!
    const assets = this.feedAssets()
    const onchain = await Promise.all(assets.map(async a => {
      const [[feedId, maxAge], [price, publishTime, set]] = await Promise.all([
        client.readContract({ address: CONTRACTS.PythOracle, abi: ORACLE_ADMIN_ABI, functionName: 'assetConfigs', args: [a.asset] }),
        client.readContract({ address: CONTRACTS.PythOracle, abi: ORACLE_ADMIN_ABI, functionName: 'storedPrices', args: [a.asset] }),
      ])
      return { ...a, configured: feedId !== 0, maxAge: Number(maxAge), price, publishTime: Number(publishTime), set }
    }))
    const configured = onchain.filter(a => a.configured)

    let pyth: PythLatest | null = null
    let pythError: string | null = null
    if (configured.length > 0) {
      try {
        pyth = await this.fetchPyth(configured.map(a => a.feedId))
      } catch (err) {
        pythError = errMsg(err)
      }
    }

    const rows: PriceRow[] = configured.map(a => {
      const f = pyth?.feeds.find(x => x.feedId === a.feedId)
      return {
        symbol: a.symbol,
        feedId: a.feedId,
        maxAge: a.maxAge,
        onchainPrice: a.set ? Number(a.price) / 1e18 : null,
        onchainPublishTime: a.set ? a.publishTime : null,
        pythPrice: f ? Number(f.price) * 10 ** f.exponent : null,
        pythPublishTime: f ? f.publishTime : null,
      }
    })
    this.patch({ prices: rows, chainTime: now })
    return { rows, pyth, pythError }
  }

  private async priceStep(signer: KeeperSigner, borrowerAtRisk: boolean) {
    const { gasSaver, refreshMarginSec } = this.snap.settings
    const fees = await this.fees()
    const { rows, pyth, pythError } = await this.readPrices(fees.now)
    if (rows.length === 0) return
    if (!pyth) {
      this.logOnce('pyth', 'warn', `Could not fetch Pyth prices: ${pythError}`)
      return
    }
    this.warned.delete('pyth')

    // A feed is worth pushing only if Pyth has something newer and still fresh.
    const refreshable = rows.filter(r =>
      r.pythPublishTime !== null &&
      r.pythPublishTime > (r.onchainPublishTime ?? 0) &&
      fees.now - r.pythPublishTime < r.maxAge)
    const due = refreshable.filter(r =>
      !gasSaver || borrowerAtRisk || r.onchainPublishTime === null ||
      r.maxAge - (fees.now - r.onchainPublishTime) <= refreshMarginSec)

    const idle = rows.filter(r => r.pythPublishTime !== null && fees.now - r.pythPublishTime >= r.maxAge)
    const idleNote = idle.length ? ` (${idle.map(r => r.symbol).join(', ')}: Pyth feed idle, market closed)` : ''

    if (due.length === 0) {
      this.patch({ lastDecision: `No price push needed${idleNote}` })
      return
    }

    this.verificationFee ??= await this.client!.readContract({
      address: PYTH_LAZER, abi: LAZER_ABI, functionName: 'verification_fee',
    })
    const reason = borrowerAtRisk && gasSaver ? 'borrower near liquidation' : `${due.map(r => r.symbol).join(', ')} due`
    const sent = await this.send(signer, `Price push (${reason})`, {
      address: CONTRACTS.PythOracle,
      abi: ORACLE_ABI as Abi,
      functionName: 'updatePrices',
      args: [pyth.evmPayload],
      value: this.verificationFee,
    }, fees)
    this.patch({ lastDecision: sent ? `Pushed ${due.map(r => r.symbol).join(', ')}${idleNote}` : `Price push not sent${idleNote}` })
    if (sent) await this.readPrices(Number((await this.client!.getBlock()).timestamp))
  }

  // ── Liquidations ──────────────────────────────────────────────────────────

  private async liquidationStep(signer: KeeperSigner, candidates: Address[]) {
    for (const borrower of candidates) {
      if (!this.canSend()) return
      if (borrower === signer.address.toLowerCase()) continue // the pool rejects self-liquidation
      const hf = await this.healthFactor(borrower)
      if (hf === null || hf >= 1) continue
      await this.liquidate(signer, borrower)
    }
  }

  private async liquidate(signer: KeeperSigner, borrower: Address) {
    const client = this.client!
    const pool = CONTRACTS.LendingPool
    const tokens = Object.values(TOKENS)
    const debts = await Promise.all(tokens.filter(t => t.borrowEnabled).map(async t => {
      const [amount, price] = await Promise.all([
        client.readContract({ address: pool, abi: LENDING_POOL_ABI, functionName: 'getUserDebt', args: [borrower, t.address] }),
        client.readContract({ address: CONTRACTS.PythOracle, abi: ORACLE_ABI, functionName: 'getPrice', args: [t.address] }),
      ])
      return { token: t, amount, usd: Number(amount) / 10 ** t.decimals * Number(price) / 1e18 }
    }))
    const colls = await Promise.all(tokens.filter(t => t.collateralEnabled).map(async t => {
      const [amount, price] = await Promise.all([
        client.readContract({ address: pool, abi: LENDING_POOL_ABI, functionName: 'getUserSupply', args: [borrower, t.address] }),
        client.readContract({ address: CONTRACTS.PythOracle, abi: ORACLE_ABI, functionName: 'getPrice', args: [t.address] }),
      ])
      return { token: t, amount, usd: Number(amount) / 10 ** t.decimals * Number(price) / 1e18 }
    }))
    const debt = debts.filter(d => d.amount > 0n).sort((a, b) => b.usd - a.usd)[0]
    const coll = colls.filter(c => c.amount > 0n).sort((a, b) => b.usd - a.usd)[0]
    if (!debt || !coll) return

    const sym = debt.token.symbol
    const cfg = await client.readContract({ address: pool, abi: LENDING_POOL_ABI, functionName: 'getMarketConfig', args: [debt.token.address] })
    const maxRepay = debt.amount * BigInt(cfg.closeFactor) / 10_000n
    let balance = await client.readContract({ address: debt.token.address, abi: ERC20_ABI, functionName: 'balanceOf', args: [signer.address] })
    if (debt.token.symbol === 'USDC') {
      const reserve = BigInt(Math.ceil((this.snap.settings.minBalanceUsdc + GAS_RESERVE_USDC) * 1e6))
      balance = balance > reserve ? balance - reserve : 0n
    }
    const repay = balance < maxRepay ? balance : maxRepay
    if (repay === 0n) {
      this.logOnce(`liq-${borrower}`, 'warn',
        `${short(borrower)} is liquidatable but the keeper has no spare ${sym} to repay (up to ${Number(maxRepay) / 10 ** debt.token.decimals} ${sym})`)
      return
    }

    const fees = await this.fees()
    const allowance = await client.readContract({ address: debt.token.address, abi: ERC20_ABI, functionName: 'allowance', args: [signer.address, pool] })
    if (allowance < repay) {
      const ok = await this.send(signer, `Approve ${sym} for liquidation`, {
        address: debt.token.address, abi: ERC20_ABI as Abi, functionName: 'approve', args: [pool, repay],
      }, fees)
      if (!ok) return
    }
    const ok = await this.send(signer, `Liquidate ${short(borrower)} (repay ${Number(repay) / 10 ** debt.token.decimals} ${sym}, seize ${coll.token.symbol})`, {
      address: pool, abi: LENDING_POOL_ABI as Abi, functionName: 'liquidate',
      args: [borrower, debt.token.address, coll.token.address, repay],
    }, fees)
    if (ok) this.warned.delete(`liq-${borrower}`)
  }

  // ── Sending ───────────────────────────────────────────────────────────────

  private async fees() {
    const block = await this.client!.getBlock()
    const base = block.baseFeePerGas && block.baseFeePerGas > BASE_FEE_FLOOR ? block.baseFeePerGas : BASE_FEE_FLOOR
    return { base, maxFeePerGas: base * 2n, maxPriorityFeePerGas: 0n, now: Number(block.timestamp) }
  }

  /** Simulates, budget-checks, sends and waits for `call`. Returns true on a successful receipt. */
  private async send(
    signer: KeeperSigner,
    label: string,
    call: Omit<KeeperCall, 'gas' | 'maxFeePerGas' | 'maxPriorityFeePerGas'>,
    fees: { base: bigint; maxFeePerGas: bigint; maxPriorityFeePerGas: bigint },
  ): Promise<boolean> {
    const client = this.client!
    let gas: bigint
    try {
      await client.simulateContract({ ...call, account: signer.address } as never)
      gas = await client.estimateContractGas({ ...call, account: signer.address } as never)
    } catch (err) {
      this.logOnce(`sim-${label}`, 'warn', `${label} skipped — simulation failed: ${errMsg(err)}`)
      return false
    }
    this.warned.delete(`sim-${label}`)
    gas = gas * 12n / 10n
    const estCost = Number(gas * fees.base) / 1e18
    this.checkBudget(estCost)

    if (this.snap.settings.dryRun) {
      this.log('info', `Dry run: would send ${label} (~${estCost.toFixed(4)} USDC)`)
      return false
    }
    if (!this.canSend()) return false

    const hash = await signer.sendCall({ ...call, gas, maxFeePerGas: fees.maxFeePerGas, maxPriorityFeePerGas: fees.maxPriorityFeePerGas })
    this.log('tx', `${label} sent`, { txHash: hash })
    const receipt = await client.waitForTransactionReceipt({ hash, timeout: 120_000 })
    const cost = Number(receipt.gasUsed * receipt.effectiveGasPrice) / 1e18
    this.patch({ spentUsdc: this.snap.spentUsdc + cost, txs: this.snap.txs + 1 })
    const ok = receipt.status === 'success'
    this.log(ok ? 'tx' : 'error', `${label} ${ok ? 'confirmed' : 'reverted'}`, { txHash: hash, costUsdc: cost })
    return ok
  }
}
