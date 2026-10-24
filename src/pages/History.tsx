/**
 * History — onchain transaction history via getLogs from LendingPool.
 * Reads Supply, Borrow, Repay, Withdraw events. No mocks.
 */
import { useState, useEffect } from 'react'
import { Card, CardHeader, CardTitle } from '../components/ui/Card'
import { Note, ArrowCircleDown, ArrowCircleUp, ArrowsClockwise, ArrowCircleUpRight, ArrowSquareOut } from '@phosphor-icons/react'
import { useAccount, usePublicClient } from 'wagmi'
import type { Log, AbiEvent } from 'viem'
import { CONTRACTS, TOKENS, TokenSymbol, txUrl, LENDING_POOL_EVENTS_ABI, POOL_DEPLOY_BLOCK, ARC_TESTNET_CHAIN_ID } from '../lib/steadfi'
import { formatUnits, hexToBytes } from 'viem'

/** Arc's RPC rejects eth_getLogs ranges above ~10k blocks — chunk at 5k. */
const LOG_CHUNK = 5_000n
/** Small concurrency so we stay well under the RPC's rate limits. */
const CONCURRENCY = 4

type TxType = 'Supply' | 'Borrow' | 'Repay' | 'Withdraw'

interface TxRecord {
  type: TxType
  asset: TokenSymbol
  amount: string
  hash: string
  blockNumber: bigint
  memo: string | null
}

const ICON_MAP: Record<TxType, JSX.Element> = {
  Supply:   <ArrowCircleDown    size={16} className="text-[var(--color-success)]"           aria-hidden="true" />,
  Borrow:   <ArrowCircleUp      size={16} className="text-[var(--color-warning)]"           aria-hidden="true" />,
  Repay:    <ArrowsClockwise    size={16} className="text-[var(--color-accent)]"            aria-hidden="true" />,
  Withdraw: <ArrowCircleUpRight size={16} className="text-[var(--color-muted-foreground)]" aria-hidden="true" />,
}

const ASSET_BY_ADDRESS: Record<string, TokenSymbol> = Object.fromEntries(
  Object.entries(TOKENS).map(([sym, t]) => [t.address.toLowerCase(), sym as TokenSymbol])
)

const FILTER_OPTIONS: { label: string; value: TxType | 'all' }[] = [
  { label: 'All', value: 'all' },
  { label: 'Supply', value: 'Supply' },
  { label: 'Borrow', value: 'Borrow' },
  { label: 'Repay', value: 'Repay' },
  { label: 'Withdraw', value: 'Withdraw' },
]

export default function History() {
  const { address, isConnected } = useAccount()
  const publicClient = usePublicClient({ chainId: ARC_TESTNET_CHAIN_ID })
  const [filter, setFilter] = useState<TxType | 'all'>('all')
  const [txs, setTxs] = useState<TxRecord[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!address || !publicClient) return

    let cancelled = false

    /** Fetch one event type across the pool's full history in 5k-block chunks. */
    async function fetchEventChunked(event: AbiEvent): Promise<Log[]> {
      const head = await publicClient!.getBlockNumber()
      const chunks: { from: bigint; to: bigint }[] = []
      for (let s = POOL_DEPLOY_BLOCK; s <= head; s += LOG_CHUNK) {
        chunks.push({ from: s, to: s + LOG_CHUNK - 1n > head ? head : s + LOG_CHUNK - 1n })
      }

      const logs: Log[] = []
      for (let i = 0; i < chunks.length; i += CONCURRENCY) {
        if (cancelled) return logs
        const batch = chunks.slice(i, i + CONCURRENCY)
        const results = await Promise.all(
          batch.map(({ from, to }) =>
            publicClient!.getLogs({
              address: CONTRACTS.LendingPool,
              event,
              args: { user: address },
              fromBlock: from,
              toBlock: to,
            })
          )
        )
        for (const r of results) logs.push(...r)
      }
      return logs
    }

    async function fetchLogs() {
      if (!cancelled) setLoading(true)
      try {
        const [supplyLogs, borrowLogs, repayLogs, withdrawLogs] = await Promise.all([
          fetchEventChunked(LENDING_POOL_EVENTS_ABI[0] as unknown as AbiEvent),
          fetchEventChunked(LENDING_POOL_EVENTS_ABI[1] as unknown as AbiEvent),
          fetchEventChunked(LENDING_POOL_EVENTS_ABI[2] as unknown as AbiEvent),
          fetchEventChunked(LENDING_POOL_EVENTS_ABI[3] as unknown as AbiEvent),
        ])

        if (cancelled) return

        type RawLog = {
          args?: {
            user?: string
            asset?: string
            amount?: bigint
            memo?: `0x${string}`
          }
          transactionHash?: string
          blockNumber?: bigint
        }

        function parseLogs(logs: readonly unknown[], type: TxType): TxRecord[] {
          return (logs as RawLog[])
            .filter(log => log.args?.user?.toLowerCase() === address!.toLowerCase())
            .map(log => {
            const assetAddr = log.args?.asset?.toLowerCase() ?? ''
            const assetSym = ASSET_BY_ADDRESS[assetAddr] ?? 'USDC'
            const amount = log.args?.amount ?? 0n
            const decimals = TOKENS[assetSym]?.decimals ?? 6
            const memoBytes = type === 'Repay' ? log.args?.memo : null

            let memoStr: string | null = null
            if (memoBytes && memoBytes !== '0x') {
              try {
                memoStr = new TextDecoder().decode(hexToBytes(memoBytes))
                if (!memoStr.trim()) memoStr = null
              } catch { memoStr = null }
            }

            return {
              type,
              asset: assetSym,
              amount: formatUnits(amount, decimals),
              hash: log.transactionHash ?? '',
              blockNumber: log.blockNumber ?? 0n,
              memo: memoStr,
            }
          })
        }

        const all: TxRecord[] = [
          ...parseLogs(supplyLogs, 'Supply'),
          ...parseLogs(borrowLogs, 'Borrow'),
          ...parseLogs(repayLogs, 'Repay'),
          ...parseLogs(withdrawLogs, 'Withdraw'),
        ].sort((a, b) => Number(b.blockNumber - a.blockNumber))

        setTxs(all)
      } catch (err) {
        console.error('Failed to fetch history logs', err)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void fetchLogs()
    return () => { cancelled = true }
  }, [address, publicClient])

  const filtered = txs.filter(h => filter === 'all' || h.type === filter)

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      <div>
        <h1 className="text-2xl font-bold" style={{ fontFamily: 'var(--font-heading)' }}>History</h1>
        <p className="text-sm text-[var(--color-muted-foreground)] mt-1">
          Your onchain transaction history — since the current pool deployment. Repayment memos stored onchain.
        </p>
      </div>

      {!isConnected ? (
        <Card>
          <p className="text-sm text-[var(--color-muted-foreground)] py-4 text-center">
            Connect your wallet to see your history.
          </p>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Transactions</CardTitle>
            <div className="flex gap-2 flex-wrap" role="group" aria-label="Filter transactions">
              {FILTER_OPTIONS.map(f => (
                <button
                  key={f.value}
                  onClick={() => setFilter(f.value)}
                  className={`px-3 py-1 rounded-full text-xs font-medium transition-base cursor-pointer
                    ${filter === f.value
                      ? 'bg-[var(--color-primary)] text-[var(--color-on-primary)]'
                      : 'bg-[var(--color-muted)] text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]'
                    }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </CardHeader>

          {loading ? (
            <p className="text-sm text-[var(--color-muted-foreground)] py-4 text-center">Loading history…</p>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-[var(--color-muted-foreground)] py-4 text-center">
              No transactions found.
            </p>
          ) : (
            <div className="divide-y divide-[var(--color-border)]">
              {filtered.map((tx, i) => (
                <div key={`${tx.hash}-${i}`} className="flex items-start justify-between py-3">
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5">{ICON_MAP[tx.type]}</div>
                    <div>
                      <p className="text-sm font-medium text-[var(--color-foreground)]">
                        {tx.type} {parseFloat(tx.amount).toLocaleString('en-US', { maximumFractionDigits: 6 })} {tx.asset}
                      </p>
                      {tx.memo && (
                        <p className="text-xs text-[var(--color-muted-foreground)] flex items-center gap-1 mt-0.5">
                          <Note size={11} aria-hidden="true" />
                          {tx.memo}
                        </p>
                      )}
                      <p className="text-xs text-[var(--color-muted-foreground)] mt-0.5">
                        Block {tx.blockNumber.toString()}
                      </p>
                    </div>
                  </div>
                  {tx.hash && (
                    <a
                      href={txUrl(tx.hash)}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[var(--color-muted-foreground)] hover:text-[var(--color-primary)] transition-base"
                      aria-label="View on explorer"
                    >
                      <ArrowSquareOut size={14} aria-hidden="true" />
                    </a>
                  )}
                </div>
              ))}
            </div>
          )}
        </Card>
      )}
    </div>
  )
}
