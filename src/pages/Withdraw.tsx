/**
 * Withdraw — withdraw supplied assets. HF preview shown live.
 */
import { useState } from 'react'
import { Card, CardHeader, CardTitle } from '../components/ui/Card'
import Button from '../components/ui/Button'
import AmountInput from '../components/ui/AmountInput'
import StatRow from '../components/ui/StatRow'
import HealthFactor from '../components/ui/HealthFactor'
import RiskDisclosure from '../components/ui/RiskDisclosure'
import { toast } from 'sonner'

const SUPPLIED = [
  { symbol: 'USDC', balance: '10,000.00', apy: 6.48 },
  { symbol: 'EURC', balance: '0.00',      apy: 5.80 },
  { symbol: 'cirBTC', balance: '1.00000000', apy: 1.20 },
]

const CURRENT_HF = 2.40

export default function Withdraw() {
  const [asset, setAsset] = useState(SUPPLIED[0])
  const [amount, setAmount] = useState('')
  const [loading, setLoading] = useState(false)

  const numAmount = parseFloat(amount) || 0

  // Simplified HF preview: withdrawing collateral reduces weighted collateral
  const previewHF = numAmount > 0 && asset.symbol === 'cirBTC'
    ? Math.max(0, CURRENT_HF - numAmount * 0.8)
    : null

  async function handleWithdraw() {
    if (!numAmount) return
    setLoading(true)
    await new Promise(r => setTimeout(r, 1500))
    setLoading(false)
    toast.success(`Withdrew ${amount} ${asset.symbol}`)
    setAmount('')
  }

  return (
    <div className="max-w-lg mx-auto space-y-5">
      <div>
        <h1 className="text-2xl font-bold" style={{ fontFamily: 'var(--font-heading)' }}>Withdraw</h1>
        <p className="text-sm text-[var(--color-muted-foreground)] mt-1">
          Withdraw your supplied assets when liquidity is available.
        </p>
      </div>

      {previewHF !== null && (
        <Card>
          <CardHeader><CardTitle>Health Factor Preview</CardTitle></CardHeader>
          <HealthFactor value={CURRENT_HF} preview={previewHF} size="lg" />
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle>Withdraw asset</CardTitle></CardHeader>

        <div className="flex gap-2 mb-5 flex-wrap">
          {SUPPLIED.map(a => (
            <button
              key={a.symbol}
              onClick={() => { setAsset(a); setAmount('') }}
              className={`px-4 py-2 rounded-xl border text-sm font-semibold transition-base cursor-pointer
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
          label="Amount to withdraw"
          value={amount}
          onChange={setAmount}
          max={asset.balance.replace(/,/g, '')}
          symbol={asset.symbol}
          id="withdraw-amount"
        />

        <div className="mt-5 space-y-0">
          <StatRow label="Supplied balance" value={<span className="mono">{asset.balance} {asset.symbol}</span>} />
          <StatRow label="Supply APY" value={<span className="mono text-[var(--color-success)]">{asset.apy.toFixed(2)}%</span>} />
          <StatRow label="Gas estimate" value={<span className="mono">~$0.01 USDC</span>} hint="Arc stable fee" />
        </div>

        <Button className="w-full mt-5" loading={loading} onClick={() => { void handleWithdraw() }} disabled={!numAmount}>
          Withdraw {amount || '0'} {asset.symbol}
        </Button>
      </Card>

      <RiskDisclosure />
    </div>
  )
}
