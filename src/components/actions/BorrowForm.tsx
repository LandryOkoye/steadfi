/**
 * Borrow — USDC or EURC against cirBTC/WETH collateral, with a fixed term
 * (7–180 days, recorded on-chain via borrowWithTerm). The one-time
 * origination fee is added to the debt; the borrower receives the full amount.
 */
import { useState } from 'react'
import { parseUnits } from 'viem'
import { toast } from 'sonner'
import { clsx } from 'clsx'
import Button from '../ui/Button'
import AmountInput from '../ui/AmountInput'
import StatRow from '../ui/StatRow'
import HealthFactor from '../ui/HealthFactor'
import RiskDisclosure from '../ui/RiskDisclosure'
import {
  COLLATERAL_TOKENS, TOKENS, formatToken, usdFromTokenAmount,
} from '../../lib/steadfi'
import {
  LOAN_DURATIONS_DAYS, useBorrow, useBorrowFee, useMarketData, useNowMs, useOraclePrices,
  useProjectedBorrowApr, useUserPosition,
} from '../../hooks/useSteadFi'
import { Notice, Overview, errMsg, fmtUsd, parseAmount, toastTx } from './shared'
import type { ActionFormProps } from './ActionProvider'

export default function BorrowForm({ symbol, onDone, setBusy }: ActionFormProps) {
  const token = TOKENS[symbol]
  const [amount, setAmount] = useState('')
  const [durationDays, setDurationDays] = useState<number>(30)
  const [pending, setPending] = useState(false)

  const position = useUserPosition()
  const markets = useMarketData()
  const { prices } = useOraclePrices()
  const market = markets.find(m => m.symbol === symbol)
  const price18 = prices[symbol]
  const nowMs = useNowMs()

  const amt = parseAmount(amount, token.decimals, parseUnits) ?? 0n
  const { feeBps, feeFor } = useBorrowFee(symbol)
  const fee = feeFor(amt)
  const debtAdded = amt + fee

  // Borrow power and current debt from LendingPool (Ray USD).
  const borrowPowerUsd = Number(position.borrowPowerRay) / 1e27
  const currentDebtUsd = Number(position.totalDebtRay) / 1e27
  const availableUsd = Math.max(borrowPowerUsd - currentDebtUsd, 0)
  const priceUsd = price18 ? Number(price18) / 1e18 : null

  // Fee counts against borrow power; only `amount` leaves the pool.
  const newDebtUsd = price18 ? usdFromTokenAmount(debtAdded, token.decimals, price18) : 0
  const receiveUsd = price18 ? usdFromTokenAmount(amt, token.decimals, price18) : 0
  const feeUsd = price18 ? usdFromTokenAmount(fee, token.decimals, price18) : 0
  const exceedsPower = newDebtUsd > availableUsd
  const noLiquidity = market?.loading === false && market.totalSupply === 0
  const exceedsLiquidity = market?.liquidityUsd !== null && market?.liquidityUsd !== undefined && receiveUsd > market.liquidityUsd

  // Max you can borrow so that amount + fee fits in the available power and liquidity.
  const maxUsd = Math.min(availableUsd / (1 + feeBps / 10_000), market?.liquidityUsd ?? Infinity) * 0.999
  const maxTokens = priceUsd ? Math.max(maxUsd / priceUsd, 0) : 0
  const max = maxTokens > 0 ? maxTokens.toFixed(token.decimals > 6 ? 6 : token.decimals) : undefined

  const liqCollUsd = COLLATERAL_TOKENS.reduce((acc, s) => {
    const p = prices[s]
    if (!p) return acc
    const m = markets.find(x => x.symbol === s)
    return acc + usdFromTokenAmount(position.supplies[s], TOKENS[s].decimals, p) * ((m?.liqThreshold ?? 0) / 100)
  }, 0)
  const previewHf = amt > 0n && liqCollUsd > 0 ? liqCollUsd / (currentDebtUsd + newDebtUsd) : null

  const projectedApr = useProjectedBorrowApr(symbol, debtAdded)
  const borrowApr = projectedApr ?? market?.borrowApr ?? 0
  const estInterestUsd = amt > 0n ? newDebtUsd * (borrowApr / 100) * (durationDays / 365) : 0
  const dueDate = nowMs > 0 ? new Date(nowMs + durationDays * 86_400_000) : null
  const hasCollateral = COLLATERAL_TOKENS.some(s => position.supplies[s] > 0n)

  const { borrow } = useBorrow()
  const blocked = amt === 0n || exceedsPower || exceedsLiquidity || noLiquidity || !price18

  async function submit() {
    setPending(true); setBusy(true)
    try {
      const hash = await borrow(symbol, amt, durationDays)
      toastTx(`Borrowed ${amount} ${symbol}`, hash,
        <>Due {dueDate?.toLocaleDateString()}{fee > 0n && ` · fee ${formatToken(fee, token.decimals)} ${symbol} added to debt`} · </>)
      onDone()
    } catch (e) {
      toast.error('Borrow failed', { description: errMsg(e) })
    } finally {
      setPending(false); setBusy(false)
    }
  }

  if (!hasCollateral && !position.loading) {
    return (
      <div>
        <Notice tone="info">
          Borrowing needs collateral. Supply cirBTC or WETH first; you can then borrow up to its loan-to-value limit.
        </Notice>
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
        max={max}
        balanceLabel="Available"
        balance={priceUsd ? `${maxTokens.toLocaleString('en-US', { maximumFractionDigits: 2 })} ${symbol}` : '—'}
        usdEquiv={amt > 0n && price18 ? receiveUsd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : undefined}
        invalid={exceedsPower}
        id="borrow-amount"
      />

      <fieldset className="mt-5">
        <legend className="mb-2 text-sm text-[var(--color-muted-foreground)]">Loan term</legend>
        <div className="grid grid-cols-6 gap-1.5 rounded-[14px] bg-[var(--color-background)] p-1 border border-[var(--color-border)]">
          {LOAN_DURATIONS_DAYS.map(d => (
            <button
              key={d}
              type="button"
              onClick={() => setDurationDays(d)}
              aria-pressed={durationDays === d}
              className={clsx(
                'h-9 rounded-[10px] text-xs font-semibold transition-base cursor-pointer',
                durationDays === d
                  ? 'bg-[var(--color-foreground)] text-[var(--color-background)]'
                  : 'text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)] hover:bg-[var(--color-muted)]',
              )}
            >
              {d}d
            </button>
          ))}
        </div>
        <p className="mt-2 text-xs text-[var(--color-muted-foreground)]">
          Repay any time, no penalty. Liquidation depends only on your health factor.
        </p>
      </fieldset>

      {noLiquidity && <Notice tone="warning">No {symbol} has been supplied to the pool yet, so there is nothing to borrow.</Notice>}
      {!noLiquidity && exceedsLiquidity && <Notice tone="danger">Amount exceeds the {symbol} available in the pool.</Notice>}
      {exceedsPower && <Notice tone="danger">Amount{fee > 0n ? ' plus fee' : ''} exceeds your available borrow power.</Notice>}
      {!price18 && <Notice tone="warning">The {symbol} price is temporarily unavailable, so borrowing is paused.</Notice>}

      <Overview>
        <StatRow label={amt > 0n ? 'Borrow APR (after this loan)' : 'Borrow APR'} mono value={`${borrowApr.toFixed(2)}%`} />
        <StatRow
          label={`Origination fee (${(feeBps / 100).toFixed(2)}%)`}
          mono
          value={amt > 0n ? `${formatToken(fee, token.decimals)} ${symbol}` : `${(feeBps / 100).toFixed(2)}%`}
        />
        {dueDate && (
          <StatRow label="Due date" mono value={dueDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} />
        )}
        {amt > 0n && (
          <>
            <StatRow label="You receive" mono value={<span className="text-[var(--color-success)]">{formatToken(amt, token.decimals)} {symbol}</span>} />
            <StatRow label="Debt added (amount + fee)" mono value={`${formatToken(debtAdded, token.decimals)} ${symbol}`} />
            <StatRow label={`Est. interest (${durationDays}d)`} mono value={`≈ ${fmtUsd(estInterestUsd)}`} />
            <StatRow label="Total cost (fee + interest)" mono value={`≈ ${fmtUsd(feeUsd + estInterestUsd)}`} />
            <StatRow label="Repay by due date" mono value={<span className="font-semibold">≈ {fmtUsd(newDebtUsd + estInterestUsd)}</span>} />
          </>
        )}
        {position.healthFactor !== null && (
          <StatRow label="Health factor" value={<HealthFactor value={position.healthFactor} preview={previewHf} size="sm" bare />} />
        )}
      </Overview>
      {previewHf !== null && previewHf < 1.2 && !exceedsPower && (
        <Notice tone="warning">Your health factor would drop below 1.2. A small price move could trigger liquidation.</Notice>
      )}

      <Button variant="primary" size="lg" className="w-full mt-5" loading={pending} disabled={blocked} onClick={() => void submit()}>
        {amt === 0n ? 'Enter an amount' : `Borrow ${symbol}`}
      </Button>
      <div className="mt-4"><RiskDisclosure /></div>
    </div>
  )
}
