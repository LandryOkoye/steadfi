/**
 * History — transaction history with onchain memo display.
 */
import { useState } from 'react'
import { Card, CardHeader, CardTitle } from '../components/ui/Card'
import { Note, ArrowCircleDown, ArrowCircleUp, ArrowsClockwise, ArrowCircleUpRight } from '@phosphor-icons/react'

type TxType = 'supply' | 'borrow' | 'repay' | 'withdraw'

const ICON_MAP: Record<TxType, JSX.Element> = {
  supply:   <ArrowCircleDown  size={16} className="text-[var(--color-success)]"     aria-hidden="true" />,
  borrow:   <ArrowCircleUp    size={16} className="text-[var(--color-warning)]"     aria-hidden="true" />,
  repay:    <ArrowsClockwise  size={16} className="text-[var(--color-accent)]"      aria-hidden="true" />,
  withdraw: <ArrowCircleUpRight size={16} className="text-[var(--color-muted-foreground)]" aria-hidden="true" />,
}

const HISTORY = [
  { id: '0xabc1', type: 'supply'   as TxType, asset: 'USDC',   amount: '10,000.00', ts: '2026-10-21 14:32', memo: null },
  { id: '0xabc2', type: 'supply'   as TxType, asset: 'cirBTC', amount: '1.00000000', ts: '2026-10-21 14:35', memo: null },
  { id: '0xabc3', type: 'borrow'   as TxType, asset: 'USDC',   amount: '35,000.00', ts: '2026-10-21 15:10', memo: null },
  { id: '0xabc4', type: 'repay'    as TxType, asset: 'USDC',   amount: '5,000.00',  ts: '2026-10-22 09:00', memo: 'INV-2026-0042' },
  { id: '0xabc5', type: 'repay'    as TxType, asset: 'USDC',   amount: '2,000.00',  ts: '2026-10-22 11:30', memo: 'INV-2026-0043' },
]

const FILTER_OPTIONS: { label: string; value: TxType | 'all' }[] = [
  { label: 'All',      value: 'all' },
  { label: 'Supply',   value: 'supply' },
  { label: 'Borrow',   value: 'borrow' },
  { label: 'Repay',    value: 'repay' },
  { label: 'Withdraw', value: 'withdraw' },
]

export default function History() {
  const [filter, setFilter] = useState<TxType | 'all'>('all')

  const filtered = HISTORY.filter(h => filter === 'all' || h.type === filter)

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      <div>
        <h1 className="text-2xl font-bold" style={{ fontFamily: 'var(--font-heading)' }}>History</h1>
        <p className="text-sm text-[var(--color-muted-foreground)] mt-1">
          Your transaction history. Repayment memos are stored onchain via Arc Memo.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Transactions</CardTitle>
          {/* Filter pills */}
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
                aria-pressed={filter === f.value}
              >
                {f.label}
              </button>
            ))}
          </div>
        </CardHeader>

        {filtered.length === 0 ? (
          <p className="text-sm text-[var(--color-muted-foreground)] text-center py-8">No transactions found.</p>
        ) : (
          <ul className="divide-y divide-[var(--color-border)]" aria-label="Transaction list">
            {filtered.map(tx => (
              <li key={tx.id} className="py-3 flex items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                  <span className="mt-0.5">{ICON_MAP[tx.type]}</span>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold capitalize text-[var(--color-foreground)]">{tx.type}</span>
                      <span className="text-sm mono text-[var(--color-muted-foreground)]">{tx.amount} {tx.asset}</span>
                    </div>
                    {tx.memo && (
                      <div className="flex items-center gap-1 mt-0.5 text-xs text-[var(--color-accent)]">
                        <Note size={11} aria-hidden="true" />
                        <span>{tx.memo}</span>
                      </div>
                    )}
                    <div className="text-[11px] text-[var(--color-muted-foreground)] mt-0.5">{tx.ts}</div>
                  </div>
                </div>
                <a
                  href={`https://testnet.arcscan.app/tx/${tx.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[11px] text-[var(--color-accent)] hover:underline shrink-0"
                  aria-label={`View transaction ${tx.id} on explorer`}
                >
                  Explorer
                </a>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}
