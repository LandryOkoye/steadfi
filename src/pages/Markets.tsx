/**
 * Markets — protocol overview: APYs, utilization, liquidity per asset.
 * Design: Trust & Authority + Conversion pattern, dense dashboard layout.
 */
import { Card, CardHeader, CardTitle } from '../components/ui/Card'
import { ArrowCircleDown, ArrowCircleUp, TrendUp } from '@phosphor-icons/react'
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
} from 'recharts'

// ── Static mock data (replaced by indexer in Phase 3 wiring) ──────────────
const MARKETS = [
  {
    symbol: 'USDC', name: 'USD Coin', icon: '🔵',
    supplyApy: 6.48, borrowApr: 8.00, utilization: 90, liquidity: 1_200_000,
    totalSupply: 10_000_000, totalBorrow: 9_000_000, ltv: 90, liqThreshold: 92,
  },
  {
    symbol: 'EURC', name: 'Euro Coin', icon: '🟣',
    supplyApy: 5.80, borrowApr: 7.20, utilization: 72, liquidity: 1_400_000,
    totalSupply: 5_000_000, totalBorrow: 3_600_000, ltv: 90, liqThreshold: 92,
  },
  {
    symbol: 'cirBTC', name: 'Circle BTC', icon: '🟠',
    supplyApy: 1.20, borrowApr: 0, utilization: 0, liquidity: 2,
    totalSupply: 2, totalBorrow: 0, ltv: 70, liqThreshold: 78,
    collateralOnly: true,
  },
  {
    symbol: 'WETH', name: 'Wrapped ETH', icon: '🔷',
    supplyApy: 1.10, borrowApr: 0, utilization: 0, liquidity: 10,
    totalSupply: 10, totalBorrow: 0, ltv: 75, liqThreshold: 82,
    collateralOnly: true,
  },
]

const STATS = [
  { label: 'Total Value Locked',  value: '$15.2M',  delta: '+3.4%' },
  { label: 'Total Borrowed',      value: '$12.6M',  delta: '+1.1%' },
  { label: 'Protocol Revenue',    value: '$18,400', delta: '+0.8%' },
  { label: 'Active Positions',    value: '342',     delta: '+12' },
]

// Dummy utilization history for the chart
const utilHistory = Array.from({ length: 24 }, (_, i) => ({
  h: `${i}h`, usdc: 75 + Math.sin(i / 3) * 12, eurc: 60 + Math.cos(i / 4) * 10,
}))

export default function Markets() {
  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold text-[var(--color-foreground)]"
            style={{ fontFamily: 'var(--font-heading)' }}>Markets</h1>
        <p className="text-sm text-[var(--color-muted-foreground)] mt-1">
          Real-time lending and borrowing rates on Arc Testnet. All fees paid in USDC.
        </p>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {STATS.map(s => (
          <Card key={s.label} className="py-4">
            <p className="text-xs text-[var(--color-muted-foreground)] font-medium">{s.label}</p>
            <p className="text-xl font-bold mono text-[var(--color-foreground)] mt-1">{s.value}</p>
            <p className="text-xs text-[var(--color-success)] mt-0.5">{s.delta} 24h</p>
          </Card>
        ))}
      </div>

      {/* Utilization chart */}
      <Card>
        <CardHeader>
          <CardTitle>Utilization — 24 h</CardTitle>
          <div className="flex items-center gap-4 text-xs text-[var(--color-muted-foreground)]">
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[var(--color-primary)] inline-block" />USDC</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[var(--color-accent)] inline-block" />EURC</span>
          </div>
        </CardHeader>
        <div style={{ height: 160 }} aria-label="Utilization chart">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={utilHistory} margin={{ top: 4, right: 0, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="gUsdc" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#F59E0B" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#F59E0B" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gEurc" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#8B5CF6" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#8B5CF6" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="h" tick={{ fill: '#94A3B8', fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: '#94A3B8', fontSize: 10 }} axisLine={false} tickLine={false} unit="%" domain={[40, 100]} />
              <Tooltip
                contentStyle={{ background: '#1E2538', border: '1px solid #334155', borderRadius: 8, fontSize: 12 }}
                labelStyle={{ color: '#94A3B8' }}
                formatter={(v) => [`${(v as number).toFixed(1)}%`]}
              />
              <Area type="monotone" dataKey="usdc" stroke="#F59E0B" strokeWidth={2} fill="url(#gUsdc)" dot={false} />
              <Area type="monotone" dataKey="eurc" stroke="#8B5CF6" strokeWidth={2} fill="url(#gEurc)" dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </Card>

      {/* Markets table */}
      <Card>
        <CardHeader>
          <CardTitle>All Markets</CardTitle>
        </CardHeader>
        <div className="overflow-x-auto -mx-1">
          <table className="w-full text-sm" role="table" aria-label="Lending markets">
            <thead>
              <tr className="text-xs text-[var(--color-muted-foreground)] border-b border-[var(--color-border)]">
                <th className="text-left pb-3 pl-2 font-medium">Asset</th>
                <th className="text-right pb-3 font-medium"><ArrowCircleDown size={12} className="inline mr-1" aria-hidden="true" />Supply APY</th>
                <th className="text-right pb-3 font-medium"><ArrowCircleUp size={12} className="inline mr-1" aria-hidden="true" />Borrow APR</th>
                <th className="text-right pb-3 font-medium"><TrendUp size={12} className="inline mr-1" aria-hidden="true" />Utilization</th>
                <th className="text-right pb-3 pr-2 font-medium">Liquidity</th>
                <th className="text-right pb-3 pr-2 font-medium">LTV</th>
              </tr>
            </thead>
            <tbody>
              {MARKETS.map(m => (
                <tr
                  key={m.symbol}
                  className="border-b border-[var(--color-border)] last:border-0 hover:bg-[var(--color-muted)] transition-base"
                >
                  <td className="py-3 pl-2">
                    <div className="flex items-center gap-2">
                      <span aria-hidden="true">{m.icon}</span>
                      <div>
                        <div className="font-semibold text-[var(--color-foreground)]">{m.symbol}</div>
                        <div className="text-[11px] text-[var(--color-muted-foreground)]">{m.name}</div>
                      </div>
                    </div>
                  </td>
                  <td className="py-3 text-right mono text-[var(--color-success)]">
                    {m.supplyApy.toFixed(2)}%
                  </td>
                  <td className="py-3 text-right mono">
                    {m.collateralOnly
                      ? <span className="text-[var(--color-muted-foreground)] text-xs">Collateral only</span>
                      : <span className="text-[var(--color-warning)]">{m.borrowApr.toFixed(2)}%</span>}
                  </td>
                  <td className="py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <div className="w-16 h-1.5 rounded-full bg-[var(--color-muted)] overflow-hidden">
                        <div
                          className="h-full rounded-full bg-[var(--color-primary)]"
                          style={{ width: `${m.utilization}%` }}
                        />
                      </div>
                      <span className="mono text-[var(--color-foreground)]">{m.utilization}%</span>
                    </div>
                  </td>
                  <td className="py-3 pr-2 text-right mono text-[var(--color-foreground)]">
                    {m.symbol === 'cirBTC' ? `${m.liquidity} BTC` :
                     m.symbol === 'WETH'   ? `${m.liquidity} ETH` :
                     `$${(m.liquidity / 1_000_000).toFixed(1)}M`}
                  </td>
                  <td className="py-3 pr-2 text-right mono text-[var(--color-muted-foreground)]">
                    {m.ltv}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}
