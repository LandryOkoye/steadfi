/**
 * Positions — live supply + borrow positions from LendingPool.
 * Valuations use on-chain oracle prices; missing/stale prices are shown as "—".
 */
import { Card, CardHeader, CardTitle } from '../components/ui/Card'
import StatRow from '../components/ui/StatRow'
import HealthFactor from '../components/ui/HealthFactor'
import { ArrowCircleDown, ArrowCircleUp, ShieldCheck, Warning } from '@phosphor-icons/react'
import { useAccount } from 'wagmi'
import { useUserPosition, useMarketData, useOraclePrices, SYMBOLS } from '../hooks/useSteadFi'
import {
  TOKENS, TokenSymbol, formatToken, usdFromTokenAmount,
  COLLATERAL_TOKENS, BORROW_TOKENS,
} from '../lib/steadfi'

function fmtUsd(v: number | null): string {
  return v === null ? '—' : `$${v.toLocaleString('en-US', { maximumFractionDigits: 0 })}`
}

export default function Positions() {
  const { address, isConnected } = useAccount()
  const position = useUserPosition()
  const markets = useMarketData()
  const { prices } = useOraclePrices()

  if (!isConnected) {
    return (
      <div className="max-w-4xl mx-auto">
        <h1 className="text-2xl font-bold mb-4" style={{ fontFamily: 'var(--font-heading)' }}>My Positions</h1>
        <Card>
          <p className="text-[var(--color-muted-foreground)] text-sm py-4 text-center">
            Connect your wallet to view your positions.
          </p>
        </Card>
      </div>
    )
  }

  if (position.loading) {
    return (
      <div className="max-w-4xl mx-auto">
        <h1 className="text-2xl font-bold mb-4" style={{ fontFamily: 'var(--font-heading)' }}>My Positions</h1>
        <Card>
          <p className="text-[var(--color-muted-foreground)] text-sm py-4 text-center">Loading positions…</p>
        </Card>
      </div>
    )
  }

  const usdOf = (sym: TokenSymbol, amount: bigint): number | null => {
    const p = prices[sym]
    if (!p) return null
    return usdFromTokenAmount(amount, TOKENS[sym].decimals, p)
  }

  const sumUsd = (symbols: TokenSymbol[], getAmount: (s: TokenSymbol) => bigint): number | null => {
    let total = 0
    for (const sym of symbols) {
      const amount = getAmount(sym)
      if (amount === 0n) continue
      const usd = usdOf(sym, amount)
      if (usd === null) return null
      total += usd
    }
    return total
  }

  const totalCollateralUsd = sumUsd(COLLATERAL_TOKENS, s => position.supplies[s])
  const totalLendingUsd = sumUsd(BORROW_TOKENS, s => position.supplies[s])
  const totalDebtUsd = sumUsd(BORROW_TOKENS, s => position.debts[s])
  const totalSuppliedUsd = totalCollateralUsd !== null && totalLendingUsd !== null
    ? totalCollateralUsd + totalLendingUsd
    : null
  const netUsd = totalSuppliedUsd !== null && totalDebtUsd !== null
    ? totalSuppliedUsd - totalDebtUsd
    : null

  const supplyPositions = SYMBOLS
    .map(sym => ({
      sym,
      balance: position.supplies[sym],
      decimals: TOKENS[sym].decimals,
      usdValue: usdOf(sym, position.supplies[sym]),
      apy: markets.find(m => m.symbol === sym)?.supplyApy ?? 0,
      isCollateral: TOKENS[sym].collateralEnabled,
    }))
    .filter(p => p.balance > 0n)

  const borrowPositions = BORROW_TOKENS
    .map(sym => ({
      sym,
      debt: position.debts[sym],
      decimals: TOKENS[sym].decimals,
      usdValue: usdOf(sym, position.debts[sym]),
      apr: markets.find(m => m.symbol === sym)?.borrowApr ?? 0,
    }))
    .filter(p => p.debt > 0n)

  const hf = position.healthFactor
  const noPosition = supplyPositions.length === 0 && borrowPositions.length === 0

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold" style={{ fontFamily: 'var(--font-heading)' }}>My Positions</h1>
        <p className="text-sm text-[var(--color-muted-foreground)] mt-1">
          Your live supply and borrow positions on SteadFi — {address?.slice(0, 6)}…{address?.slice(-4)}.
        </p>
      </div>

      {noPosition ? (
        <Card>
          <p className="text-[var(--color-muted-foreground)] text-sm py-4 text-center">
            No active positions. Supply USDC/EURC to earn interest, or deposit cirBTC/WETH to borrow.
          </p>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="md:col-span-1">
              <CardHeader><CardTitle>Health Factor</CardTitle></CardHeader>
              {hf !== null ? (
                <>
                  <HealthFactor value={hf} size="lg" />
                  <p className="text-xs text-[var(--color-muted-foreground)] mt-3 flex items-center gap-1">
                    {position.isHealthy
                      ? <><ShieldCheck size={12} aria-hidden="true" className="text-[var(--color-success)]" /> Your position is safe</>
                      : <><Warning size={12} aria-hidden="true" className="text-[var(--color-warning)]" /> Below liquidation threshold!</>
                    }
                  </p>
                </>
              ) : (
                <p className="text-sm text-[var(--color-muted-foreground)]">No debt — HF not applicable</p>
              )}
            </Card>

            <Card>
              <p className="text-xs text-[var(--color-muted-foreground)] font-medium">Total Supplied</p>
              <p className="text-3xl font-bold mono text-[var(--color-foreground)] mt-2">
                {fmtUsd(totalSuppliedUsd)}
              </p>
              <p className="text-xs text-[var(--color-muted-foreground)] mt-1">Collateral + lending</p>
            </Card>

            <Card>
              <p className="text-xs text-[var(--color-muted-foreground)] font-medium">Net Position</p>
              <p className={`text-3xl font-bold mono mt-2 ${netUsd === null ? '' : netUsd >= 0 ? 'text-[var(--color-success)]' : 'text-[var(--color-warning)]'}`}>
                {fmtUsd(netUsd)}
              </p>
              <p className="text-xs text-[var(--color-muted-foreground)] mt-1">Collateral + lend − debt</p>
            </Card>
          </div>

          {supplyPositions.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>
                  <ArrowCircleDown size={16} className="inline text-[var(--color-success)] mr-1" aria-hidden="true" />
                  Supply Positions
                </CardTitle>
              </CardHeader>
              <div className="space-y-0">
                {supplyPositions.map(p => (
                  <StatRow
                    key={p.sym}
                    label={p.sym}
                    value={
                      <span className="mono">
                        {formatToken(p.balance, p.decimals)} {p.sym}
                        <span className="text-[var(--color-muted-foreground)] ml-2">
                          ({fmtUsd(p.usdValue)})
                        </span>
                        {p.isCollateral ? (
                          <span className="text-[var(--color-accent)] ml-2 text-xs">Collateral</span>
                        ) : (
                          <span className="text-[var(--color-success)] ml-2 text-xs">
                            {p.apy.toFixed(2)}% APY
                          </span>
                        )}
                      </span>
                    }
                  />
                ))}
              </div>
            </Card>
          )}

          {borrowPositions.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>
                  <ArrowCircleUp size={16} className="inline text-[var(--color-warning)] mr-1" aria-hidden="true" />
                  Borrow Positions
                </CardTitle>
              </CardHeader>
              <div className="space-y-0">
                {borrowPositions.map(p => (
                  <StatRow
                    key={p.sym}
                    label={p.sym}
                    value={
                      <span className="mono">
                        {formatToken(p.debt, p.decimals)} {p.sym}
                        <span className="text-[var(--color-muted-foreground)] ml-2">
                          ({fmtUsd(p.usdValue)})
                        </span>
                        <span className="text-[var(--color-warning)] ml-2 text-xs">
                          {p.apr.toFixed(2)}% APR
                        </span>
                      </span>
                    }
                  />
                ))}
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  )
}
