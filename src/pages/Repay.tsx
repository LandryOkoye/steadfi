/**
 * Repay — repay USDC or EURC debt.
 * Supports optional repayment memo (Arc Memo contract — business reconciliation).
 */
import { useState } from 'react'
import { Card, CardHeader, CardTitle } from '../components/ui/Card'
import Button from '../components/ui/Button'
import AmountInput from '../components/ui/AmountInput'
import StatRow from '../components/ui/StatRow'
import RiskDisclosure from '../components/ui/RiskDisclosure'
import { Note } from '@phosphor-icons/react'
import { toast } from 'sonner'

const DEBTS = [
  { symbol: 'USDC', outstanding: '35,000.00', apr: 8.00 },
  { symbol: 'EURC', outstanding: '0.00',      apr: 7.20 },
]

export default function Repay() {
  const [asset, setAsset] = useState(DEBTS[0])
  const [amount, setAmount] = useState('')
  const [memo, setMemo] = useState('')
  const [showMemo, setShowMemo] = useState(false)
  const [loading, setLoading] = useState(false)

  const numAmount = parseFloat(amount) || 0
  const outstanding = parseFloat(asset.outstanding.replace(/,/g, ''))

  async function handleRepay() {
    if (!numAmount) return
    setLoading(true)
    // TODO: wire to LendingPool.repay() with memo bytes
    await new Promise(r => setTimeout(r, 1500))
    setLoading(false)
    const memoNote = memo ? ` (ref: ${memo})` : ''
    toast.success(`Repaid ${amount} ${asset.symbol}${memoNote}`)
    setAmount('')
    setMemo('')
  }

  return (
    <div className="max-w-lg mx-auto space-y-5">
      <div>
        <h1 className="text-2xl font-bold" style={{ fontFamily: 'var(--font-heading)' }}>Repay</h1>
        <p className="text-sm text-[var(--color-muted-foreground)] mt-1">
          Repay your debt. Attach a memo for business reconciliation — recorded onchain via Arc Memo.
        </p>
      </div>

      <Card>
        <CardHeader><CardTitle>Repay asset</CardTitle></CardHeader>

        <div className="flex gap-2 mb-5">
          {DEBTS.map(d => (
            <button
              key={d.symbol}
              onClick={() => { setAsset(d); setAmount('') }}
              className={`flex-1 py-2 rounded-xl border text-sm font-semibold transition-base cursor-pointer
                ${asset.symbol === d.symbol
                  ? 'border-[var(--color-primary)] bg-[var(--color-muted)] text-[var(--color-primary)]'
                  : 'border-[var(--color-border)] text-[var(--color-muted-foreground)] hover:border-[var(--color-primary)]'
                }`}
            >
              {d.symbol}
            </button>
          ))}
        </div>

        <AmountInput
          label="Amount to repay"
          value={amount}
          onChange={setAmount}
          max={asset.outstanding.replace(/,/g, '')}
          symbol={asset.symbol}
          id="repay-amount"
        />

        {/* Memo toggle */}
        <button
          type="button"
          onClick={() => setShowMemo(v => !v)}
          className="mt-3 flex items-center gap-1.5 text-xs text-[var(--color-accent)] hover:underline transition-base cursor-pointer"
        >
          <Note size={14} aria-hidden="true" />
          {showMemo ? 'Hide memo' : 'Add payment reference (optional)'}
        </button>

        {showMemo && (
          <div className="mt-3">
            <label htmlFor="memo" className="block text-xs text-[var(--color-muted-foreground)] mb-1.5 font-medium">
              Reference / Invoice number
            </label>
            <input
              id="memo"
              type="text"
              value={memo}
              onChange={e => setMemo(e.target.value)}
              placeholder="e.g. INV-2026-0042"
              maxLength={64}
              className="w-full bg-[var(--color-muted)] border border-[var(--color-border)] rounded-xl px-4 py-2.5 text-sm text-[var(--color-foreground)] placeholder:text-[var(--color-muted-foreground)] outline-none focus:border-[var(--color-primary)] transition-base"
            />
            <p className="text-[10px] text-[var(--color-muted-foreground)] mt-1">
              Stored onchain via Arc Memo — visible in your transaction history.
            </p>
          </div>
        )}

        <div className="mt-5 space-y-0">
          <StatRow label="Outstanding debt" value={<span className="mono text-[var(--color-warning)]">{asset.outstanding} {asset.symbol}</span>} />
          <StatRow label="Borrow APR" value={<span className="mono">{asset.apr.toFixed(2)}%</span>} />
          {numAmount > 0 && (
            <StatRow label="Remaining after repay" value={
              <span className="mono">
                {Math.max(0, outstanding - numAmount).toLocaleString('en-US', { minimumFractionDigits: 2 })} {asset.symbol}
              </span>
            } />
          )}
          <StatRow label="Gas estimate" value={<span className="mono">~$0.01 USDC</span>} hint="Arc stable fee" />
        </div>

        <Button className="w-full mt-5" loading={loading} onClick={() => { void handleRepay() }} disabled={!numAmount}>
          Repay {amount || '0'} {asset.symbol}
        </Button>
      </Card>

      <RiskDisclosure />
    </div>
  )
}
