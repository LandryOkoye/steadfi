/**
 * Withdraw — withdraw supplied assets with live HF / borrow-power checks.
 * All values are live chain reads; no price table.
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
  SYMBOLS, useUserPosition, useWithdraw, useMarketData, useOraclePrices,
} from '../hooks/useSteadFi'
import {
  TOKENS, TokenSymbol, formatToken, txUrl, usdFromTokenAmount,
} from '../lib/steadfi'

export default function Withdraw() {
  const { isConnected } = useAccount()
  const [asset, setAsset] = useState<TokenSymbol>('USDC')
  const [amount, setAmount] = useState('')
  const [busy, setBusy] = useState(false)

  const position = useUserPosition()
  const markets = useMarketData()
  const { prices } = useOraclePrices()

  const token = TOKENS[asset]
  const decimals = token.decimals
  const supplyRaw = position.supplies[asset]
  const supplyFormatted = formatToken(supplyRaw, decimals)
  const market = markets.find(m => m.symbol === asset)
  const price18 = prices[asset]

  const amountBig = amount ? parseUnits(amount, decimals) : 0n
  const numAmount = parseFloat(amount) || 0
  const withdrawUsd = price18 ? usdFromTokenAmount(amountBig, decimals, price18) : 0

  const totalDebtUsd = Number(position.totalDebtRay) / 1e18
  const borrowPowerUsd = Number(position.borrowPowerRay) / 1e18
  const powerLost = token.collateralEnabled && market
    ? withdrawUsd * (market.ltv / 100)
    : 0
  const exceedsBorrowPower = totalDebtUsd > 0 && (borrowPowerUsd - powerLost) < totalDebtUsd
  const exceedsLiquidity = market?.liquidityUsd !== null && market?.liquidityUsd !== undefined
    ? withdrawUsd > market.liquidityUsd
    : false

  // Preview HF using live prices and on-chain liq thresholds.
  const previewHf = (() => {
    if (position.healthFactor === null) return null
    if (!numAmount) return position.healthFactor
    if (!token.collateralEnabled) return position.healthFactor

    const liqCollateralUsd = SYMBOLS.reduce((acc, sym) => {
      const p = prices[sym]
      if (!p) return acc
      const remaining = sym === asset
        ? (supplyRaw > amountBig ? supplyRaw - amountBig : 0n)
        : position.supplies[sym]
      const m = markets.find(x => x.symbol === sym)
      const usd = usdFromTokenAmount(remaining, TOKENS[sym].decimals, p)
      return acc + usd * ((m?.liqThreshold ?? 0) / 100)
    }, 0)

    if (totalDebtUsd <= 0) return null
    return liqCollateralUsd / totalDebtUsd
  })()

  const { withdraw } = useWithdraw()

  async function handleWithdraw() {
    if (!numAmount || !amountBig) return
    if (exceedsBorrowPower || exceedsLiquidity) {
      toast.error('This withdrawal would leave the position undercollateralized.')
      return
    }
    setBusy(true)
    try {
      const hash = await withdraw(asset, amountBig)
      toast.success(`Withdrew ${amount} ${asset}`, {
        description: (
          <a href={txUrl(hash)} target="_blank" rel="noreferrer"
             className="underline text-xs">View on explorer</a>
        ),
      })
      setAmount('')
    } catch (e: unknown) {
      toast.error('Withdraw failed', { description: e instanceof Error ? e.message : String(e) })
    } finally {
      setBusy(false)
    }
  }

  // Only show assets the user has supplied.
  const availableAssets = position.loading
    ? SYMBOLS
    : SYMBOLS.filter(sym => position.supplies[sym] > 0n)

  return (
    <div className="max-w-lg mx-auto space-y-5">
      <div>
        <h1 className="text-2xl font-bold" style={{ fontFamily: 'var(--font-heading)' }}>Withdraw</h1>
        <p className="text-sm text-[var(--color-muted-foreground)] mt-1">
          Withdraw your supplied assets when liquidity is available.
        </p>
      </div>

      {previewHf !== null && position.healthFactor !== null && (
        <Card>
          <CardHeader><CardTitle>Health Factor Preview</CardTitle></CardHeader>
          <HealthFactor value={position.healthFactor} preview={previewHf} size="lg" />
          {previewHf < 1.2 && (
            <p className="text-xs text-[var(--color-warning)] mt-2">
              Warning: withdrawing this amount would bring your HF below 1.2.
            </p>
          )}
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle>Withdraw asset</CardTitle></CardHeader>

        {!isConnected ? (
          <p className="text-sm text-[var(--color-muted-foreground)] py-2">
            Connect your wallet to withdraw.
          </p>
        ) : availableAssets.length === 0 && !position.loading ? (
          <p className="text-sm text-[var(--color-muted-foreground)] py-2">
            No supplied positions to withdraw.
          </p>
        ) : (
          <>
            <div className="flex flex-wrap gap-2 mb-5">
              {(availableAssets.length > 0 ? availableAssets : SYMBOLS).map(sym => (
                <button
                  key={sym}
                  onClick={() => { setAsset(sym); setAmount('') }}
                  className={`flex-1 min-w-[4rem] py-2 rounded-xl border text-sm font-semibold transition-base cursor-pointer
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
              label="Amount to withdraw"
              value={amount}
              onChange={setAmount}
              max={supplyFormatted.replace(/,/g, '')}
              symbol={asset}
              usdEquiv={price18 && withdrawUsd > 0
                ? withdrawUsd.toLocaleString('en-US', { minimumFractionDigits: 2 })
                : undefined}
              id="withdraw-amount"
            />

            <div className="mt-5 space-y-0">
              <StatRow
                label="Supplied balance"
                value={
                  position.loading
                    ? <span className="text-xs text-[var(--color-muted-foreground)]">loading…</span>
                    : <span className="mono">{supplyFormatted} {asset}</span>
                }
              />
              {market && (
                <StatRow
                  label={token.collateralEnabled ? 'Collateral' : 'Supply APY'}
                  value={
                    token.collateralEnabled
                      ? <span className="text-[var(--color-accent)] text-xs font-medium">LTV {market.ltv.toFixed(0)}% / Liq {market.liqThreshold.toFixed(0)}%</span>
                      : <span className="text-[var(--color-success)] mono">{market.supplyApy.toFixed(2)}%</span>
                  }
                />
              )}
              {exceedsBorrowPower && (
                <p className="text-xs text-[var(--color-danger)] font-medium mt-2">
                  Withdrawing this amount would exceed your remaining borrow power.
                </p>
              )}
              {exceedsLiquidity && (
                <p className="text-xs text-[var(--color-danger)] font-medium mt-2">
                  Amount exceeds available market liquidity.
                </p>
              )}
            </div>

            <Button
              variant="primary"
              className="w-full mt-5"
              loading={busy}
              disabled={!numAmount || supplyRaw === 0n || exceedsBorrowPower || exceedsLiquidity || !price18}
              onClick={() => { void handleWithdraw() }}
            >
              Withdraw {asset}
            </Button>
          </>
        )}
      </Card>

      <RiskDisclosure />
    </div>
  )
}
