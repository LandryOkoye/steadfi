/**
 * Borrow — borrow USDC or EURC against cirBTC/WETH collateral.
 * Health factor, borrow power, prices and rates are all live on-chain reads.
 * Loan duration: predefined terms (7/14/30/60/90/180 days) chosen at borrow
 * time; the due date is recorded on-chain via borrowWithTerm.
 */
import { useState } from 'react'
import { Card, CardHeader, CardTitle } from '../components/ui/Card'
import Button from '../components/ui/Button'
import AmountInput from '../components/ui/AmountInput'
import StatRow from '../components/ui/StatRow'
import HealthFactor from '../components/ui/HealthFactor'
import RiskDisclosure from '../components/ui/RiskDisclosure'
import { toast } from 'sonner'
import { parseUnits } from 'viem'
import { useAccount } from 'wagmi'
import {
  useUserPosition, useBorrow, useMarketData, useOraclePrices, LOAN_DURATIONS_DAYS, useNowMs,
} from '../hooks/useSteadFi'
import {
  BORROW_TOKENS, COLLATERAL_TOKENS, TOKENS, TokenSymbol, formatToken, txUrl,
  usdFromTokenAmount,
} from '../lib/steadfi'

export default function Borrow() {
  const { isConnected } = useAccount()
  const [asset, setAsset] = useState<TokenSymbol>('USDC')
  const [amount, setAmount] = useState('')
  const [durationDays, setDurationDays] = useState<number>(30)
  const [busy, setBusy] = useState(false)

  const position = useUserPosition()
  const markets = useMarketData()
  const { prices } = useOraclePrices()
  const market = markets.find(m => m.symbol === asset)

  const numAmount = parseFloat(amount) || 0
  const decimals = TOKENS[asset].decimals
  const amountBig = amount ? parseUnits(amount, decimals) : 0n
  const price18 = prices[asset]

  // Borrow power and current debt, both read from LendingPool (Ray USD).
  const borrowPowerUsd = Number(position.borrowPowerRay) / 1e18
  const currentDebtUsd = Number(position.totalDebtRay) / 1e18
  const availableUsd = Math.max(borrowPowerUsd - currentDebtUsd, 0)
  const availableAsset = price18 ? availableUsd / (Number(price18) / 1e18) : null

  const newBorrowUsd = price18 ? usdFromTokenAmount(amountBig, decimals, price18) : 0
  const exceedsBorrowPower = newBorrowUsd > availableUsd
  const exceedsLiquidity = market?.liquidityUsd !== null && market?.liquidityUsd !== undefined
    ? newBorrowUsd > market.liquidityUsd
    : false

  // Preview HF from live oracle prices and on-chain liq thresholds.
  const liqCollateralUsd = COLLATERAL_TOKENS.reduce((acc, sym) => {
    const p = prices[sym]
    if (!p) return acc
    const m = markets.find(x => x.symbol === sym)
    const usd = usdFromTokenAmount(position.supplies[sym], TOKENS[sym].decimals, p)
    return acc + usd * ((m?.liqThreshold ?? 0) / 100)
  }, 0)
  const previewHf = numAmount > 0 && liqCollateralUsd > 0
    ? liqCollateralUsd / (currentDebtUsd + newBorrowUsd)
    : position.healthFactor

  const { borrow } = useBorrow()
  const nowMs = useNowMs()

  // Due date + estimated interest for the selected term (simple APR projection).
  const dueDate = durationDays > 0 && nowMs > 0
    ? new Date(nowMs + durationDays * 86_400_000)
    : null
  const borrowApr = market?.borrowApr ?? 0
  const estInterestUsd = numAmount > 0 && price18
    ? usdFromTokenAmount(amountBig, decimals, price18) * (borrowApr / 100) * (durationDays / 365)
    : 0

  async function handleBorrow() {
    if (!numAmount || !amountBig) return
    if (exceedsBorrowPower) {
      toast.error('This borrow exceeds your available borrow power.')
      return
    }
    setBusy(true)
    const due = new Date(Date.now() + durationDays * 86_400_000)
    try {
      const hash = await borrow(asset, amountBig, durationDays)
      toast.success(`Borrowed ${amount} ${asset}`, {
        description: (
          <span className="text-xs">
            {durationDays > 0 && `Term: ${durationDays} days · due ${due.toLocaleDateString()} · `}
            <a href={txUrl(hash)} target="_blank" rel="noreferrer" className="underline">View on explorer</a>
          </span>
        ),
      })
      setAmount('')
    } catch (e: unknown) {
      toast.error('Borrow failed', { description: e instanceof Error ? e.message : String(e) })
    } finally {
      setBusy(false)
    }
  }

  const currentHf = position.healthFactor

  return (
    <div className="max-w-lg mx-auto space-y-5">
      <div>
        <h1 className="text-2xl font-bold" style={{ fontFamily: 'var(--font-heading)' }}>Borrow</h1>
        <p className="text-sm text-[var(--color-muted-foreground)] mt-1">
          Borrow USDC or EURC against your cirBTC or WETH collateral. Gas is paid in USDC — no ETH needed.
        </p>
      </div>

      <Card>
        <CardHeader><CardTitle>Health Factor</CardTitle></CardHeader>
        {position.loading ? (
          <p className="text-sm text-[var(--color-muted-foreground)]">Loading…</p>
        ) : currentHf !== null ? (
          <HealthFactor value={currentHf} preview={previewHf} size="lg" />
        ) : (
          <p className="text-sm text-[var(--color-muted-foreground)]">
            No active position — supply cirBTC or WETH as collateral first.
          </p>
        )}
        <p className="text-xs text-[var(--color-muted-foreground)] mt-2">
          Positions below 1.0 can be liquidated. Stay above 1.5 for safety.
        </p>
      </Card>

      <Card>
        <CardHeader><CardTitle>Your collateral</CardTitle></CardHeader>
        <div className="space-y-0">
          {COLLATERAL_TOKENS.map(sym => {
            const p = prices[sym]
            const usd = p ? usdFromTokenAmount(position.supplies[sym], TOKENS[sym].decimals, p) : null
            return (
              <StatRow
                key={sym}
                label={sym}
                value={
                  <span className="mono">
                    {formatToken(position.supplies[sym], TOKENS[sym].decimals)} {sym}
                    {usd !== null && <span className="text-[var(--color-muted-foreground)]"> · ${usd.toLocaleString('en-US', { maximumFractionDigits: 2 })}</span>}
                  </span>
                }
              />
            )
          })}
          <StatRow
            label="Borrow power"
            value={<span className="mono text-[var(--color-accent)]">${borrowPowerUsd.toLocaleString('en-US', { maximumFractionDigits: 2 })}</span>}
          />
          <StatRow
            label="Outstanding debt"
            value={<span className="mono">${currentDebtUsd.toLocaleString('en-US', { maximumFractionDigits: 2 })}</span>}
          />
          <StatRow
            label="Available to borrow"
            value={
              availableAsset === null
                ? <span className="text-xs text-[var(--color-warning)]">Price unavailable</span>
                : <span className="mono">${availableUsd.toLocaleString('en-US', { maximumFractionDigits: 2 })}</span>
            }
          />
        </div>
      </Card>

      <Card>
        <CardHeader><CardTitle>Borrow asset</CardTitle></CardHeader>
        <p className="text-xs text-[var(--color-muted-foreground)] mb-3">
          Only USDC and EURC can be borrowed. Deposit cirBTC or WETH as collateral to unlock borrowing.
        </p>

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
          label={`Amount to borrow (${asset})`}
          value={amount}
          onChange={setAmount}
          symbol={asset}
          usdEquiv={price18 && numAmount > 0
            ? (numAmount * (Number(price18) / 1e18)).toLocaleString('en-US', { minimumFractionDigits: 2 })
            : undefined}
          id="borrow-amount"
        />

        <div className="mt-5">
          <p className="text-xs font-medium text-[var(--color-muted-foreground)] mb-2">
            Loan duration
          </p>
          <div className="grid grid-cols-3 md:grid-cols-6 gap-2" role="group" aria-label="Loan duration">
            {LOAN_DURATIONS_DAYS.map(d => (
              <button
                key={d}
                onClick={() => setDurationDays(d)}
                className={`py-2 rounded-xl border text-sm font-semibold transition-base cursor-pointer
                  ${durationDays === d
                    ? 'border-[var(--color-primary)] bg-[var(--color-muted)] text-[var(--color-primary)]'
                    : 'border-[var(--color-border)] text-[var(--color-muted-foreground)] hover:border-[var(--color-primary)]'
                  }`}
                aria-pressed={durationDays === d}
              >
                {d}d
              </button>
            ))}
          </div>
          <p className="text-[11px] text-[var(--color-muted-foreground)] mt-2">
            Repay any time before or after the due date. Liquidation depends only on your health factor.
          </p>
        </div>

        <div className="mt-5 space-y-0">
          <StatRow
            label="Borrow APR"
            value={
              market?.loading
                ? <span className="text-xs text-[var(--color-muted-foreground)]">loading…</span>
                : <span className="text-[var(--color-warning)] mono">{market?.borrowApr.toFixed(2)}%</span>
            }
          />
          {dueDate && (
            <StatRow
              label="Due date"
              value={<span className="mono text-[var(--color-accent)]">{dueDate.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })} ({durationDays} days)</span>}
            />
          )}
          {dueDate && numAmount > 0 && (
            <StatRow
              label={`Est. interest (${durationDays}d)`}
              value={<span className="mono text-[var(--color-warning)]">≈ ${estInterestUsd.toFixed(2)}</span>}
            />
          )}
          <StatRow
            label="Available liquidity"
            value={
              market?.liquidityUsd !== null && market?.liquidityUsd !== undefined
                ? <span className="mono">${market.liquidityUsd.toLocaleString('en-US', { maximumFractionDigits: 0 })}</span>
                : <span className="text-xs text-[var(--color-warning)]">Unavailable</span>
            }
          />
          {exceedsBorrowPower && (
            <p className="text-xs text-[var(--color-danger)] font-medium mt-2">
              Amount exceeds your available borrow power.
            </p>
          )}
          {exceedsLiquidity && (
            <p className="text-xs text-[var(--color-danger)] font-medium mt-2">
              Amount exceeds available market liquidity.
            </p>
          )}
          {!exceedsBorrowPower && previewHf !== null && position.healthFactor !== null && previewHf < 1.2 && (
            <p className="text-xs text-[var(--color-warning)] font-medium mt-2">
              Warning: health factor would drop below 1.2.
            </p>
          )}
        </div>

        {isConnected ? (
          <Button
            variant="primary"
            className="w-full mt-5"
            loading={busy}
            disabled={!numAmount || exceedsBorrowPower || exceedsLiquidity || !price18}
            onClick={() => { void handleBorrow() }}
          >
            Borrow {asset}
          </Button>
        ) : (
          <p className="mt-5 text-center text-sm text-[var(--color-muted-foreground)]">
            Connect your wallet to borrow
          </p>
        )}
      </Card>

      <RiskDisclosure />
    </div>
  )
}
