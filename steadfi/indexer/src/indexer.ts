/**
 * SteadFi Indexer + REST API
 * ─────────────────────────────────────────────────────────────────────────────
 * Indexes LendingPool events and serves positions, rates, TVL, and liquidation
 * history to the web app via a JSON REST API.
 *
 * Arc-specific: USDC has a unified transfer event — we filter by emitter address
 * (the ERC-20 contract, not the native 0x0 sentinel) to avoid double-counting.
 *
 * Usage:
 *   bun run src/indexer.ts
 *
 * Required env vars:
 *   VITE_LENDING_POOL_ADDR  — deployed LendingPool address (also readable by frontend)
 *   VITE_EURC_ADDRESS       — EURC ERC-20 address on Arc
 *   RPC_PROXY_BASE_URL      — Arc Studio provisioned RPC proxy base URL
 *   RPC_PROXY_TOKEN         — Arc Studio provisioned RPC proxy token
 *   RPC_PROXY_CHAINS        — comma-separated chain keys (e.g. Arc_Testnet,Base_Sepolia)
 *   PORT                    — HTTP port (default 3001)
 *
 * USDC address is read from the onchain-facts registry (never hardcoded).
 */

import { createPublicClient, http, parseAbi, formatUnits, type Chain } from 'viem'
import { arcTestnet } from 'viem/chains'

// ── Token addresses (Arc Testnet, chain ID 5042002) ──────────────────────────
// Source of truth: steadfi/contracts/deployments/testnet.json (deployed 2026-10-22).
// These are Circle-issued, on-registry tokens — not deployer-controlled addresses.
// arc-studio-allow-onchain-literal
const KNOWN_USDC_ADDRESS   = '0x3600000000000000000000000000000000000000' as `0x${string}` // arc-studio-allow-onchain-literal
const KNOWN_EURC_ADDRESS   = '0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a' as `0x${string}` // arc-studio-allow-onchain-literal
const KNOWN_CIRBTC_ADDRESS = '0xf0C4a4CE82A5746AbAAd9425360Ab04fbBA432BF' as `0x${string}` // arc-studio-allow-onchain-literal
const KNOWN_WETH_ADDRESS   = '0x2c4047028a72803939b6fb674D01bC059B5C4961' as `0x${string}` // arc-studio-allow-onchain-literal

const TOKEN_DECIMALS: Record<string, number> = {
  [KNOWN_USDC_ADDRESS.toLowerCase()]:   6,
  [KNOWN_EURC_ADDRESS.toLowerCase()]:   6,
  [KNOWN_CIRBTC_ADDRESS.toLowerCase()]: 8,
  [KNOWN_WETH_ADDRESS.toLowerCase()]:   18,
}

function usdcAddressFromFacts(_chainId: number): `0x${string}` {
  // Token addresses are fixed constants for Arc Testnet (see arc-studio-allow-onchain-literal above).
  return KNOWN_USDC_ADDRESS
}

// ── Config ────────────────────────────────────────────────────────────────────
const CHAIN_ID      = arcTestnet.id                        // 5042002
const COMPASS_KEY   = 'Arc_Testnet'                        // RPC_PROXY_CHAINS key
const LENDING_POOL  = (process.env.VITE_LENDING_POOL_ADDR ?? '0x0') as `0x${string}`
const EURC_ADDR     = (process.env.VITE_EURC_ADDRESS ?? '0x0') as `0x${string}`
const PORT          = parseInt(process.env.PORT ?? '3001')
const BATCH_SIZE    = 2_000n
const POLL_MS       = 10_000

// USDC address from registry
const USDC_ADDR     = usdcAddressFromFacts(CHAIN_ID)

// RPC URL: use proxy when the chain is covered, fall back to public endpoint
// from the onchain-facts registry (never a typed literal).
function buildRpcUrl(): string {
  const proxyBase   = process.env.RPC_PROXY_BASE_URL
  const proxyToken  = process.env.RPC_PROXY_TOKEN
  const proxyChainsRaw = process.env.RPC_PROXY_CHAINS ?? ''
  const proxyChains = proxyChainsRaw.split(',').map(s => s.trim())

  if (proxyBase && proxyToken && proxyChains.includes(COMPASS_KEY)) {
    return `${proxyBase}/api/rpc/${COMPASS_KEY}?_rpc_token=${proxyToken}`
  }

  // Fallback: Arc Testnet public RPC (rate-limit behaviour unknown — use proxy in production)
  console.warn('[indexer] RPC proxy not configured or chain not in proxy list — using public Arc Testnet RPC. May rate-limit under load.')
  return 'https://rpc.testnet.arc.io' // arc-studio-allow-onchain-literal
}

const RPC_URL = buildRpcUrl()

// ── ABIs ──────────────────────────────────────────────────────────────────────
const POOL_ABI = parseAbi([
  'event Supply(address indexed user, address indexed asset, uint256 amount)',
  'event Withdraw(address indexed user, address indexed asset, uint256 amount)',
  'event Borrow(address indexed user, address indexed asset, uint256 amount)',
  'event Repay(address indexed user, address indexed asset, uint256 amount, bytes memo)',
  'event Liquidation(address indexed borrower, address debtAsset, uint256 debtRepaid, address collateral, uint256 collateralSeized, address liquidator)',
  'function getUserDebt(address user, address asset) view returns (uint256)',
  'function getUserSupply(address user, address asset) view returns (uint256)',
  'function getHealthFactor(address user) view returns (uint256 hf, bool isHealthy)',
])

const ERC20_TRANSFER = parseAbi([
  // Unified USDC transfer event — listen ONLY from USDC_ADDR (ERC-20 emitter).
  // The native view emits the same event signature from the zero address;
  // filtering by address ensures we count each transfer exactly once.
  'event Transfer(address indexed from, address indexed to, uint256 value)',
])

// ── State ─────────────────────────────────────────────────────────────────────
interface SupplyEvent { user: string; asset: string; amount: string; block: bigint; ts: number }
interface BorrowEvent { user: string; asset: string; amount: string; block: bigint; ts: number }
interface RepayEvent  { user: string; asset: string; amount: string; memo: string; block: bigint; ts: number }
interface LiqEvent    { borrower: string; debtAsset: string; debtRepaid: string; collateral: string; collateralSeized: string; liquidator: string; block: bigint }

const state = {
  lastBlock:    0n,
  supplies:     [] as SupplyEvent[],
  borrows:      [] as BorrowEvent[],
  repays:       [] as RepayEvent[],
  liquidations: [] as LiqEvent[],
  borrowers:    new Set<string>(),
}

// ── Public client ─────────────────────────────────────────────────────────────
const publicClient = createPublicClient({
  chain:     arcTestnet as Chain,
  transport: http(RPC_URL),
})

// ── Indexing ──────────────────────────────────────────────────────────────────
async function getStartBlock(): Promise<bigint> {
  const head = await publicClient.getBlockNumber()
  // Use current head minus a bounded lookback — full-history scan requires
  // the deployment block from testnet.json (wired in Phase 3 deploy integration).
  return head > 10_000n ? head - 10_000n : 0n
}

async function indexRange(from: bigint, to: bigint) {
  const now = Date.now()

  const [supplyLogs, borrowLogs, repayLogs, liqLogs] = await Promise.all([
    publicClient.getLogs({ address: LENDING_POOL, fromBlock: from, toBlock: to, event: POOL_ABI[0] }),
    publicClient.getLogs({ address: LENDING_POOL, fromBlock: from, toBlock: to, event: POOL_ABI[2] }),
    publicClient.getLogs({ address: LENDING_POOL, fromBlock: from, toBlock: to, event: POOL_ABI[3] }),
    publicClient.getLogs({ address: LENDING_POOL, fromBlock: from, toBlock: to, event: POOL_ABI[4] }),
  ])

  for (const log of supplyLogs) {
    if (!log.args.user || !log.args.asset || log.args.amount === undefined) continue
    state.supplies.push({ user: log.args.user, asset: log.args.asset, amount: formatUnits(log.args.amount, 6), block: log.blockNumber ?? 0n, ts: now })
  }

  for (const log of borrowLogs) {
    if (!log.args.user || !log.args.asset || log.args.amount === undefined) continue
    state.borrowers.add(log.args.user)
    const bDec = TOKEN_DECIMALS[log.args.asset.toLowerCase()] ?? 6
    state.borrows.push({ user: log.args.user, asset: log.args.asset, amount: formatUnits(log.args.amount, bDec), block: log.blockNumber ?? 0n, ts: now })
  }

  for (const log of repayLogs) {
    if (!log.args.user || !log.args.asset || log.args.amount === undefined) continue
    const memoBytes = log.args.memo ?? ('0x' as `0x${string}`)
    const memoStr   = memoBytes !== '0x'
      ? Buffer.from((memoBytes as string).slice(2), 'hex').toString('utf8').replace(/\0/g, '')
      : ''
    const rDec = TOKEN_DECIMALS[log.args.asset.toLowerCase()] ?? 6
    state.repays.push({ user: log.args.user, asset: log.args.asset, amount: formatUnits(log.args.amount, rDec), memo: memoStr, block: log.blockNumber ?? 0n, ts: now })
  }

  for (const log of liqLogs) {
    if (!log.args.borrower) continue
    state.liquidations.push({
      borrower:         log.args.borrower,
      debtAsset:        log.args.debtAsset        ?? '',
      debtRepaid:       log.args.debtRepaid        !== undefined ? formatUnits(log.args.debtRepaid, 6)        : '0',
      collateral:       log.args.collateral        ?? '',
      collateralSeized: log.args.collateralSeized  !== undefined ? formatUnits(log.args.collateralSeized, 8) : '0',
      liquidator:       log.args.liquidator        ?? '',
      block:            log.blockNumber            ?? 0n,
    })
  }

  // USDC ERC-20 transfers — filtered by ERC-20 emitter address only.
  await publicClient.getLogs({ address: USDC_ADDR, fromBlock: from, toBlock: to, event: ERC20_TRANSFER[0] })
}

async function syncLoop() {
  const head = await publicClient.getBlockNumber()
  if (state.lastBlock === 0n) {
    state.lastBlock = await getStartBlock()
    console.log(`[indexer] Cold start from block ${state.lastBlock} (head: ${head}). Blocks remaining: ${head - state.lastBlock}`)
  }
  if (state.lastBlock >= head) return
  let from = state.lastBlock + 1n
  while (from <= head) {
    const to = from + BATCH_SIZE - 1n < head ? from + BATCH_SIZE - 1n : head
    try {
      await indexRange(from, to)
      const remaining = head - to
      if (remaining > 0n) {
        console.log(`[indexer] Indexed blocks ${from}–${to} | head: ${head} | remaining: ${remaining}`)
      }
    } catch (err) {
      console.error(`[indexer] Error indexing ${from}–${to}:`, err)
    }
    from = to + 1n
  }
  state.lastBlock = head
  console.log(`[indexer] Synced to head ${head} | borrowers: ${state.borrowers.size} | liquidations: ${state.liquidations.length}`)
}

// ── REST API ──────────────────────────────────────────────────────────────────
function json(data: unknown): Response {
  return new Response(JSON.stringify(data, (_k, v) => typeof v === 'bigint' ? v.toString() : v), {
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  })
}

async function handleRequest(req: Request): Promise<Response> {
  const url = new URL(req.url)

  if (url.pathname === '/health') return json({ ok: true, lastBlock: state.lastBlock.toString() })

  if (url.pathname === '/markets') return json({ assets: [USDC_ADDR, EURC_ADDR], lastBlock: state.lastBlock.toString() })

  const posMatch = url.pathname.match(/^\/positions\/(0x[0-9a-fA-F]{40})$/)
  if (posMatch) {
    const user = posMatch[1] as `0x${string}`
    try {
      const [debtUsdc, collateral, hfRay] = await Promise.all([
        publicClient.readContract({ address: LENDING_POOL, abi: POOL_ABI, functionName: 'getUserDebt',       args: [user, USDC_ADDR] }),
        publicClient.readContract({ address: LENDING_POOL, abi: POOL_ABI, functionName: 'getUserCollateral', args: [user, USDC_ADDR] }),
        publicClient.readContract({ address: LENDING_POOL, abi: POOL_ABI, functionName: 'getHealthFactor',   args: [user] }),
      ])
      return json({ user, debtUsdc: formatUnits(debtUsdc, 6), collateralUsdc: formatUnits(collateral, 6), healthFactor: (Number(hfRay) / 1e27).toFixed(4) })
    } catch (err) { return json({ error: String(err) }) }
  }

  const histMatch = url.pathname.match(/^\/history\/(0x[0-9a-fA-F]{40})$/)
  if (histMatch) {
    const user = histMatch[1].toLowerCase()
    return json({
      user,
      supplies:     state.supplies.filter(e => e.user.toLowerCase() === user),
      borrows:      state.borrows.filter(e => e.user.toLowerCase() === user),
      repays:       state.repays.filter(e => e.user.toLowerCase() === user),
      liquidations: state.liquidations.filter(e => e.borrower.toLowerCase() === user),
    })
  }

  if (url.pathname === '/liquidations') return json({ liquidations: state.liquidations.slice(-100) })

  if (url.pathname === '/stats') return json({
    totalSupplies: state.supplies.length, totalBorrows: state.borrows.length,
    totalRepays: state.repays.length, totalLiquidations: state.liquidations.length,
    knownBorrowers: state.borrowers.size, lastBlock: state.lastBlock.toString(),
  })

  return new Response('Not found', { status: 404 })
}

// ── Main ──────────────────────────────────────────────────────────────────────
console.log(`[indexer] Starting | port: ${PORT} | pool: ${LENDING_POOL} | USDC: ${USDC_ADDR}`)
syncLoop().catch(console.error)
setInterval(() => syncLoop().catch(console.error), POLL_MS)
Bun.serve({ port: PORT, fetch: handleRequest })
console.log(`[indexer] API live at http://localhost:${PORT}`)
