/**
 * Markets — protocol overview with live APYs, utilization, liquidity.
 * No mocks. All data from LendingPool on Arc Testnet.
 */
import { Card, CardHeader, CardTitle } from '../components/ui/Card'
import { ArrowCircleDown, ArrowCircleUp, Lock } from '@phosphor-icons/react'
import { useMarketData } from '../hooks/useSteadFi'
import { TOKENS, TokenSymbol } from '../lib/steadfi'

const TOKEN_ICONS: Record<TokenSymbol, string> = {
  USDC: '🔵', EURC: '🟣', cirBTC: '🟠', WETH: '🔷',
}

export default function Markets() {
  const markets = useMarketData()

  const tvl = markets.reduce((acc, m) => acc + m.totalSupplyUsd, 0)
  const totalBorrowed = markets.reduce((acc, m) => acc + m.totalBorrowUsd, 0)

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-[var(--color-foreground)]"
            style={{ fontFamily: 'var(--font-heading)' }}>Markets</h1>
        <p className="text-sm text-[var(--color-muted-foreground)] mt-1">
          Live lending and borrowing rates on Arc Testnet. All fees paid in USDC.
        </p>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card className="py-4">
          <p className="text-xs text-[var(--color-muted-foreground)] font-medium">Total Value Locked</p>
          <p className="text-xl font-bold mono text-[var(--color-foreground)] mt-1">
            ${tvl > 0 ? tvl.toLocaleString('en-US', { maximumFractionDigits: 0 }) : '—'}
          </p>
        </Card>
        <Card className="py-4">
          <p className="text-xs text-[var(--color-muted-foreground)] font-medium">Total Borrowed</p>
          <p className="text-xl font-bold mono text-[var(--color-foreground)] mt-1">
            ${totalBorrowed > 0 ? totalBorrowed.toLocaleString('en-US', { maximumFractionDigits: 0 }) : '—'}
          </p>
        </Card>
        <Card className="py-4">
          <p className="text-xs text-[var(--color-muted-foreground)] font-medium">Oracle</p>
          <p className="text-xl font-bold mono text-[var(--color-success)] mt-1">Pyth Live</p>
          <p className="text-xs text-[var(--color-muted-foreground)] mt-0.5">Arc Testnet</p>
        </Card>
        <Card className="py-4">
          <p className="text-xs text-[var(--color-muted-foreground)] font-medium">Network</p>
          <p className="text-xl font-bold mono text-[var(--color-primary)] mt-1">Arc Testnet</p>
          <p className="text-xs text-[var(--color-muted-foreground)] mt-0.5">Chain ID 5042002</p>
        </Card>
      </div>

      {/* Market cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {markets.map(m => {
          const token = TOKENS[m.symbol]
          return (
            <Card key={m.symbol}>
              <CardHeader>
                <CardTitle>
                  <span className="mr-2">{TOKEN_ICONS[m.symbol]}</span>
                  {m.symbol}
                  {m.collateralEnabled && (
                    <span className="ml-2 text-xs bg-[var(--color-accent)] text-white px-1.5 py-0.5 rounded-full">
                      Collateral
                    </span>
                  )}
                  {!m.borrowEnabled && (
                    <span className="ml-2 text-xs bg-[var(--color-muted)] text-[var(--color-muted-foreground)] px-1.5 py-0.5 rounded-full flex items-center gap-1 inline-flex">
                      <Lock size={8} /> No Borrow
                    </span>
                  )}
                </CardTitle>
              </CardHeader>

              {m.loading ? (
                <p className="text-sm text-[var(--color-muted-foreground)]">Loading…</p>
              ) : (
                <div className="space-y-0">
                  {m.borrowEnabled && (
                    <>
                      <div className="flex justify-between py-2 border-b border-[var(--color-border)]">
                        <span className="text-xs text-[var(--color-muted-foreground)] flex items-center gap-1">
                          <ArrowCircleDown size={12} aria-hidden="true" className="text-[var(--color-success)]" />
                          Supply APY
                        </span>
                        <span className="text-[var(--color-success)] mono text-sm font-semibold">
                          {m.supplyApy.toFixed(2)}%
                        </span>
                      </div>
                      <div className="flex justify-between py-2 border-b border-[var(--color-border)]">
                        <span className="text-xs text-[var(--color-muted-foreground)] flex items-center gap-1">
                          <ArrowCircleUp size={12} aria-hidden="true" className="text-[var(--color-warning)]" />
                          Borrow APR
                        </span>
                        <span className="text-[var(--color-warning)] mono text-sm font-semibold">
                          {m.borrowApr.toFixed(2)}%
                        </span>
                      </div>
                      <div className="flex justify-between py-2 border-b border-[var(--color-border)]">
                        <span className="text-xs text-[var(--color-muted-foreground)]">Utilization</span>
                        <span className="mono text-sm font-semibold">{m.utilizationPct.toFixed(1)}%</span>
                      </div>
                    </>
                  )}

                  {m.collateralEnabled && (
                    <>
                      <div className="flex justify-between py-2 border-b border-[var(--color-border)]">
                        <span className="text-xs text-[var(--color-muted-foreground)]">LTV</span>
                        <span className="mono text-sm">{m.ltv.toFixed(0)}%</span>
                      </div>
                      <div className="flex justify-between py-2 border-b border-[var(--color-border)]">
                        <span className="text-xs text-[var(--color-muted-foreground)]">Liq. Threshold</span>
                        <span className="mono text-sm">{m.liqThreshold.toFixed(0)}%</span>
                      </div>
                    </>
                  )}

                  <div className="flex justify-between py-2">
                    <span className="text-xs text-[var(--color-muted-foreground)]">Token decimals</span>
                    <span className="mono text-sm">{token.decimals}</span>
                  </div>
                </div>
              )}
            </Card>
          )
        })}
      </div>

      {/* Collateral model note */}
      <Card>
        <p className="text-xs text-[var(--color-muted-foreground)]">
          <strong className="text-[var(--color-foreground)]">Collateral model:</strong>{' '}
          Only <strong>cirBTC</strong> and <strong>WETH</strong> can be used as collateral.
          USDC and EURC are lend-and-borrow assets only — supplying them earns interest
          but does not unlock borrowing power.
        </p>
      </Card>
    </div>
  )
}
