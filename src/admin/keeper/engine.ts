/**
 * Keeper engine — src/admin/keeper/engine.ts
 *
 * Pure TypeScript (no React). Ports the Node keeper logic
 * (steadfi/keeper/src/keeper.ts) into a browser-runnable loop:
 *
 *   - Price cycle: push fresh Pyth prices when feeds are near-stale or a
 *     borrower is near liquidation. Always simulates updatePrices first and
 *     only sends when the simulation succeeds (another keeper may have
 *     already pushed).
 *   - Liquidation cycle: scan Borrow events for unhealthy borrowers, pick
 *     the best debt/collateral pair, cap repayment at close factor, approve
 *     exactly what's needed, simulate liquidate, then send.
 *   - Safety rails: interval, session gas budget, min balance, dry-run,
 *     no concurrent cycles, no overlapping txs.
 *
 * The engine owns a viem PublicClient for reads. Write/send is injected
 * via setSendTx (implemented by KeeperProvider using either an in-memory
 * wallet client for browser keys or wagmi for the connected wallet).
 * It emits typed events consumed by the UI. It never touches localStorage
 * or React state directly.
 */

import {
  createPublicClient,
  http,
  parseAbi,
  parseAbiItem,
  type Abi,
  type PublicClient,
  type Hex,
  type Address,
} from 'viem'
import { arc, arcTestnet } from 'viem/chains'
import {
  CONTRACTS, TOKENS, POOL_DEPLOY_BLOCK,
  LENDING_POOL_ABI, ORACLE_ABI, ERC20_ABI,
  rayToHf, formatToken,
} from '../../lib/steadfi'
import { getLogsChunked } from '../../lib/logs'
import { ORACLE_ADMIN_ABI } from '../abi'
import { shortAddr } from './wallet'

// ── Constants ─────────────────────────────────────────────────────────────

const PYTH_LAZER: Address = '0xACeA761c27A909d4D3895128EBe6370FDE2dF481'

const LAZER_ABI = parseAbi([
  'function verification_fee() view returns (uint256)',
])

const BORROW_EVENT = parseAbiItem(
  'event Borrow(address indexed user, address indexed asset, uint256 amount, uint256 debtShares)'
)

const BASE_FEE_FLOOR_GWEI = 20

// ── Settings ──────────────────────────────────────────────────────────────

export interface KeeperSettings {
  intervalSec: number        // min 30, default 60
  refreshMarginSec: number   // default 120
  gasSaver: boolean          // default ON
  liquidationsOn: boolean    // default ON
  sessionBudgetUsdc: number  // default 0.05
  minBalanceUsdc: number     // default 0.01
  dryRun: boolean            // default OFF
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

// ── Events ────────────────────────────────────────────────────────────────

export type KeeperEvent =
  | { type: 'status'; status: 'stopped' | 'running' | 'run-once' | 'error' | 'auto-stopped'; detail?: string }
  | { type: 'cycle'; phase: 'start' | 'end'; durationMs: number }
  | { type: 'price'; asset: string; priceUsd: number | null; ageSec: number | null; fresh: boolean }
  | { type: 'tx'; hash: string; action: string; costUsdc: number | null; status: 'sent' | 'confirmed' | 'failed' }
  | { type: 'warning'; message: string }
  | { type: 'error'; message: string }

type Listener = (ev: KeeperEvent) => void

// ── Injected send function ────────────────────────────────────────────────

/** Simulates then sends a contract call. Returns { hash, receipt, costUsdc }. */
export type SendTx = (args: {
  address: Address
  abi: Abi
  functionName: string
  args: unknown[]
  value?: bigint
}) => Promise<{ hash: string; receipt: { status: bigint; gasUsed: bigint; effectiveGasPrice: bigint }; costUsdc: number }>

// ── Engine ────────────────────────────────────────────────────────────────

export interface EngineState {
  status: 'stopped' | 'running' | 'run-once' | 'error' | 'auto-stopped'
  runningSince: number | null
  cycleCount: number
  txCount: number
  gasSpentUsdc: number
  borrowersTracked: number
  unhealthyCount: number
  lastCycleMs: number | null
  nextCycleMs: number | null
  autoStoppedReason: string | null
}

export class KeeperEngine {
  private settings: KeeperSettings
  private publicClient: PublicClient
  private walletAccountAddress: Address | null
  private sendTx: SendTx | null
  private listeners = new Set<Listener>()

  private status: EngineState['status'] = 'stopped'
  private runningSince: number | null = null
  private cycleCount = 0
  private txCount = 0
  private gasSpentUsdc = 0
  private borrowersTracked = 0
  private unhealthyCount = 0
  private lastCycleMs: number | null = null
  private nextCycleMs: number | null = null
  private autoStoppedReason: string | null = null

  private timer: ReturnType<typeof setInterval> | null = null
  private cycleLock = false

  private borrowersCache = new Map<Address, { block: bigint }>()
  private borrowersScanDone = false

  constructor(settings: Partial<KeeperSettings> = {}) {
    this.settings = { ...DEFAULT_SETTINGS, ...settings }
    const isMainnet = process.env.VITE_NETWORK !== 'testnet'
    const chain = isMainnet ? arc : arcTestnet
    const rpcUrls = (chain as { rpcUrls: { default: { http: readonly string[] } } }).rpcUrls.default.http
    this.publicClient = createPublicClient({
      chain,
      transport: http(rpcUrls[0]),
    })
    this.walletAccountAddress = null
    this.sendTx = null
  }

  // ── Public API ────────────────────────────────────────────────────────

  on(listener: Listener) { this.listeners.add(listener) }
  off(listener: Listener) { this.listeners.delete(listener) }
  private emit(ev: KeeperEvent) { this.listeners.forEach(l => l(ev)) }

  getState(): EngineState {
    return {
      status: this.status,
      runningSince: this.runningSince,
      cycleCount: this.cycleCount,
      txCount: this.txCount,
      gasSpentUsdc: this.gasSpentUsdc,
      borrowersTracked: this.borrowersTracked,
      unhealthyCount: this.unhealthyCount,
      lastCycleMs: this.lastCycleMs,
      nextCycleMs: this.nextCycleMs,
      autoStoppedReason: this.autoStoppedReason,
    }
  }

  getSettings(): KeeperSettings { return { ...this.settings } }

  updateSettings(patch: Partial<KeeperSettings>) {
    this.settings = { ...this.settings, ...patch }
  }

  setWalletAccount(address: Address | null) {
    this.walletAccountAddress = address
  }

  setSendTx(fn: SendTx | null) {
    this.sendTx = fn
  }

  async start() {
    if (this.status === 'running' || this.status === 'run-once') return
    if (!this.walletAccountAddress) {
      this.status = 'error'
      this.autoStoppedReason = 'No wallet account'
      this.emit({ type: 'status', status: 'error', detail: this.autoStoppedReason })
      return
    }
    if (!this.sendTx) {
      this.status = 'error'
      this.autoStoppedReason = 'No send function'
      this.emit({ type: 'status', status: 'error', detail: this.autoStoppedReason })
      return
    }
    this.status = 'running'
    this.runningSince = Date.now()
    this.autoStoppedReason = null
    this.emit({ type: 'status', status: 'running' })
    this.scheduleNext()
  }

  stop() {
    clearInterval(this.timer!)
    this.timer = null
    this.status = 'stopped'
    this.runningSince = null
    this.autoStoppedReason = null
    this.emit({ type: 'status', status: 'stopped' })
  }

  async runOnce() {
    if (this.cycleLock) return
    this.status = 'run-once'
    this.runningSince = Date.now()
    this.emit({ type: 'status', status: 'run-once' })
    await this.runCycle()
    this.status = 'stopped'
    this.runningSince = null
    this.emit({ type: 'status', status: 'stopped' })
  }

  private scheduleNext() {
    clearInterval(this.timer!)
    this.timer = setInterval(() => {
      if (!this.cycleLock) void this.runCycle()
    }, this.settings.intervalSec * 1000)
    this.nextCycleMs = Date.now() + this.settings.intervalSec * 1000
    this.emit({ type: 'cycle', phase: 'end', durationMs: 0 })
  }

  // ── Main cycle ────────────────────────────────────────────────────────

  private async runCycle() {
    if (this.cycleLock) return
    this.cycleLock = true
    try {
      if (this.settings.sessionBudgetUsdc > 0 && this.gasSpentUsdc >= this.settings.sessionBudgetUsdc) {
        this.stop()
        this.autoStoppedReason = `Session budget reached ($${this.settings.sessionBudgetUsdc} USDC)`
        this.emit({ type: 'status', status: 'auto-stopped', detail: this.autoStoppedReason })
        return
      }

      await this.priceCycle()

      if (this.settings.liquidationsOn) {
        await this.liquidationCycle()
      }

      this.cycleCount++
      this.lastCycleMs = Date.now()
      this.nextCycleMs = Date.now() + this.settings.intervalSec * 1000
      this.emit({ type: 'cycle', phase: 'end', durationMs: 0 })
    } catch (err: unknown) {
      this.emit({ type: 'error', message: err instanceof Error ? err.message : String(err) })
    } finally {
      this.cycleLock = false
    }
  }

  // ── Price cycle ───────────────────────────────────────────────────────

  private async priceCycle() {
    const assets = this.activeFeedAssets()
    if (assets.length === 0) return

    const reads = await Promise.all(assets.map(async (asset) => {
      const cfg = await this.publicClient.readContract({
        address: CONTRACTS.PythOracle,
        abi: ORACLE_ADMIN_ABI,
        functionName: 'assetConfigs',
        args: [asset],
      }) as unknown as { feedId: bigint; maxAge: bigint }
      const stored = await this.publicClient.readContract({
        address: CONTRACTS.PythOracle,
        abi: ORACLE_ADMIN_ABI,
        functionName: 'storedPrices',
        args: [asset],
      }) as unknown as { price: bigint; publishTime: bigint; set: boolean }
      const now = Math.floor(Date.now() / 1000)
      const ageSec = stored.set ? now - Number(stored.publishTime) : null
      const fresh = stored.set && ageSec !== null && ageSec < Number(cfg.maxAge)
      return { asset, cfg, stored, ageSec, fresh }
    }))

    const allFresh = reads.every(r => r.fresh)

    if (allFresh && this.settings.gasSaver) {
      const nearLiq = await this.anyBorrowerNearLiquidation()
      if (!nearLiq) {
        reads.forEach(r => this.emit({
          type: 'price', asset: r.asset, priceUsd: null, ageSec: r.ageSec, fresh: true,
        }))
        return
      }
    }

    const feedIds = reads.map(r => Number(r.cfg.feedId)).filter(Boolean)

    let evm: Hex | null = null
    try {
      const res = await fetch(`/api/pyth-latest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ feedIds }),
      })
      if (!res.ok) {
        const txt = await res.text().catch(() => '')
        throw new Error(txt || `HTTP ${res.status}`)
      }
      const payload = await res.json() as { evmPayload: string }
      evm = payload.evmPayload as Hex
    } catch (err: unknown) {
      this.emit({ type: 'warning', message: `Pyth fetch failed: ${err instanceof Error ? err.message : String(err)}` })
      return
    }


    const fee = await this.publicClient.readContract({
      address: PYTH_LAZER,
      abi: LAZER_ABI as unknown as Abi,
      functionName: 'verification_fee',
    }) as unknown as bigint

    let simOk = false
    try {
      await this.publicClient.simulateContract({
        address: CONTRACTS.PythOracle,
        abi: ORACLE_ABI,
        functionName: 'updatePrices',
        args: [evm as `0x${string}`],
        value: fee,
        account: this.walletAccountAddress as `0x${string}`,
      })
      simOk = true
    } catch {
      this.emit({ type: 'warning', message: 'Price push skipped: nothing newer (simulation reverted)' })
      return
    }

    if (!simOk) return

    if (this.settings.dryRun) {
      this.emit({ type: 'warning', message: 'Dry-run: would push prices, not sending' })
      return
    }

    if (!this.sendTx) return
    const before = await this.publicClient.getBalance({ address: this.walletAccountAddress as `0x${string}` })
    const gasParams = await this.gasParams()
    const { request } = await this.publicClient.simulateContract({
      address: CONTRACTS.PythOracle,
      abi: ORACLE_ABI,
      functionName: 'updatePrices',
      args: [evm as `0x${string}`],
      value: fee,
      account: this.walletAccountAddress as `0x${string}`,
      ...gasParams,
    })
    const { hash, receipt, costUsdc } = await this.sendTx({
      address: request.address as Address,
      abi: request.abi as unknown as Abi,
      functionName: request.functionName as string,
      args: request.args as unknown[],
      value: request.value,
    })
    this.emit({ type: 'tx', hash, action: 'updatePrices', costUsdc: null, status: 'sent' })
    const after = await this.publicClient.getBalance({ address: this.walletAccountAddress as `0x${string}` })
    const cost = Number(before - after) / 1e18
    this.gasSpentUsdc += cost
    this.txCount++
    this.emit({ type: 'tx', hash, action: 'updatePrices', costUsdc: cost, status: receipt.status === 1n ? 'confirmed' : 'failed' })

    reads.forEach(r => this.emit({
      type: 'price', asset: r.asset, priceUsd: null, ageSec: r.ageSec, fresh: true,
    }))
  }

  // ── Liquidation cycle ─────────────────────────────────────────────────

  private async liquidationCycle() {
    if (!this.borrowersScanDone) {
      await this.scanBorrowers()
    }
    if (this.borrowersCache.size === 0) return

    const borrowers = Array.from(this.borrowersCache.keys())
    this.borrowersTracked = borrowers.length

    for (const borrower of borrowers) {
      const hf = await this.getHealthFactor(borrower)
      if (hf === null || hf >= 1) continue
      this.unhealthyCount++

      const position = await this.bestPosition(borrower)
      if (!position) continue

      await this.liquidatePosition(position)
    }
  }

  private async scanBorrowers() {
    const fromBlock = POOL_DEPLOY_BLOCK
    try {
      const logs = await getLogsChunked(this.publicClient, CONTRACTS.LendingPool, [BORROW_EVENT], fromBlock, {
        cacheKey: 'steadfi-keeper-borrowers',
        isCancelled: () => false,
      })
      const users = new Set<Address>()
      for (const log of logs) {
        const args = log.args as { user?: Address } | undefined
        if (args?.user) users.add(args.user)
      }
      users.forEach(u => this.borrowersCache.set(u, { block: 0n }))
      this.borrowersScanDone = true
    } catch (err: unknown) {
      this.emit({ type: 'warning', message: `Borrower scan failed: ${err instanceof Error ? err.message : String(err)}` })
    }
  }

  private async anyBorrowerNearLiquidation(): Promise<boolean> {
    if (this.borrowersCache.size === 0) return false
    for (const borrower of this.borrowersCache.keys()) {
      const hf = await this.getHealthFactor(borrower)
      if (hf !== null && hf < 1.1) return true
    }
    return false
  }

  private async getHealthFactor(borrower: Address): Promise<number | null> {
    try {
      const data = await this.publicClient.readContract({
        address: CONTRACTS.LendingPool,
        abi: LENDING_POOL_ABI,
        functionName: 'getHealthFactor',
        args: [borrower],
      }) as { 0: bigint; 1: boolean }
      return rayToHf(data[0])
    } catch {
      return null
    }
  }

  private async bestPosition(borrower: Address) {
    const borrowAssets: Address[] = Object.values(TOKENS)
      .filter(t => t.borrowEnabled)
      .map(t => t.address)
    const collateralAssets: Address[] = Object.values(TOKENS)
      .filter(t => t.collateralEnabled)
      .map(t => t.address)

    const [debtAmounts, supplyAmounts] = await Promise.all([
      Promise.all(borrowAssets.map(a => this.publicClient.readContract({
        address: CONTRACTS.LendingPool, abi: LENDING_POOL_ABI,
        functionName: 'getUserDebt', args: [borrower, a],
      }))),
      Promise.all(collateralAssets.map(a => this.publicClient.readContract({
        address: CONTRACTS.LendingPool, abi: LENDING_POOL_ABI,
        functionName: 'getUserSupply', args: [borrower, a],
      }))),
    ])

    const prices = await Promise.all([
      ...borrowAssets.map(a => this.priceOf(a)),
      ...collateralAssets.map(a => this.priceOf(a)),
    ]) as bigint[]

    let debtAsset: Address | null = null
    let debtAmount = 0n
    let bestDebtUsd = -1
    borrowAssets.forEach((asset, i) => {
      const usd = this.usdOf(debtAmounts[i], asset, prices[i])
      if (debtAmounts[i] > 0n && usd > bestDebtUsd) {
        bestDebtUsd = usd
        debtAsset = asset
        debtAmount = debtAmounts[i]
      }
    })

    let collateralAsset: Address | null = null
    let bestCollUsd = -1
    collateralAssets.forEach((asset, i) => {
      const usd = this.usdOf(supplyAmounts[i], asset, prices[borrowAssets.length + i])
      if (supplyAmounts[i] > 0n && usd > bestCollUsd) {
        bestCollUsd = usd
        collateralAsset = asset
      }
    })

    if (!debtAsset || !collateralAsset || debtAmount === 0n) return null
    return { borrower, debtAsset, collateralAsset, debtAmount, debtUsd: bestDebtUsd }
  }

  private async priceOf(asset: Address): Promise<bigint> {
    try {
      return await this.publicClient.readContract({
        address: CONTRACTS.PythOracle,
        abi: ORACLE_ABI,
        functionName: 'getPrice',
        args: [asset],
      }) as unknown as bigint
    } catch {
      return 0n
    }
  }

  private usdOf(amount: bigint, asset: Address, price18: bigint): number {
    const token = Object.values(TOKENS).find(t => t.address === asset)
    const decimals = token?.decimals ?? 6
    const usdc = Number(amount) / 10 ** decimals
    return usdc * Number(price18) / 1e18
  }

  private async liquidatePosition(position: { borrower: Address; debtAsset: Address; collateralAsset: Address; debtAmount: bigint }) {
    const { borrower, debtAsset, collateralAsset, debtAmount } = position
    const account = this.walletAccountAddress as `0x${string}`

    const [balance, allowance] = await Promise.all([
      this.publicClient.readContract({
        address: debtAsset, abi: ERC20_ABI, functionName: 'balanceOf', args: [account],
      }) as unknown as bigint,
      this.publicClient.readContract({
        address: debtAsset, abi: ERC20_ABI, functionName: 'allowance', args: [account, CONTRACTS.LendingPool],
      }) as unknown as bigint,
    ])

    const repayAmount = balance < debtAmount ? balance : debtAmount
    if (repayAmount === 0n) {
      this.emit({ type: 'warning', message: `${shortAddr(borrower)}: no ${debtAsset} balance to repay — skipping` })
      return
    }

    if (this.settings.dryRun) {
      this.emit({ type: 'warning', message: `Dry-run: would liquidate ${shortAddr(borrower)}, repay ${formatToken(repayAmount, 6)}` })
      return
    }

    if (!this.sendTx) return

    if (allowance < repayAmount) {
      const gasParams = await this.gasParams()
      const { request } = await this.publicClient.simulateContract({
        address: debtAsset,
        abi: ERC20_ABI,
        functionName: 'approve',
        args: [CONTRACTS.LendingPool, repayAmount] as [Address, bigint],
        account: this.walletAccountAddress as `0x${string}`,
        ...gasParams,
      })
      const { hash, receipt, costUsdc } = await this.sendTx({
        address: request.address as Address,
        abi: request.abi as unknown as Abi,
        functionName: request.functionName as string,
        args: request.args as unknown as unknown[],
        value: request.value,
      })
      this.emit({ type: 'tx', hash, action: 'approve', costUsdc: null, status: 'sent' })
      this.gasSpentUsdc += costUsdc
      this.txCount++
      this.emit({ type: 'tx', hash, action: 'approve', costUsdc, status: receipt.status === 1n ? 'confirmed' : 'failed' })
    }

    const gasParams = await this.gasParams()
    const { request } = await this.publicClient.simulateContract({
      address: CONTRACTS.LendingPool,
      abi: LENDING_POOL_ABI,
      functionName: 'liquidate',
      args: [borrower, debtAsset, collateralAsset, repayAmount] as [Address, Address, Address, bigint],
      account: this.walletAccountAddress as `0x${string}`,
      ...gasParams,
    })
    const { hash, receipt, costUsdc } = await this.sendTx({
      address: request.address as Address,
      abi: request.abi as unknown as Abi,
      functionName: request.functionName as string,
        args: request.args as unknown as unknown[],
      value: request.value,
    })
    this.emit({ type: 'tx', hash, action: 'liquidate', costUsdc: null, status: 'sent' })
    this.gasSpentUsdc += costUsdc
    this.txCount++
    this.emit({ type: 'tx', hash, action: 'liquidate', costUsdc, status: receipt.status === 1n ? 'confirmed' : 'failed' })
  }

  private async gasParams() {
    const block = await this.publicClient.getBlock()
    const baseFee = block.baseFeePerGas ?? 0n
    const floor = BigInt(BASE_FEE_FLOOR_GWEI) * 10n ** 9n
    const maxFee = baseFee > floor ? baseFee + baseFee / 10n : floor * 2n
    return { maxFeePerGas: maxFee, maxPriorityFeePerGas: 0n }
  }

  // ── Active feed assets (tokens with a Pyth feed on this network) ────────

  private activeFeedAssets(): Address[] {
    const known: { [feedId: number]: Address } = {
      1: TOKENS.cirBTC?.address ?? '0x0',
      2: TOKENS.WETH?.address ?? '0x0',
      327: TOKENS.EURC?.address ?? '0x0',
    }
    return Object.values(known).filter(a => a !== '0x0')
  }
}
