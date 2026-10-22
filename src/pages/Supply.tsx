/**
 * Supply — supply USDC or EURC to earn interest.
 */
import { useState } from 'react'
import { Card, CardHeader, CardTitle } from '../components/ui/Card'
import Button from '../components/ui/Button'
import AmountInput from '../components/ui/AmountInput'
import StatRow from '../components/ui/StatRow'
import RiskDisclosure from '../components/ui/RiskDisclosure'
import { toast } from 'sonner'

const ASSETS = [
  { symbol: 'USDC', apy: 6.48, wallet: '1,200.00' },
  { symbol: 'EURC', apy: 5.80, wallet: '0.00' },
]

export default function Supply() {
  const [asset, setAsset] = useState(ASSETS[0])
  const [amount, setAmount] = useState('')
  const [loading, setLoading] = useState(false)

  const numAmount = parseFloat(amount) || 0
  const estYearlyEarnings = numAmount * (asset.apy / 100)

  async function handleSupply() {
    if (!numAmount) return
    setLoading(true)
    // TODO: wire to LendingPool.supply() in Phase 3 wiring
    await new Promise(r => setTimeout(r, 1500))
    setLoading(false)
    toast.success(`Supplied ${amount} ${asset.symbol} successfully`)
    setAmount('')
  }

  return (
    <div className="max-w-lg mx-auto space-y-5">
      <div>
        <h1 className="text-2xl font-bold" style={{ fontFamily: 'var(--font-heading)' }}>Supply</h1>
        <p className="text-sm text-[var(--color-muted-foreground)] mt-1">
          Earn interest on your USDC or EURC. Withdraw any time when liquidity is available.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Select asset</CardTitle>
        </CardHeader>

        {/* Asset selector */}
        <div className="flex gap-2 mb-5">
          {ASSETS.map(a => (
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
          label="Amount to supply"
          value={amount}
          onChange={setAmount}
          max={asset.wallet}
          symbol={asset.symbol}
          usdEquiv={numAmount > 0 ? numAmount.toLocaleString('en-US', { minimumFractionDigits: 2 }) : undefined}
          id="supply-amount"
        />

        {/* Stats */}
        <div className="mt-5 space-y-0">
          <StatRow label="Supply APY" value={<span className="text-[var(--color-success)] mono">{asset.apy.toFixed(2)}%</span>} />
          <StatRow label="Wallet balance" value={<span className="mono">{asset.wallet} {asset.symbol}</span>} />
          {numAmount > 0 && (
            <StatRow
              label="Est. yearly earnings"
              value={<span className="mono text-[var(--color-success)]">
                +{estYearlyEarnings.toFixed(2)} {asset.symbol}/yr
              </span>}
            />
          )}
          <StatRow label="Gas estimate" value={<span className="mono">~$0.01 USDC</span>} hint="Arc stable fee" />
        </div>

        <Button className="w-full mt-5" loading={loading} onClick={() => { void handleSupply() }} disabled={!numAmount}>
          Supply {amount || '0'} {asset.symbol}
        </Button>
      </Card>

      <RiskDisclosure />
    </div>
  )
}
