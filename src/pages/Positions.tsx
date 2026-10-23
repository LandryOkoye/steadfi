/**
 * Positions — live supply + borrow positions from LendingPool.
 * No mocks. Reads from chain.
 */
import { Card, CardHeader, CardTitle } from '../components/ui/Card'
import StatRow from '../components/ui/StatRow'
import HealthFactor from '../components/ui/HealthFactor'
import { ArrowCircleDown, ArrowCircleUp, ShieldCheck, Warning } from '@phosphor-icons/react'
import { useAccount } from 'wagmi'
import { useUserPosition, useMarketData } from '../hooks/useSteadFi'
import { TOKENS, TokenSymbol, formatToken, COLLATERAL_TOKENS, BORROW_TOKENS } from '../lib/steadfi'

const APPROX_PRICE: Record<TokenSymbol, number> = {
  USDC: 1.00, EURC: 1.08, cirBTC: 85_000, WETH: 2_500,
}

export default function Positions() {
  const { address, isConnected } = useAccount()
  const position = useUserPosition()
  const markets = useMarketData()

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

  // Compute net position
  const totalCollateralUsd = COLLATERAL_TOKENS.reduce((acc, sym) => {
    const amt = Number(position.supplies[sym]) / (10 ** TOKENS[sym].decimals)
    return acc + amt * APPROX_PRICE[sym]
  }, 0)

  const totalDebtUsd = BORROW_TOKENS.reduce((acc, sym) => {
    const amt = Number(position.debts[sym]) / (10 ** TOKENS[sym].decimals)
    return acc + amt * APPROX_PRICE[sym]
  }, 0)

  const totalLendingUsd = BORROW_TOKENS.reduce((acc, sym) => {
    const amt = Number(position.supplies[sym]) / (10 ** TOKENS[sym].decimals)
    return acc + amt * APPROX_PRICE[sym]
  }, 0)

  const netUsd = totalCollateralUsd + totalLendingUsd - totalDebtUsd

  // Supply positions (all markets where user has supply)
  const supplyPositions = (COLLATERAL_TOKENS).concat(BORROW_TOKENS)
    .map(sym => ({
      sym,
      balance: position.supplies[sym],
      decimals: TOKENS[sym].decimals,
      usdValue: Number(position.supplies[sym]) / (10 ** TOKENS[sym].decimals) * APPROX_PRICE[sym],
      apy: markets.find(m => m.symbol === sym)?.supplyApy ?? 0,
    }))
    .filter(p => p.balance > 0n)

  const borrowPositions = (BORROW_TOKENS)
    .map(sym => ({
      sym,
      debt: position.debts[sym],
      decimals: TOKENS[sym].decimals,
      usdValue: Number(position.debts[sym]) / (10 ** TOKENS[sym].decimals) * APPROX_PRICE[sym],
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
          {/* Summary row */}
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
                ${(totalCollateralUsd + totalLendingUsd).toLocaleString('en-US', { maximumFractionDigits: 0 })}
              </p>
              <p className="text-xs text-[var(--color-muted-foreground)] mt-1">Collateral + lending</p>
            </Card>

            <Card>
              <p className="text-xs text-[var(--color-muted-foreground)] font-medium">Net Position</p>
              <p className={`text-3xl font-bold mono mt-2 ${netUsd >= 0 ? 'text-[var(--color-success)]' : 'text-[var(--color-warning)]'}`}>
                ${netUsd.toLocaleString('en-US', { maximumFractionDigits: 0 })}
              </p>
              <p className="text-xs text-[var(--color-muted-foreground)] mt-1">Collateral + lend − debt</p>
            </Card>
          </div>

          {/* Supply positions */}
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
                          (${p.usdValue.toLocaleString('en-US', { maximumFractionDigits: 0 })})
                        </span>
                        <span className="text-[var(--color-success)] ml-2 text-xs">
                          {p.apy.toFixed(2)}% APY
                        </span>
                      </span>
                    }
                  />
                ))}
              </div>
            </Card>
          )}

          {/* Borrow positions */}
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
                          (${p.usdValue.toLocaleString('en-US', { maximumFractionDigits: 0 })})
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
