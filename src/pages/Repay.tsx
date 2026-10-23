/**
 * Repay — repay USDC or EURC debt.
 * Supports optional repayment memo (recorded onchain via LendingPool.repay bytes param).
 * Live debt reads from chain. No mocks.
 */
import { useState } from 'react'
import { Card, CardHeader, CardTitle } from '../components/ui/Card'
import Button from '../components/ui/Button'
import AmountInput from '../components/ui/AmountInput'
import StatRow from '../components/ui/StatRow'
import RiskDisclosure from '../components/ui/RiskDisclosure'
import { Note } from '@phosphor-icons/react'
import { toast } from 'sonner'
import { parseUnits } from 'viem'
import { useAccount } from 'wagmi'
import {
  useUserPosition, useTokenBalance, useTokenAllowance, useApprove, useRepay, useMarketData,
} from '../hooks/useSteadFi'
import { CONTRACTS, BORROW_TOKENS, TOKENS, TokenSymbol, formatToken, txUrl } from '../lib/steadfi'

export default function Repay() {
  const { isConnected } = useAccount()
  const [asset, setAsset] = useState<TokenSymbol>('USDC')
  const [amount, setAmount] = useState('')
  const [memo, setMemo] = useState('')
  const [showMemo, setShowMemo] = useState(false)
  const [busy, setBusy] = useState(false)

  const position = useUserPosition()
  const markets = useMarketData()

  const decimals = TOKENS[asset].decimals
  const debtRaw = position.debts[asset]
  const debtFormatted = formatToken(debtRaw, decimals)
  const market = markets.find(m => m.symbol === asset)

  const walletBalance = useTokenBalance(asset)
  const amountBig = amount ? parseUnits(amount, decimals) : 0n
  const allowance = useTokenAllowance(asset, CONTRACTS.LendingPool)
  const needsApproval = allowance < amountBig

  const approve = useApprove()
  const { repay } = useRepay()

  const numAmount = parseFloat(amount) || 0

  async function handleApprove() {
    setBusy(true)
    try {
      await approve(asset, CONTRACTS.LendingPool)
      toast.success('Approval confirmed')
    } catch (e: unknown) {
      toast.error('Approval failed', { description: e instanceof Error ? e.message : String(e) })
    } finally {
      setBusy(false)
    }
  }

  async function handleRepay() {
    if (!numAmount || !amountBig) return
    setBusy(true)
    try {
      const hash = await repay(asset, amountBig, memo)
      const memoNote = memo ? ` (ref: ${memo})` : ''
      toast.success(`Repaid ${amount} ${asset}${memoNote}`, {
        description: (
          <a href={txUrl(hash)} target="_blank" rel="noreferrer"
             className="underline text-xs">View on explorer</a>
        ),
      })
      setAmount('')
      setMemo('')
    } catch (e: unknown) {
      toast.error('Repay failed', { description: e instanceof Error ? e.message : String(e) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="max-w-lg mx-auto space-y-5">
      <div>
        <h1 className="text-2xl font-bold" style={{ fontFamily: 'var(--font-heading)' }}>Repay</h1>
        <p className="text-sm text-[var(--color-muted-foreground)] mt-1">
          Repay your debt. Attach a memo for business reconciliation — stored onchain.
        </p>
      </div>

      <Card>
        <CardHeader><CardTitle>Repay asset</CardTitle></CardHeader>

        <div className="flex gap-2 mb-5">
          {BORROW_TOKENS.map(sym => (
            <button
              key={sym}
              onClick={() => { setAsset(sym); setAmount('') }}
              className={`flex-1 py-2 rounded-xl border text-sm font-semibold transition-base cursor-pointer
                ${asset === sym
                  ? 'border-[var(--color-primary)] bg-[var(--color-muted)] text-[var(--color-primary)]'
                  : 'border-[var(--color-border)] text-[var(--color-muted-foreground)] hover:border-[var(--color-primary)]'
                }`}
            >
              {sym}
            </button>
          ))}
        </div>

        <AmountInput
          label="Amount to repay"
          value={amount}
          onChange={setAmount}
          max={debtFormatted.replace(/,/g, '')}
          symbol={asset}
          id="repay-amount"
        />

        <div className="mt-5 space-y-0">
          <StatRow
            label="Outstanding debt"
            value={
              position.loading
                ? <span className="text-xs text-[var(--color-muted-foreground)]">loading…</span>
                : <span className="mono text-[var(--color-warning)]">{debtFormatted} {asset}</span>
            }
          />
          <StatRow
            label="Borrow APR"
            value={<span className="mono">{(market?.borrowApr ?? 0).toFixed(2)}%</span>}
          />
          <StatRow
            label="Wallet balance"
            value={<span className="mono">{formatToken(walletBalance, decimals)} {asset}</span>}
          />
        </div>

        {/* Memo toggle */}
        <button
          onClick={() => setShowMemo(v => !v)}
          className="mt-4 flex items-center gap-1.5 text-xs text-[var(--color-muted-foreground)] hover:text-[var(--color-primary)] transition-base cursor-pointer"
        >
          <Note size={14} aria-hidden="true" />
          {showMemo ? 'Hide memo' : 'Add repayment reference (optional)'}
        </button>

        {showMemo && (
          <div className="mt-3">
            <label htmlFor="memo-input" className="block text-xs font-medium text-[var(--color-foreground)] mb-1">
              Reference / Memo
            </label>
            <input
              id="memo-input"
              type="text"
              placeholder="e.g. INV-2026-0042"
              value={memo}
              onChange={e => setMemo(e.target.value)}
              maxLength={64}
              className="w-full px-3 py-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] text-sm text-[var(--color-foreground)] focus:outline-none focus:border-[var(--color-primary)] transition-base"
            />
            <p className="text-xs text-[var(--color-muted-foreground)] mt-1">
              This text is stored onchain — use invoice numbers, client IDs, etc.
            </p>
          </div>
        )}

        {isConnected ? (
          <div className="mt-5 space-y-2">
            {needsApproval && amountBig > 0n && (
              <Button variant="secondary" className="w-full" loading={busy} onClick={() => { void handleApprove() }}>
                Approve {asset}
              </Button>
            )}
            <Button
              variant="primary"
              className="w-full"
              loading={busy}
              disabled={!numAmount || needsApproval || debtRaw === 0n}
              onClick={() => { void handleRepay() }}
            >
              Repay {asset}
            </Button>
          </div>
        ) : (
          <p className="mt-5 text-center text-sm text-[var(--color-muted-foreground)]">
            Connect your wallet to repay
          </p>
        )}
      </Card>

      <RiskDisclosure />
    </div>
  )
}
