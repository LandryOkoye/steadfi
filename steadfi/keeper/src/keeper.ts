/**
 * SteadFi Liquidation Keeper
 * ─────────────────────────────────────────────────────────────────────────────
 * Pushes Pyth Pro price updates and liquidates unhealthy positions.
 *
 * Supports Arc Mainnet and Arc Testnet via NETWORK env:
 *
 *   NETWORK=mainnet   — Arc Mainnet (chain 5042, default). BTC/USD, ETH/USD, EUR/USD feeds.
 *   NETWORK=testnet   — Arc Testnet (chain 5042002). BTC/USD, ETH/USD, EUR/USD feeds.
 *
 * Usage:
 *   bun run src/keeper.ts              # continuous, mainnet
 *   RUN_ONCE=1 NETWORK=mainnet bun run src/keeper.ts   # push one price update
 *   NETWORK=testnet bun run src/keeper.ts              # continuous, testnet
 *
 * Required env:
 *   KEEPER_PRIVATE_KEY  — funded keeper wallet (no 0x prefix).
 *   PYTH_API_KEY        — Pyth Pro (Lazer) API key.
 *
 * Optional env:
 *   NETWORK             — "mainnet" (default) | "testnet"
 *   LENDING_POOL_ADDR   — overrides the default for the selected network
 *   ORACLE_ADDR         — overrides the default for the selected network
 *   RPC_URL             — overrides the default for the selected network
 *   POLL_INTERVAL_MS    — default 60000
 *   RUN_ONCE            — "1" to push one price update and exit
 *   MIN_HF_TRIGGER      — liquidate below this HF (default 1.0)
 *   START_BLOCK         — first block to scan for Borrow events
 */

import { createPublicClient, createWalletClient, http, parseAbi, parseAbiItem, maxUint256 } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { arc, arcTestnet } from 'viem/chains'

// ── Network selection ─────────────────────────────────────────────────────────

const NETWORK = (process.env.NETWORK ?? 'mainnet').toLowerCase()
if (NETWORK !== 'mainnet' && NETWORK !== 'testnet') {
  console.error(`[keeper] Invalid NETWORK="${NETWORK}". Use "mainnet" or "testnet".`)
  process.exit(1)
}
const IS_MAINNET = NETWORK === 'mainnet'

/**
 * Per-network config. Both mainnet and testnet run all four markets:
 * USDC + EURC (lend/borrow) and cirBTC + WETH (collateral).
 * Feeds: BTC/USD=1, ETH/USD=2, EUR/USD=327 on both networks.
 */
const NETWORK_CONFIG = IS_MAINNET
  ? {
      chain:          arc,
      defaultRpc:     'https://rpc.mainnet.arc.io',
      defaultPool:    '0xc85f7C6DCFC9ca544c72EBAb93881A34485B1652' as `0x${string}`,
      defaultOracle:  '0x4B526e6f7E1d82959E0f95F14B2e7f7893C67A6B' as `0x${string}`,
      usdc:           '0x3600000000000000000000000000000000000000' as `0x${string}`,
      cirbtc:         '0x171A4217b86A807A64eB94757Db6849fb4bDbAA0' as `0x${string}`,
      weth:           '0x128cC466B61f542da60c70e3aA11c10e19B84EDB' as `0x${string}`,
      eurc:           '0xbEf5f6d51CB62b58e6A8f77868681825C6fe21c1' as `0x${string}`,
      feedIds:        [1, 2, 327] as const,
    }
  : {
      chain:          arcTestnet,
      defaultRpc:     'https://rpc.testnet.arc.io',
      defaultPool:    '0x57E1066DA815DD1c1DD1adA82859729ce7f82989' as `0x${string}`,
      defaultOracle:  '0x42c69A87e59Cf8Dd845df2197d569745E7bb5730' as `0x${string}`,
      usdc:           '0x3600000000000000000000000000000000000000' as `0x${string}`,
      cirbtc:         '0xf0C4a4CE82A5746AbAAd9425360Ab04fbBA432BF' as `0x${string}`,
      weth:           '0x2c4047028a72803939b6fb674D01bC059B5C4961' as `0x${string}`,
      eurc:           '0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a' as `0x${string}`,
      feedIds:        [1, 2, 327] as const,
    }

// ── Config ────────────────────────────────────────────────────────────────────

const RPC_URL      = process.env.RPC_URL         ?? NETWORK_CONFIG.defaultRpc
const LENDING_POOL = (process.env.LENDING_POOL_ADDR ?? NETWORK_CONFIG.defaultPool) as `0x${string}`
const ORACLE       = (process.env.ORACLE_ADDR       ?? NETWORK_CONFIG.defaultOracle) as `0x${string}`

const RAW_KEEPER_KEY = process.env.KEEPER_PRIVATE_KEY
const KEEPER_KEY = (RAW_KEEPER_KEY
  ? (RAW_KEEPER_KEY.startsWith('0x') ? RAW_KEEPER_KEY : `0x${RAW_KEEPER_KEY}`)
  : undefined) as `0x${string}` | undefined

const PYTH_LAZER    = '0xACeA761c27A909d4D3895128EBe6370FDE2dF481' as `0x${string}`
const PYTH_API_KEY  = process.env.PYTH_API_KEY
const PYTH_PRO_URL  = process.env.PYTH_PRO_URL ?? 'https://pyth-lazer.dourolabs.app'
const FEED_IDS      = NETWORK_CONFIG.feedIds as readonly number[]

const POLL_INTERVAL_MS = Number(process.env.POLL_INTERVAL_MS ?? 60_000)
const RUN_ONCE         = process.env.RUN_ONCE === '1'
const MIN_HF_TRIGGER   = Number(process.env.MIN_HF_TRIGGER ?? 1.0)

// Borrow assets: markets with borrowEnabled=true
const BORROW_ASSETS = [NETWORK_CONFIG.usdc, ...(NETWORK_CONFIG.eurc ? [NETWORK_CONFIG.eurc] : [])]
  .filter(Boolean) as `0x${string}`[]

// Collateral assets: markets with collateralEnabled=true
const COLLATERAL_ASSETS = [NETWORK_CONFIG.cirbtc, ...(NETWORK_CONFIG.weth ? [NETWORK_CONFIG.weth] : [])]
  .filter(Boolean) as `0x${string}`[]

const DECIMALS: Record<string, number> = {
  [NETWORK_CONFIG.usdc.toLowerCase()]: 6,
  [NETWORK_CONFIG.cirbtc.toLowerCase()]: 8,
  ...(NETWORK_CONFIG.weth ? { [NETWORK_CONFIG.weth.toLowerCase()]: 18 } : {}),
  ...(NETWORK_CONFIG.eurc ? { [NETWORK_CONFIG.eurc.toLowerCase()]: 6 } : {}),
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

const ERC20_ABI = parseAbi([
  'function balanceOf(address) view returns (uint256)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function approve(address spender, uint256 amount) returns (bool)',
])

// ── Clients ───────────────────────────────────────────────────────────────────

function buildClients() {
  if (!KEEPER_KEY) throw new Error('KEEPER_PRIVATE_KEY not set')
  const account   = privateKeyToAccount(KEEPER_KEY)
  const transport = http(RPC_URL)
  const publicClient = createPublicClient({ chain: NETWORK_CONFIG.chain, transport })
  const walletClient = createWalletClient({ account, chain: NETWORK_CONFIG.chain, transport })
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

// ── Pyth Pro price refresh ────────────────────────────────────────────────────

let priceWarned = false

async function refreshPythPrices(
  publicClient: PublicClient,
  walletClient: WalletClient,
): Promise<void> {
  if (!PYTH_API_KEY) {
    if (!priceWarned) {
      console.warn('[keeper] PYTH_API_KEY not set — skipping price refresh (feeds may be stale)')
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

// ── Best liquidation pair for a borrower ─────────────────────────────────────

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

  console.log(`[keeper] Liquidating ${borrower}: repay ${repayAmount} of ${debtAsset}, seize ${collateralAsset}`)

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
  console.log(`[keeper] SteadFi keeper starting (NETWORK=${NETWORK})`)
  console.log(`[keeper] Pool:     ${LENDING_POOL}`)
  console.log(`[keeper] Oracle:   ${ORACLE}`)
  console.log(`[keeper] RPC:      ${RPC_URL}`)
  console.log(`[keeper] Feeds:    [${FEED_IDS.join(', ')}]`)
  console.log(`[keeper] Trigger:  HF < ${MIN_HF_TRIGGER}`)

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

  await runCycle().catch(err => console.error('[keeper] first cycle error:', err))
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
