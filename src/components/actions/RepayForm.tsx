/**
 * Repay — repay USDC/EURC debt from the wallet, with an optional on-chain
 * memo (e.g. an invoice number). MAX adds a tiny buffer for interest accrued
 * since the last read; the pool only takes what is owed.
 */
import { useState } from 'react'
import { formatUnits, parseUnits } from 'viem'
import { toast } from 'sonner'
import { Note } from '@phosphor-icons/react'
import Button from '../ui/Button'
import AmountInput from '../ui/AmountInput'
import StatRow from '../ui/StatRow'
import HealthFactor from '../ui/HealthFactor'
import {
  COLLATERAL_TOKENS, CONTRACTS, TOKENS, formatToken, usdFromTokenAmount,
} from '../../lib/steadfi'
import {
  useApprove, useMarketData, useOraclePrices, useRepay, useTokenAllowance, useTokenBalance, useUserPosition,
} from '../../hooks/useSteadFi'
import { ApprovalSteps, Notice, Overview, errMsg, parseAmount, toastTx } from './shared'
import type { ActionFormProps } from './ActionProvider'

export default function RepayForm({ symbol, onDone, setBusy }: ActionFormProps) {
  const token = TOKENS[symbol]
  const [amount, setAmount] = useState('')
  const [memo, setMemo] = useState('')
  const [showMemo, setShowMemo] = useState(false)
  const [pending, setPending] = useState<'approve' | 'repay' | null>(null)

  const position = useUserPosition()
  const markets = useMarketData()
  const { prices } = useOraclePrices()
  const market = markets.find(m => m.symbol === symbol)
  const price18 = prices[symbol]

  const debt = position.debts[symbol]
  const wallet = useTokenBalance(symbol)
  const allowance = useTokenAllowance(symbol, CONTRACTS.LendingPool)
  const amt = parseAmount(amount, token.decimals, parseUnits) ?? 0n
  const needsApproval = amt > 0n && allowance < amt
  const overWallet = amt > wallet

  // Debt + 0.01% covers interest that accrues before the tx is mined.
  const debtWithBuffer = debt + debt / 10_000n + 1n
  const maxRepay = wallet < debtWithBuffer ? wallet : debtWithBuffer
  const repaid = amt > debt ? debt : amt

  const totalDebtUsd = Number(position.totalDebtRay) / 1e27
  const repaidUsd = price18 ? usdFromTokenAmount(repaid, token.decimals, price18) : 0
  const liqCollUsd = COLLATERAL_TOKENS.reduce((acc, s) => {
    const p = prices[s]
    if (!p) return acc
    const m = markets.find(x => x.symbol === s)
    return acc + usdFromTokenAmount(position.supplies[s], TOKENS[s].decimals, p) * ((m?.liqThreshold ?? 0) / 100)
  }, 0)
  const remainingUsd = Math.max(totalDebtUsd - repaidUsd, 0)
  const previewHf = amt > 0n ? (remainingUsd < 0.0001 ? Infinity : liqCollUsd / remainingUsd) : null

  const approve = useApprove()
  const { repay } = useRepay()

  async function run(kind: 'approve' | 'repay', fn: () => Promise<void>) {
    setPending(kind); setBusy(true)
    try { await fn() } catch (e) { toast.error(kind === 'approve' ? 'Approval failed' : 'Repay failed', { description: errMsg(e) }) }
    finally { setPending(null); setBusy(false) }
  }

  if (debt === 0n && !position.loading) {
    return (
      <div>
        <Notice tone="info">You have no {symbol} debt to repay.</Notice>
        <Button variant="secondary" className="w-full mt-4" onClick={onDone}>Close</Button>
      </div>
    )
  }

  return (
    <div>
      <AmountInput
        label="Amount"
        value={amount}
        onChange={setAmount}
        symbol={symbol}
        max={formatUnits(maxRepay, token.decimals)}
        balanceLabel="Wallet balance"
        balance={formatToken(wallet, token.decimals)}
        usdEquiv={price18 && amt > 0n ? usdFromTokenAmount(amt, token.decimals, price18).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : undefined}
        invalid={overWallet}
        id="repay-amount"
      />
      {overWallet && <Notice tone="danger">Amount exceeds your wallet balance.</Notice>}

      <button
        type="button"
        onClick={() => setShowMemo(v => !v)}
        aria-expanded={showMemo}
        className="mt-4 flex items-center gap-1.5 text-xs text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)] transition-base cursor-pointer"
      >
        <Note size={14} aria-hidden="true" />
        {showMemo ? 'Remove reference' : 'Add a payment reference (optional)'}
      </button>
      {showMemo && (
        <div className="mt-2">
          <label htmlFor="memo-input" className="sr-only">Payment reference</label>
          <input
            id="memo-input"
            type="text"
            placeholder="e.g. INV-2026-0042"
            value={memo}
            onChange={e => setMemo(e.target.value)}
            maxLength={64}
            className="w-full h-11 px-3 rounded-[12px] border border-[var(--color-border)] bg-[var(--color-background)] text-sm text-[var(--color-foreground)] focus:outline-none focus:border-[var(--color-primary)] transition-base"
          />
          <p className="mt-1 text-xs text-[var(--color-muted-foreground)]">Stored on-chain with the repayment and visible to anyone.</p>
        </div>
      )}

      <Overview>
        <StatRow label="Remaining debt" mono value={`${formatToken(debt > amt ? debt - amt : 0n, token.decimals)} ${symbol}`} />
        <StatRow label="Borrow APR" mono value={`${(market?.borrowApr ?? 0).toFixed(2)}%`} />
        {position.healthFactor !== null && (
          <StatRow label="Health factor" value={<HealthFactor value={position.healthFactor} preview={previewHf} size="sm" bare />} />
        )}
      </Overview>

      {needsApproval && <ApprovalSteps approved={false} action="Repay" />}

      <div className="mt-5">
        {needsApproval ? (
          <Button
            variant="primary" size="lg" className="w-full"
            loading={pending === 'approve'} disabled={overWallet}
            onClick={() => void run('approve', async () => {
              await approve(symbol, CONTRACTS.LendingPool)
              toast.success(`${symbol} approved`)
            })}
          >
            Approve {symbol}
          </Button>
        ) : (
          <Button
            variant="primary" size="lg" className="w-full"
            loading={pending === 'repay'} disabled={amt === 0n || overWallet}
            onClick={() => void run('repay', async () => {
              const hash = await repay(symbol, amt, memo)
              toastTx(`Repaid ${formatToken(repaid, token.decimals)} ${symbol}`, hash, memo ? <>Ref: {memo} · </> : undefined)
              onDone()
            })}
          >
            {amt === 0n ? 'Enter an amount' : amt >= debt ? `Repay all ${symbol}` : `Repay ${symbol}`}
          </Button>
        )}
      </div>
    </div>
  )
}
