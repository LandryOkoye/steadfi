/**
 * Bridge In — guided flow to bring USDC from another chain via CCTP / Bridge Kit.
 */
import { useState } from 'react'
import { Card, CardHeader, CardTitle } from '../components/ui/Card'
import Button from '../components/ui/Button'
import AmountInput from '../components/ui/AmountInput'
import RiskDisclosure from '../components/ui/RiskDisclosure'
import { ArrowRight, CheckCircle } from '@phosphor-icons/react'
import { toast } from 'sonner'

const SOURCE_CHAINS = [
  { id: 'eth',   label: 'Ethereum',   icon: '🔷' },
  { id: 'base',  label: 'Base',       icon: '🔵' },
  { id: 'arb',   label: 'Arbitrum',   icon: '🟦' },
  { id: 'sol',   label: 'Solana',     icon: '🟣' },
]

const STEPS = ['Select source', 'Enter amount', 'Bridge', 'Deposit']

export default function Bridge() {
  const [chain, setChain] = useState(SOURCE_CHAINS[0])
  const [amount, setAmount] = useState('')
  const [step, setStep] = useState(0)
  const [loading, setLoading] = useState(false)

  const numAmount = parseFloat(amount) || 0

  async function handleBridge() {
    if (!numAmount) return
    setLoading(true)
    // TODO: wire Circle Bridge Kit / CCTP in Phase 3 wiring
    await new Promise(r => setTimeout(r, 2500))
    setLoading(false)
    setStep(2)
    toast.success(`Bridging ${amount} USDC from ${chain.label} to Arc…`)
    // Simulate bridge completion
    await new Promise(r => setTimeout(r, 2000))
    setStep(3)
    toast.success('USDC arrived on Arc Testnet!')
  }

  return (
    <div className="max-w-lg mx-auto space-y-5">
      <div>
        <h1 className="text-2xl font-bold" style={{ fontFamily: 'var(--font-heading)' }}>Bridge In</h1>
        <p className="text-sm text-[var(--color-muted-foreground)] mt-1">
          Move USDC from another chain to Arc Testnet via Circle CCTP — then deposit directly into SteadFi.
        </p>
      </div>

      {/* Step indicator */}
      <div className="flex items-center gap-1.5">
        {STEPS.map((s, i) => (
          <div key={s} className="flex items-center gap-1.5">
            <div className={`flex items-center justify-center w-6 h-6 rounded-full text-[10px] font-bold transition-base
              ${i < step  ? 'bg-[var(--color-success)] text-white' :
                i === step ? 'bg-[var(--color-primary)] text-[var(--color-on-primary)]' :
                             'bg-[var(--color-muted)] text-[var(--color-muted-foreground)]'}`}
              aria-current={i === step ? 'step' : undefined}
            >
              {i < step ? <CheckCircle size={14} weight="fill" aria-hidden="true" /> : i + 1}
            </div>
            {i < STEPS.length - 1 && (
              <div className={`h-px w-6 transition-base ${i < step ? 'bg-[var(--color-success)]' : 'bg-[var(--color-border)]'}`} />
            )}
          </div>
        ))}
        <span className="ml-2 text-xs text-[var(--color-muted-foreground)]">{STEPS[step]}</span>
      </div>

      <Card>
        <CardHeader><CardTitle>Source chain</CardTitle></CardHeader>

        <div className="grid grid-cols-2 gap-2 mb-5">
          {SOURCE_CHAINS.map(c => (
            <button
              key={c.id}
              onClick={() => { setChain(c); setStep(0) }}
              className={`flex items-center gap-2 px-4 py-3 rounded-xl border text-sm font-medium transition-base cursor-pointer
                ${chain.id === c.id
                  ? 'border-[var(--color-primary)] bg-[var(--color-muted)] text-[var(--color-foreground)]'
                  : 'border-[var(--color-border)] text-[var(--color-muted-foreground)] hover:border-[var(--color-primary)]'
                }`}
            >
              <span aria-hidden="true">{c.icon}</span> {c.label}
            </button>
          ))}
        </div>

        <AmountInput
          label="USDC amount to bridge"
          value={amount}
          onChange={v => { setAmount(v); if (step === 0 && parseFloat(v) > 0) setStep(1) }}
          symbol="USDC"
          id="bridge-amount"
        />

        {/* Route preview */}
        {numAmount > 0 && (
          <div className="mt-4 flex items-center justify-between rounded-xl bg-[var(--color-muted)] px-4 py-3 text-sm">
            <div className="text-center">
              <div className="text-[var(--color-muted-foreground)] text-xs">From</div>
              <div className="font-semibold">{chain.label}</div>
            </div>
            <ArrowRight size={18} className="text-[var(--color-primary)]" aria-hidden="true" />
            <div className="text-center">
              <div className="text-[var(--color-muted-foreground)] text-xs">To</div>
              <div className="font-semibold text-[var(--color-primary)]">Arc Testnet</div>
            </div>
            <div className="text-center">
              <div className="text-[var(--color-muted-foreground)] text-xs">Receive</div>
              <div className="font-semibold mono">{numAmount.toFixed(2)} USDC</div>
            </div>
          </div>
        )}

        {/* Info row */}
        <div className="mt-4 grid grid-cols-3 gap-2 text-center text-xs text-[var(--color-muted-foreground)]">
          <div>
            <div className="font-medium text-[var(--color-foreground)]">~30s</div>
            <div>Transfer time</div>
          </div>
          <div>
            <div className="font-medium text-[var(--color-foreground)]">$0.00</div>
            <div>Bridge fee</div>
          </div>
          <div>
            <div className="font-medium text-[var(--color-foreground)]">CCTP v2</div>
            <div>Protocol</div>
          </div>
        </div>

        <Button
          className="w-full mt-5"
          loading={loading}
          onClick={() => { void handleBridge() }}
          disabled={!numAmount || step >= 2}
        >
          {step >= 3 ? 'Bridged — now deposit' : `Bridge ${amount || '0'} USDC to Arc`}
        </Button>

        {step >= 3 && (
          <Button variant="secondary" className="w-full mt-3" onClick={() => {}}>
            Deposit to SteadFi
          </Button>
        )}
      </Card>

      <RiskDisclosure includesBridge />
    </div>
  )
}
