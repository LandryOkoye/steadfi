/**
 * Borrow — borrow USDC or EURC against cirBTC/WETH collateral.
 * Live health factor preview. No mocks.
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
  useUserPosition, useBorrow, useMarketData,
} from '../hooks/useSteadFi'
import { BORROW_TOKENS, COLLATERAL_TOKENS, TOKENS, TokenSymbol, txUrl } from '../lib/steadfi'

// Rough price table for HF preview (oracle prices not directly readable as view from UI)
const APPROX_PRICE: Record<TokenSymbol, number> = {
  USDC: 1.00, EURC: 1.08, cirBTC: 85_000, WETH: 2_500,
}

export default function Borrow() {
  const { isConnected } = useAccount()
  const [asset, setAsset] = useState<TokenSymbol>('USDC')
  const [amount, setAmount] = useState('')
  const [busy, setBusy] = useState(false)

  const position = useUserPosition()
  const markets = useMarketData()
  const market = markets.find(m => m.symbol === asset)

  const numAmount = parseFloat(amount) || 0
  const decimals = TOKENS[asset].decimals
  const amountBig = amount ? parseUnits(amount, decimals) : 0n

  // Preview health factor: estimate using current positions + new borrow
  // HF = (sum of collateral × liqThreshold) / (current debt USD + new borrow USD)
  const previewHf = (() => {
    if (!position.healthFactor) return null
    if (!numAmount) return position.healthFactor

    // current debt in USD (rough)
    const debtUsd = BORROW_TOKENS.reduce((acc, sym) => {
      const debtAmt = Number(position.debts[sym]) / (10 ** TOKENS[sym].decimals)
      return acc + debtAmt * APPROX_PRICE[sym]
    }, 0)

    // collateral USD weighted by liqThreshold
    const collUsd = COLLATERAL_TOKENS.reduce((acc, sym) => {
      const supplyAmt = Number(position.supplies[sym]) / (10 ** TOKENS[sym].decimals)
      const m = markets.find(x => x.symbol === sym)
      return acc + supplyAmt * APPROX_PRICE[sym] * ((m?.liqThreshold ?? 78) / 100)
    }, 0)

    const newDebtUsd = debtUsd + numAmount * APPROX_PRICE[asset]
    if (newDebtUsd <= 0) return null
    return collUsd / newDebtUsd
  })()

  const belowSafe = previewHf !== null && previewHf < 1.2

  const { borrow } = useBorrow()

  async function handleBorrow() {
    if (!numAmount || !amountBig) return
    if (previewHf !== null && previewHf < 1.0) {
      toast.error('This borrow would put your position below liquidation threshold.')
      return
    }
    setBusy(true)
    try {
      const hash = await borrow(asset, amountBig)
      toast.success(`Borrowed ${amount} ${asset}`, {
        description: (
          <a href={txUrl(hash)} target="_blank" rel="noreferrer"
             className="underline text-xs">View on explorer</a>
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
          usdEquiv={numAmount > 0 ? (numAmount * APPROX_PRICE[asset]).toLocaleString('en-US', { minimumFractionDigits: 2 }) : undefined}
          id="borrow-amount"
        />

        <div className="mt-5 space-y-0">
          <StatRow
            label="Borrow APR"
            value={
              market?.loading
                ? <span className="text-xs text-[var(--color-muted-foreground)]">loading…</span>
                : <span className="text-[var(--color-warning)] mono">{(market?.borrowApr ?? 0).toFixed(2)}%</span>
            }
          />
          <StatRow
            label="Available liquidity"
            value={
              market
                ? <span className="mono">${market.liquidityUsd.toLocaleString('en-US', { maximumFractionDigits: 0 })}</span>
                : '—'
            }
          />
          {belowSafe && (
            <p className="text-xs text-[var(--color-warning)] font-medium mt-2">
              Warning: health factor below 1.2. Consider reducing the borrow amount.
            </p>
          )}
        </div>

        {isConnected ? (
          <Button
            variant="primary"
            className="w-full mt-5"
            loading={busy}
            disabled={!numAmount || (previewHf !== null && previewHf < 1.0)}
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
