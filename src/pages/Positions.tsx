/**
 * Positions — user's supply + borrow positions dashboard with HF gauge.
 */
import { Card, CardHeader, CardTitle } from '../components/ui/Card'
import StatRow from '../components/ui/StatRow'
import HealthFactor from '../components/ui/HealthFactor'
import { ArrowCircleDown, ArrowCircleUp, ShieldCheck } from '@phosphor-icons/react'

// Mock position data
const SUPPLY_POSITIONS = [
  { symbol: 'USDC', balance: '10,000.00', usdValue: '$10,000', apy: 6.48, earned: '+$215.30' },
  { symbol: 'cirBTC', balance: '1.00000000', usdValue: '$95,000', apy: 1.20, earned: '+$38.00' },
]

const BORROW_POSITIONS = [
  { symbol: 'USDC', debt: '35,000.00', usdValue: '$35,000', apr: 8.00, accrued: '-$760.00' },
]

const HEALTH_FACTOR = 2.40
const NET_APY = 4.12

export default function Positions() {
  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold" style={{ fontFamily: 'var(--font-heading)' }}>My Positions</h1>
        <p className="text-sm text-[var(--color-muted-foreground)] mt-1">
          Your live supply and borrow positions on SteadFi.
        </p>
      </div>

      {/* Top summary row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* HF card */}
        <Card className="md:col-span-1">
          <CardHeader><CardTitle>Health Factor</CardTitle></CardHeader>
          <HealthFactor value={HEALTH_FACTOR} size="lg" />
          <p className="text-xs text-[var(--color-muted-foreground)] mt-3 flex items-center gap-1">
            <ShieldCheck size={12} aria-hidden="true" className="text-[var(--color-success)]" />
            Your position is safe
          </p>
        </Card>

        {/* Net APY */}
        <Card>
          <p className="text-xs text-[var(--color-muted-foreground)] font-medium">Net APY</p>
          <p className="text-3xl font-bold mono text-[var(--color-success)] mt-2">{NET_APY.toFixed(2)}%</p>
          <p className="text-xs text-[var(--color-muted-foreground)] mt-1">After borrowing costs</p>
        </Card>

        {/* Net position */}
        <Card>
          <p className="text-xs text-[var(--color-muted-foreground)] font-medium">Net Position</p>
          <p className="text-3xl font-bold mono text-[var(--color-foreground)] mt-2">$70,000</p>
          <p className="text-xs text-[var(--color-muted-foreground)] mt-1">Collateral − debt</p>
        </Card>
      </div>

      {/* Supply positions */}
      <Card>
        <CardHeader>
          <CardTitle><ArrowCircleDown size={14} className="inline mr-1.5" aria-hidden="true" />Supplied</CardTitle>
          <span className="text-sm font-semibold text-[var(--color-success)] mono">$105,000</span>
        </CardHeader>
        <div className="overflow-x-auto -mx-1">
          <table className="w-full text-sm" aria-label="Supply positions">
            <thead>
              <tr className="text-xs text-[var(--color-muted-foreground)] border-b border-[var(--color-border)]">
                <th className="text-left pb-2 pl-1 font-medium">Asset</th>
                <th className="text-right pb-2 font-medium">Balance</th>
                <th className="text-right pb-2 font-medium">USD Value</th>
                <th className="text-right pb-2 font-medium">APY</th>
                <th className="text-right pb-2 pr-1 font-medium">Earned</th>
              </tr>
            </thead>
            <tbody>
              {SUPPLY_POSITIONS.map(p => (
                <tr key={p.symbol} className="border-b border-[var(--color-border)] last:border-0">
                  <td className="py-2.5 pl-1 font-semibold">{p.symbol}</td>
                  <td className="py-2.5 text-right mono">{p.balance}</td>
                  <td className="py-2.5 text-right mono text-[var(--color-muted-foreground)]">{p.usdValue}</td>
                  <td className="py-2.5 text-right mono text-[var(--color-success)]">{p.apy.toFixed(2)}%</td>
                  <td className="py-2.5 pr-1 text-right mono text-[var(--color-success)]">{p.earned}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Borrow positions */}
      <Card>
        <CardHeader>
          <CardTitle><ArrowCircleUp size={14} className="inline mr-1.5" aria-hidden="true" />Borrowed</CardTitle>
          <span className="text-sm font-semibold text-[var(--color-warning)] mono">$35,000</span>
        </CardHeader>
        <div className="overflow-x-auto -mx-1">
          <table className="w-full text-sm" aria-label="Borrow positions">
            <thead>
              <tr className="text-xs text-[var(--color-muted-foreground)] border-b border-[var(--color-border)]">
                <th className="text-left pb-2 pl-1 font-medium">Asset</th>
                <th className="text-right pb-2 font-medium">Debt</th>
                <th className="text-right pb-2 font-medium">USD Value</th>
                <th className="text-right pb-2 font-medium">APR</th>
                <th className="text-right pb-2 pr-1 font-medium">Accrued</th>
              </tr>
            </thead>
            <tbody>
              {BORROW_POSITIONS.map(p => (
                <tr key={p.symbol} className="border-b border-[var(--color-border)] last:border-0">
                  <td className="py-2.5 pl-1 font-semibold">{p.symbol}</td>
                  <td className="py-2.5 text-right mono">{p.debt}</td>
                  <td className="py-2.5 text-right mono text-[var(--color-muted-foreground)]">{p.usdValue}</td>
                  <td className="py-2.5 text-right mono text-[var(--color-warning)]">{p.apr.toFixed(2)}%</td>
                  <td className="py-2.5 pr-1 text-right mono text-[var(--color-destructive)]">{p.accrued}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Risk parameters */}
      <Card>
        <CardHeader><CardTitle>Risk Parameters</CardTitle></CardHeader>
        <StatRow label="Liquidation threshold" value={<span className="mono">78%</span>} />
        <StatRow label="LTV (max borrow)" value={<span className="mono">70%</span>} />
        <StatRow label="Liquidation bonus" value={<span className="mono">5%</span>} />
        <StatRow label="Close factor" value={<span className="mono">50%</span>} />
      </Card>
    </div>
  )
}
