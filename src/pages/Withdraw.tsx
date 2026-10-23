/**
 * Withdraw — withdraw supplied assets with live HF preview.
 * Live supply reads from chain. No mocks.
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
  useUserPosition, useWithdraw, useMarketData,
} from '../hooks/useSteadFi'
import { TOKENS, TokenSymbol, formatToken, txUrl, COLLATERAL_TOKENS, BORROW_TOKENS } from '../lib/steadfi'

const ALL_TOKENS: TokenSymbol[] = [...COLLATERAL_TOKENS, ...BORROW_TOKENS] as TokenSymbol[]

const APPROX_PRICE: Record<TokenSymbol, number> = {
  USDC: 1.00, EURC: 1.08, cirBTC: 85_000, WETH: 2_500,
}

export default function Withdraw() {
  const { isConnected } = useAccount()
  const [asset, setAsset] = useState<TokenSymbol>('USDC')
  const [amount, setAmount] = useState('')
  const [busy, setBusy] = useState(false)

  const position = useUserPosition()
  const markets = useMarketData()

  const decimals = TOKENS[asset].decimals
  const supplyRaw = position.supplies[asset]
  const supplyFormatted = formatToken(supplyRaw, decimals)
  const market = markets.find(m => m.symbol === asset)

  const amountBig = amount ? parseUnits(amount, decimals) : 0n
  const numAmount = parseFloat(amount) || 0

  // Preview HF: reduce collateral USD by withdrawal amount (only for collateral assets)
  const previewHf = (() => {
    if (!position.healthFactor) return null
    if (!numAmount) return position.healthFactor
    if (!TOKENS[asset].collateralEnabled) return position.healthFactor

    // current debt in USD
    const debtUsd = BORROW_TOKENS.reduce((acc, sym) => {
      const amt = Number(position.debts[sym]) / (10 ** TOKENS[sym].decimals)
      return acc + amt * APPROX_PRICE[sym]
    }, 0)

    if (debtUsd === 0) return null

    // weighted collateral after withdrawal
    const collUsd = ALL_TOKENS.filter(s => TOKENS[s].collateralEnabled).reduce((acc, sym) => {
      const existing = Number(position.supplies[sym]) / (10 ** TOKENS[sym].decimals)
      const remove = sym === asset ? numAmount : 0
      const m = markets.find(x => x.symbol === sym)
      return acc + Math.max(0, existing - remove) * APPROX_PRICE[sym] * ((m?.liqThreshold ?? 78) / 100)
    }, 0)

    return collUsd / debtUsd
  })()

  const { withdraw } = useWithdraw()

  async function handleWithdraw() {
    if (!numAmount || !amountBig) return
    if (previewHf !== null && previewHf < 1.0) {
      toast.error('This withdrawal would put your position below liquidation threshold.')
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

  // Only show assets user has supplied
  const availableAssets = ALL_TOKENS.filter(sym => {
    if (position.loading) return true
    return position.supplies[sym] > 0n
  })

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
              {(availableAssets.length > 0 ? availableAssets : ALL_TOKENS).map(sym => (
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
                  label={TOKENS[asset].collateralEnabled ? 'Collateral' : 'Supply APY'}
                  value={
                    TOKENS[asset].collateralEnabled
                      ? <span className="text-[var(--color-accent)] text-xs font-medium">LTV {market.ltv.toFixed(0)}% / Liq {market.liqThreshold.toFixed(0)}%</span>
                      : <span className="text-[var(--color-success)] mono">{market.supplyApy.toFixed(2)}%</span>
                  }
                />
              )}
            </div>

            <Button
              variant="primary"
              className="w-full mt-5"
              loading={busy}
              disabled={!numAmount || supplyRaw === 0n || (previewHf !== null && previewHf < 1.0)}
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
