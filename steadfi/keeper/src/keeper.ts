/**
 * SteadFi Liquidation Keeper
 * ─────────────────────────────────────────────────────────────────────────────
 * Monitors borrower health and liquidates unhealthy positions on Arc Testnet.
 *
 * All assets, prices, debt and collateral balances are read from chain. The
 * keeper picks the borrower's largest debt market and largest collateral market
 * using the on-chain Pyth oracle, then repays the full debt (the pool caps it at
 * the market close factor).
 *
 * Usage:
 *   bun run src/keeper.ts
 *
 * Required env:
 *   KEEPER_PRIVATE_KEY  — funded keeper wallet private key
 * Optional env:
 *   LENDING_POOL_ADDR   — defaults to the Phase 1 testnet deployment
 *   ORACLE_ADDR         — defaults to the Phase 1 PythOracleAdapter
 *   RPC_URL             — defaults to https://rpc.testnet.arc.io
 *   START_BLOCK         — first block to scan for Borrow events (default: head - 100k)
 *   POLL_INTERVAL_MS    — default 15000
 */

import { createPublicClient, createWalletClient, http, parseAbi, parseAbiItem, maxUint256 } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { arcTestnet } from 'viem/chains'

// ── Config ────────────────────────────────────────────────────────────────────
const RPC_URL = process.env.RPC_URL ?? 'https://rpc.testnet.arc.io'
const RAW_KEEPER_KEY = process.env.KEEPER_PRIVATE_KEY
const KEEPER_KEY = (RAW_KEEPER_KEY
  ? (RAW_KEEPER_KEY.startsWith('0x') ? RAW_KEEPER_KEY : `0x${RAW_KEEPER_KEY}`)
  : undefined) as `0x${string}` | undefined
const LENDING_POOL = (process.env.LENDING_POOL_ADDR ?? '0x8016C259E48514ECadA4fd1082108cd55031680e') as `0x${string}`
const ORACLE = (process.env.ORACLE_ADDR ?? '0xb0e392899a9446F22Fc6bbe49c651c013fA35174') as `0x${string}`
const PYTH_LAZER = '0xACeA761c27A909d4D3895128EBe6370FDE2dF481' as `0x${string}`
const PYTH_API_KEY = process.env.PYTH_API_KEY
const PYTH_PRO_URL = process.env.PYTH_PRO_URL ?? 'https://pyth-lazer.dourolabs.app'

const POLL_INTERVAL_MS = Number(process.env.POLL_INTERVAL_MS ?? 15_000)
const RUN_ONCE = process.env.RUN_ONCE === '1'
const MIN_HF_TRIGGER = Number(process.env.MIN_HF_TRIGGER ?? 1.0)

const USDC = '0x3600000000000000000000000000000000000000' as `0x${string}`
const EURC = '0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a' as `0x${string}`
const CIRBTC = '0xf0C4a4CE82A5746AbAAd9425360Ab04fbBA432BF' as `0x${string}`
const WETH = '0x2c4047028a72803939b6fb674D01bC059B5C4961' as `0x${string}`

const BORROW_ASSETS = [USDC, EURC] as const
const COLLATERAL_ASSETS = [CIRBTC, WETH] as const
const DECIMALS: Record<string, number> = {
  [USDC.toLowerCase()]: 6,
  [EURC.toLowerCase()]: 6,
  [CIRBTC.toLowerCase()]: 8,
  [WETH.toLowerCase()]: 18,
}

// ── ABIs ──────────────────────────────────────────────────────────────────────
const POOL_ABI = parseAbi([
  'function getHealthFactor(address user) view returns (uint256 hf, bool isHealthy)',
  'function getUserDebt(address user, address asset) view returns (uint256)',
  'function getUserSupply(address user, address asset) view returns (uint256)',
  'function liquidate(address borrower, address debtAsset, address collateralAsset, uint256 debtAmount)',
])

const BORROW_EVENT = parseAbiItem(
  'event Borrow(address indexed user, address indexed asset, uint256 amount, uint256 debtShares)'
)

const ORACLE_ABI = parseAbi([
  'function getPrice(address asset) view returns (uint256)',
  'function updatePrices(bytes update) payable returns (uint256)',
])

const LAZER_ABI = parseAbi([
  'function verification_fee() view returns (uint256)',
])

// Pyth Pro numeric feed IDs: BTC/USD, ETH/USD, EUR/USD.
const FEED_IDS = [1, 2, 327] as const

const ERC20_ABI = parseAbi([
  'function balanceOf(address) view returns (uint256)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function approve(address spender, uint256 amount) returns (bool)',
])

// ── Clients ───────────────────────────────────────────────────────────────────
function buildClients() {
  if (!KEEPER_KEY) throw new Error('KEEPER_PRIVATE_KEY not set')
  const account = privateKeyToAccount(KEEPER_KEY)
  const transport = http(RPC_URL)
  const publicClient = createPublicClient({ chain: arcTestnet, transport })
  const walletClient = createWalletClient({ account, chain: arcTestnet, transport })
  return { account, publicClient, walletClient }
}

type PublicClient = ReturnType<typeof buildClients>['publicClient']
type WalletClient = ReturnType<typeof buildClients>['walletClient']

// ── Reads ─────────────────────────────────────────────────────────────────────
async function getHF(publicClient: PublicClient, borrower: `0x${string}`): Promise<number> {
  try {
    const [hfRay] = (await publicClient.readContract({
      address: LENDING_POOL,
      abi: POOL_ABI,
      functionName: 'getHealthFactor',
      args: [borrower],
    })) as readonly [bigint, boolean]
    return Number(hfRay) / 1e27
  } catch {
    return Number.POSITIVE_INFINITY
  }
}

async function priceOf(publicClient: PublicClient, asset: `0x${string}`): Promise<bigint> {
  try {
    return await publicClient.readContract({
      address: ORACLE,
      abi: ORACLE_ABI,
      functionName: 'getPrice',
      args: [asset],
    })
  } catch {
    return 0n
  }
}

function usdOf(amount: bigint, asset: `0x${string}`, price18: bigint): number {
  if (price18 === 0n) return 0
  return Number((amount * price18) / (10n ** BigInt(DECIMALS[asset.toLowerCase()] ?? 18))) / 1e18
}

async function collectBorrowers(publicClient: PublicClient, fromBlock: bigint): Promise<Set<`0x${string}`>> {
  const borrowers = new Set<`0x${string}`>()
  const CHUNK = 2_000n
  try {
    const latest = await publicClient.getBlockNumber()
    for (let start = fromBlock; start <= latest; start += CHUNK) {
      const end = start + CHUNK - 1n > latest ? latest : start + CHUNK - 1n
      const logs = await publicClient.getLogs({
        address: LENDING_POOL,
        event: BORROW_EVENT,
        fromBlock: start,
        toBlock: end,
      })
      for (const log of logs) {
        if (log.args.user) borrowers.add(log.args.user)
      }
    }
  } catch (err) {
    console.warn('[keeper] getLogs error:', err)
  }
  return borrowers
}

let priceWarned = false

async function refreshPythPrices(
  publicClient: PublicClient,
  walletClient: WalletClient,
): Promise<void> {
  if (!PYTH_API_KEY) {
    if (!priceWarned) {
      console.warn('[keeper] PYTH_API_KEY not set — skipping Pyth Pro price refresh (feeds may be stale)')
      priceWarned = true
    }
    return
  }

  const res = await fetch(`${PYTH_PRO_URL}/v1/latest_price`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${PYTH_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      priceFeedIds: FEED_IDS,
      properties: ['price', 'exponent', 'confidence', 'feedUpdateTimestamp'],
      formats: ['evm'],
      jsonBinaryEncoding: 'hex',
      channel: 'real_time',
    }),
  })
  if (!res.ok) {
    console.warn(`[keeper] Pyth Pro price fetch failed: ${res.status}`)
    return
  }

  const body = await res.json() as { evm?: { data?: string } }
  let update = body.evm?.data
  if (!update) {
    console.warn('[keeper] Pyth Pro response had no evm.data')
    return
  }
  if (!update.startsWith('0x')) update = `0x${update}`

  try {
    const fee = await publicClient.readContract({
      address: PYTH_LAZER,
      abi: LAZER_ABI,
      functionName: 'verification_fee',
    })
    const { request } = await publicClient.simulateContract({
      address: ORACLE,
      abi: ORACLE_ABI,
      functionName: 'updatePrices',
      args: [update as `0x${string}`],
      value: fee,
      account: walletClient.account,
    })
    const hash = await walletClient.writeContract(request)
    await publicClient.waitForTransactionReceipt({ hash, confirmations: 1 })
    console.log(`[keeper] Updated Pyth Pro prices (${hash})`)
  } catch (err) {
    console.warn('[keeper] Pyth Pro update failed:', String(err))
  }
}

async function bestPosition(publicClient: PublicClient, borrower: `0x${string}`) {
  const [debtAmounts, supplyAmounts, borrowPrices, collateralPrices] = await Promise.all([
    Promise.all(BORROW_ASSETS.map(a => publicClient.readContract({
      address: LENDING_POOL, abi: POOL_ABI, functionName: 'getUserDebt', args: [borrower, a],
    }))),
    Promise.all(COLLATERAL_ASSETS.map(a => publicClient.readContract({
      address: LENDING_POOL, abi: POOL_ABI, functionName: 'getUserSupply', args: [borrower, a],
    }))),
    Promise.all(BORROW_ASSETS.map(a => priceOf(publicClient, a))),
    Promise.all(COLLATERAL_ASSETS.map(a => priceOf(publicClient, a))),
  ])

  let debtAsset: `0x${string}` | null = null
  let debtAmount = 0n
  let bestDebtUsd = -1
  BORROW_ASSETS.forEach((asset, i) => {
    const usd = usdOf(debtAmounts[i], asset, borrowPrices[i])
    if (debtAmounts[i] > 0n && usd > bestDebtUsd) {
      bestDebtUsd = usd
      debtAsset = asset
      debtAmount = debtAmounts[i]
    }
  })

  let collateralAsset: `0x${string}` | null = null
  let bestCollUsd = -1
  COLLATERAL_ASSETS.forEach((asset, i) => {
    const usd = usdOf(supplyAmounts[i], asset, collateralPrices[i])
    if (supplyAmounts[i] > 0n && usd > bestCollUsd) {
      bestCollUsd = usd
      collateralAsset = asset
    }
  })

  if (!debtAsset || !collateralAsset || debtAmount === 0n) return null
  return { borrower, debtAsset, collateralAsset, debtAmount, debtUsd: bestDebtUsd }
}

// ── Liquidation ───────────────────────────────────────────────────────────────
async function liquidate(
  publicClient: PublicClient,
  walletClient: WalletClient,
  position: NonNullable<Awaited<ReturnType<typeof bestPosition>>>,
): Promise<void> {
  const { borrower, debtAsset, collateralAsset, debtAmount } = position
  const account = walletClient.account

  const [balance, allowance] = await Promise.all([
    publicClient.readContract({ address: debtAsset, abi: ERC20_ABI, functionName: 'balanceOf', args: [account.address] }),
    publicClient.readContract({ address: debtAsset, abi: ERC20_ABI, functionName: 'allowance', args: [account.address, LENDING_POOL] }),
  ])

  const repayAmount = balance < debtAmount ? balance : debtAmount
  if (repayAmount === 0n) {
    console.warn(`[keeper] ${borrower}: no ${debtAsset} balance to repay — skipping`)
    return
  }

  if (allowance < repayAmount) {
    const approveHash = await walletClient.writeContract({
      address: debtAsset,
      abi: ERC20_ABI,
      functionName: 'approve',
      args: [LENDING_POOL, maxUint256],
    })
    await publicClient.waitForTransactionReceipt({ hash: approveHash, confirmations: 1 })
  }

  console.log(
    `[keeper] Liquidating ${borrower}: repay ${repayAmount} of ${debtAsset}, seize ${collateralAsset}`
  )

  try {
    const { request } = await publicClient.simulateContract({
      address: LENDING_POOL,
      abi: POOL_ABI,
      functionName: 'liquidate',
      args: [borrower, debtAsset, collateralAsset, repayAmount],
      account,
    })
    const hash = await walletClient.writeContract(request)
    const receipt = await publicClient.waitForTransactionReceipt({ hash, confirmations: 1 })
    console.log(`[keeper] Liquidation confirmed: ${receipt.transactionHash} (block ${receipt.blockNumber})`)
  } catch (err: unknown) {
    const msg = String(err)
    if (msg.includes('LP: position is healthy')) return
    if (msg.includes('LP: self-liquidation')) return
    console.error(`[keeper] Liquidation failed for ${borrower}:`, msg)
  }
}

// ── Main loop ─────────────────────────────────────────────────────────────────
async function main() {
  console.log('[keeper] SteadFi liquidation keeper starting...')
  console.log(`[keeper] Pool:   ${LENDING_POOL}`)
  console.log(`[keeper] Oracle: ${ORACLE}`)
  console.log(`[keeper] RPC:    ${RPC_URL}`)
  console.log(`[keeper] Trigger HF < ${MIN_HF_TRIGGER}`)

  const { publicClient, walletClient } = buildClients()

  const head = await publicClient.getBlockNumber()
  const envStart = process.env.START_BLOCK ? BigInt(process.env.START_BLOCK) : undefined
  let fromBlock = envStart ?? (head > 100_000n ? head - 100_000n : 0n)
  console.log(`[keeper] Scanning from block ${fromBlock} (head: ${head})`)

  const knownBorrowers = await collectBorrowers(publicClient, fromBlock)
  console.log(`[keeper] Found ${knownBorrowers.size} known borrowers`)

  async function runCycle() {
    await refreshPythPrices(publicClient, walletClient)

    for (const borrower of Array.from(knownBorrowers)) {
      const hf = await getHF(publicClient, borrower)
      if (hf >= MIN_HF_TRIGGER) continue

      console.log(`[keeper] Unhealthy position: ${borrower} HF=${hf.toFixed(4)}`)
      const position = await bestPosition(publicClient, borrower)
      if (!position) {
        console.warn(`[keeper] ${borrower}: no debt/collateral pair found — skipping`)
        continue
      }
      await liquidate(publicClient, walletClient, position)
    }

    const latest = await publicClient.getBlockNumber()
    const newBorrowers = await collectBorrowers(publicClient, latest > 500n ? latest - 500n : 0n)
    for (const b of newBorrowers) knownBorrowers.add(b)
    fromBlock = latest
  }

  await runCycle()
  if (RUN_ONCE) {
    console.log('[keeper] RUN_ONCE=1 — single cycle complete, exiting')
    return
  }
  setInterval(() => {
    runCycle().catch(err => console.error('[keeper] cycle error:', err))
  }, POLL_INTERVAL_MS)
  console.log(`[keeper] Polling every ${POLL_INTERVAL_MS / 1000}s`)
}

main().catch(err => {
  console.error('[keeper] Fatal error:', err)
  process.exit(1)
})
