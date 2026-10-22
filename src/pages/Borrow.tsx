/**
 * Borrow — borrow USDC or EURC against collateral.
 * Health factor preview updates live as amount changes.
 */
import { useState } from 'react'
import { Card, CardHeader, CardTitle } from '../components/ui/Card'
import Button from '../components/ui/Button'
import AmountInput from '../components/ui/AmountInput'
import StatRow from '../components/ui/StatRow'
import HealthFactor from '../components/ui/HealthFactor'
import RiskDisclosure from '../components/ui/RiskDisclosure'
import { toast } from 'sonner'

const BORROWABLE = [
  { symbol: 'USDC', apr: 8.00, available: '60,000.00' },
  { symbol: 'EURC', apr: 7.20, available: '40,000.00' },
]

// Simulated current position
const CURRENT_HF = 2.40
const COLLATERAL_USD = 95_000

export default function Borrow() {
  const [asset, setAsset] = useState(BORROWABLE[0])
  const [amount, setAmount] = useState('')
  const [loading, setLoading] = useState(false)

  const numAmount = parseFloat(amount) || 0

  // Simulated HF preview: collateral / (existingDebt + newDebt) * liqThreshold
  const existingDebt = COLLATERAL_USD / CURRENT_HF
  const previewHF = numAmount > 0
    ? (COLLATERAL_USD * 0.78) / (existingDebt + numAmount)
    : null

  async function handleBorrow() {
    if (!numAmount) return
    if (previewHF !== null && previewHF < 1.0) {
      toast.error('This borrow would put your position below liquidation threshold.')
      return
    }
    setLoading(true)
    // TODO: wire to LendingPool.borrow()
    await new Promise(r => setTimeout(r, 1500))
    setLoading(false)
    toast.success(`Borrowed ${amount} ${asset.symbol}`)
    setAmount('')
  }

  const belowSafe = previewHF !== null && previewHF < 1.2

  return (
    <div className="max-w-lg mx-auto space-y-5">
      <div>
        <h1 className="text-2xl font-bold" style={{ fontFamily: 'var(--font-heading)' }}>Borrow</h1>
        <p className="text-sm text-[var(--color-muted-foreground)] mt-1">
          Borrow USDC or EURC against your collateral. Gas is paid in USDC — no ETH needed.
        </p>
      </div>

      {/* Health factor — always prominent */}
      <Card>
        <CardHeader><CardTitle>Health Factor</CardTitle></CardHeader>
        <HealthFactor value={CURRENT_HF} preview={previewHF} size="lg" />
        <p className="text-xs text-[var(--color-muted-foreground)] mt-2">
          Positions below 1.0 can be liquidated. Stay above 1.5 for safety.
        </p>
      </Card>

      <Card>
        <CardHeader><CardTitle>Borrow asset</CardTitle></CardHeader>

        <div className="flex gap-2 mb-5">
          {BORROWABLE.map(a => (
            <button
              key={a.symbol}
              onClick={() => { setAsset(a); setAmount('') }}
              className={`flex-1 py-2 rounded-xl border text-sm font-semibold transition-base cursor-pointer
                ${asset.symbol === a.symbol
                  ? 'border-[var(--color-primary)] bg-[var(--color-muted)] text-[var(--color-primary)]'
                  : 'border-[var(--color-border)] text-[var(--color-muted-foreground)] hover:border-[var(--color-primary)]'
                }`}
            >
              {a.symbol}
            </button>
          ))}
        </div>

        <AmountInput
          label="Amount to borrow"
          value={amount}
          onChange={setAmount}
          max={asset.available}
          symbol={asset.symbol}
          usdEquiv={numAmount > 0 ? numAmount.toLocaleString('en-US', { minimumFractionDigits: 2 }) : undefined}
          id="borrow-amount"
        />

        <div className="mt-5 space-y-0">
          <StatRow label="Borrow APR" value={<span className="text-[var(--color-warning)] mono">{asset.apr.toFixed(2)}%</span>} />
          <StatRow label="Available to borrow" value={<span className="mono">{asset.available} {asset.symbol}</span>} />
          {previewHF !== null && (
            <StatRow label="Health factor after" value={
              <span className={`mono ${previewHF >= 1.5 ? 'text-[var(--color-success)]' : previewHF >= 1.0 ? 'text-[var(--color-warning)]' : 'text-[var(--color-destructive)]'}`}>
                {previewHF.toFixed(2)}
              </span>
            } />
          )}
          <StatRow label="Gas estimate" value={<span className="mono">~$0.01 USDC</span>} hint="Arc stable fee" />
        </div>

        {belowSafe && (
          <div
            className="mt-4 p-3 rounded-xl bg-[var(--color-destructive)]/10 border border-[var(--color-destructive)] text-xs text-[var(--color-destructive)]"
            role="alert"
          >
            Warning: this borrow will bring your health factor below 1.2. Your position may be liquidated.
          </div>
        )}

        <Button
          className="w-full mt-5"
          loading={loading}
          onClick={() => { void handleBorrow() }}
          disabled={!numAmount}
          variant={belowSafe ? 'danger' : 'primary'}
        >
          Borrow {amount || '0'} {asset.symbol}
        </Button>
      </Card>

      <RiskDisclosure />
    </div>
  )
}
