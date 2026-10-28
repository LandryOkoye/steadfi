/**
 * History — onchain transaction history via getLogs from LendingPool.
 * Reads Supply, Borrow, Repay, Withdraw events. No mocks.
 */
import { useState, useEffect } from 'react'
import { Card, CardHeader, CardTitle } from '../components/ui/Card'
import { Note, ArrowCircleDown, ArrowCircleUp, ArrowsClockwise, ArrowCircleUpRight, ArrowSquareOut } from '@phosphor-icons/react'
import { useAccount, usePublicClient } from 'wagmi'
import type { AbiEvent } from 'viem'
import { CONTRACTS, TOKENS, TokenSymbol, txUrl, LENDING_POOL_EVENTS_ABI, POOL_DEPLOY_BLOCK, ARC_CHAIN_ID } from '../lib/steadfi'
import { formatUnits, hexToBytes, pad } from 'viem'
import { getLogsChunked } from '../lib/logs'

type TxType = 'Supply' | 'Borrow' | 'Repay' | 'Withdraw'
const TX_TYPES: readonly TxType[] = ['Supply', 'Borrow', 'Repay', 'Withdraw']

/** Event ABIs looked up by name — never by array position. */
const HISTORY_EVENTS = LENDING_POOL_EVENTS_ABI.filter(
  e => (TX_TYPES as readonly string[]).includes(e.name)
) as unknown as AbiEvent[]

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
  const publicClient = usePublicClient({ chainId: ARC_CHAIN_ID })
  const [filter, setFilter] = useState<TxType | 'all'>('all')
  const [txs, setTxs] = useState<TxRecord[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [progress, setProgress] = useState(0)

  useEffect(() => {
    if (!address || !publicClient) return

    let cancelled = false

    async function fetchLogs() {
      if (!cancelled) { setLoading(true); setError(null); setProgress(0) }
      try {
        // `user` is the first indexed arg of all four events, so the RPC
        // returns only this wallet's events; results are cached per wallet.
        const logs = await getLogsChunked(
          publicClient!, CONTRACTS.LendingPool, HISTORY_EVENTS, POOL_DEPLOY_BLOCK,
          {
            topics: [pad(address!.toLowerCase() as `0x${string}`)],
            cacheKey: `history:${address!.toLowerCase()}`,
            isCancelled: () => cancelled,
            onProgress: f => { if (!cancelled) setProgress(f) },
          },
        )

        if (cancelled) return

        type RawLog = {
          eventName?: string
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
            .filter(log => log.eventName === type)
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

        const all: TxRecord[] = TX_TYPES
          .flatMap(type => parseLogs(logs, type))
          .sort((a, b) => Number(b.blockNumber - a.blockNumber))

        setTxs(all)
      } catch (err) {
        console.error('Failed to fetch history logs', err)
        if (!cancelled) setError('Could not load your history from the Arc RPC.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void fetchLogs()
    return () => { cancelled = true }
  }, [address, publicClient, reloadKey])

  const filtered = txs.filter(h => filter === 'all' || h.type === filter)

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      <div className="mb-2">
        <p className="text-sm text-[var(--color-muted-foreground)]">Activity</p>
        <h1 className="mt-1 text-3xl md:text-4xl font-semibold">History</h1>
        <p className="text-sm text-[var(--color-muted-foreground)] mt-2">
          Your on-chain transactions since the current pool deployment, including repayment references.
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
                  aria-pressed={filter === f.value}
                className={`h-8 px-3 rounded-full text-xs font-medium transition-base cursor-pointer
                    ${filter === f.value
                      ? 'bg-[var(--color-foreground)] text-[var(--color-background)]'
                      : 'bg-[var(--color-muted)] text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]'
                    }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </CardHeader>

          {loading ? (
            <p className="text-sm text-[var(--color-muted-foreground)] py-4 text-center">
              Loading history…{progress > 0 && progress < 1 && ` ${Math.round(progress * 100)}%`}
            </p>
          ) : error ? (
            <div className="py-4 text-center space-y-2">
              <p className="text-sm text-[var(--color-warning)]">{error}</p>
              <button
                onClick={() => setReloadKey(k => k + 1)}
                className="px-3 py-1 rounded-full text-xs font-medium bg-[var(--color-muted)] text-[var(--color-foreground)] cursor-pointer"
              >
                Retry (continues where it stopped)
              </button>
            </div>
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
