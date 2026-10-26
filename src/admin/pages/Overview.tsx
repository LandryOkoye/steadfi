/**
 * Admin overview — protocol totals, revenue, per-market metrics, and the
 * operational alerts an operator must act on (stale oracle, low keeper gas,
 * paused markets, production key setup).
 */
import { useBytecode } from 'wagmi'
import { ArrowSquareOut, Warning, CheckCircle } from '@phosphor-icons/react'
import { Card, CardHeader, CardTitle } from '../../components/ui/Card'
import TokenIcon from '../../components/ui/TokenIcon'
import { ARC_TESTNET_CHAIN_ID, CONTRACTS, addrUrl } from '../../lib/steadfi'
import { useAdminMarkets, useKeeperBalance, useTimelockInfo, type AdminMarket } from '../useAdmin'
import { KEEPER_ADDRESS, KEEPER_LOW_BALANCE_USDC } from '../abi'
import { KpiTile, Pill, fmtAmount, fmtUsd, shortAddr, usdOf } from '../components'

/** ~115k gas per Pyth update at 60s intervals ≈ $4/day of USDC gas. */
const KEEPER_USD_PER_DAY = 4

function sumUsd(markets: AdminMarket[], pick: (m: AdminMarket) => bigint): number | null {
  let total = 0
  for (const m of markets) {
    const v = pick(m)
    if (v === 0n) continue
    const usd = usdOf(v, m.decimals, m.price18)
    if (usd === null) return null
    total += usd
  }
  return total
}

export default function Overview() {
  const { markets, loading } = useAdminMarkets()
  const keeper = useKeeperBalance()
  const timelock = useTimelockInfo()
  const adminCode = useBytecode({ address: timelock.admin ?? undefined, chainId: ARC_TESTNET_CHAIN_ID, query: { enabled: !!timelock.admin } })

  const supplied = sumUsd(markets, m => m.totalSupply)
  const borrowed = sumUsd(markets, m => m.totalDebt)
  const revenue = sumUsd(markets, m => m.reserves)
  const cash = sumUsd(markets, m => m.cash)
  const keeperUsdc = keeper.data ? Number(keeper.data.value) / 10 ** keeper.data.decimals : null

  // ── Alerts ──
  const alerts: { tone: 'danger' | 'warning'; text: string }[] = []
  for (const m of markets) {
    if (m.symbol === 'USDC' || !m.config || loading) continue
    if (m.price18 === null) {
      alerts.push({ tone: 'danger', text: `${m.symbol} has no fresh price: supply/borrow/liquidations touching it will revert. Check the keeper.` })
    }
  }
  if (keeperUsdc !== null && keeperUsdc < KEEPER_LOW_BALANCE_USDC) {
    alerts.push({ tone: 'danger', text: `Keeper wallet has ${keeperUsdc.toFixed(2)} USDC; price updates stop when it runs out of gas.` })
  }
  markets.filter(m => m.config?.paused).forEach(m =>
    alerts.push({ tone: 'warning', text: `${m.symbol} market is paused.` }))
  if (markets.some(m => m.borrowFeeBps === null)) {
    alerts.push({ tone: 'warning', text: 'The deployed pool predates the borrow fee, so no fee revenue is collected until the pool is redeployed.' })
  }
  if (adminCode.isSuccess && !adminCode.data) {
    alerts.push({ tone: 'warning', text: 'The Timelock admin is a single wallet (EOA). Move it to a multisig before handling real funds.' })
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-3xl font-semibold">Protocol overview</h1>
        <p className="text-sm text-[var(--color-muted-foreground)] mt-1">Live on-chain state of the SteadFi pool. Refreshes every 15 seconds.</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiTile label="Total supplied" value={loading ? '…' : fmtUsd(supplied)} />
        <KpiTile label="Total borrowed" value={loading ? '…' : fmtUsd(borrowed)}
          sub={supplied ? `${((borrowed ?? 0) / supplied * 100).toFixed(1)}% utilised` : undefined} />
        <KpiTile label="Cash in pool" value={loading ? '…' : fmtUsd(cash)} sub="Tokens held by the pool" />
        <KpiTile label="Protocol revenue" value={loading ? '…' : fmtUsd(revenue)} tone="success"
          sub="Accrued reserves (interest spread + fees)" />
      </div>

      <Card>
        <CardHeader><CardTitle>Alerts</CardTitle></CardHeader>
        {alerts.length === 0 ? (
          <p className="flex items-center gap-2 text-sm text-[var(--color-success)]">
            <CheckCircle size={16} aria-hidden="true" /> No issues detected.
          </p>
        ) : (
          <ul className="space-y-2">
            {alerts.map((a, i) => (
              <li key={i} className={`flex gap-2 text-sm ${a.tone === 'danger' ? 'text-[var(--color-destructive)]' : 'text-[var(--color-warning)]'}`}>
                <Warning size={16} className="mt-0.5 shrink-0" aria-hidden="true" /> {a.text}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="overflow-x-auto">
        <CardHeader><CardTitle>Markets</CardTitle></CardHeader>
        <table className="w-full min-w-[860px] text-sm">
          <thead>
            <tr className="text-left text-xs text-[var(--color-muted-foreground)] border-b border-[var(--color-border)]">
              <th className="py-2 pr-3 font-medium">Asset</th>
              <th className="py-2 pr-3 font-medium">Price</th>
              <th className="py-2 pr-3 font-medium text-right">Supplied</th>
              <th className="py-2 pr-3 font-medium text-right">Borrowed</th>
              <th className="py-2 pr-3 font-medium text-right">Util.</th>
              <th className="py-2 pr-3 font-medium text-right">Borrow APR</th>
              <th className="py-2 pr-3 font-medium text-right">Supply APY</th>
              <th className="py-2 pr-3 font-medium text-right">Fee</th>
              <th className="py-2 pr-3 font-medium text-right">Revenue</th>
              <th className="py-2 font-medium text-right">Status</th>
            </tr>
          </thead>
          <tbody>
            {markets.map(m => (
              <tr key={m.symbol} className="border-b border-[var(--color-border)] last:border-0">
                <td className="py-2.5 pr-3 font-semibold"><span className="flex items-center gap-2"><TokenIcon symbol={m.symbol} size={24} />{m.symbol}</span></td>
                <td className="py-2.5 pr-3 mono">
                  {m.price18 !== null ? fmtUsd(Number(m.price18) / 1e18) : loading ? '…' : <span className="text-[var(--color-destructive)]">stale</span>}
                  {m.priceAgeS !== null && (
                    <span className="block text-[11px] text-[var(--color-muted-foreground)]">
                      {m.priceAgeS}s old{m.maxPriceAgeS ? ` / max ${m.maxPriceAgeS}s` : ''}
                    </span>
                  )}
                </td>
                <td className="py-2.5 pr-3 mono text-right">{fmtAmount(m.totalSupply, m.decimals, 4)}</td>
                <td className="py-2.5 pr-3 mono text-right">{fmtAmount(m.totalDebt, m.decimals, 4)}</td>
                <td className="py-2.5 pr-3 mono text-right">{m.utilizationPct.toFixed(1)}%</td>
                <td className="py-2.5 pr-3 mono text-right">{m.borrowAprPct.toFixed(2)}%</td>
                <td className="py-2.5 pr-3 mono text-right">{m.supplyApyPct.toFixed(2)}%</td>
                <td className="py-2.5 pr-3 mono text-right">
                  {m.borrowFeeBps === null ? '—' : `${(m.borrowFeeBps / 100).toFixed(2)}%`}
                </td>
                <td className="py-2.5 pr-3 mono text-right text-[var(--color-success)]">{fmtAmount(m.reserves, m.decimals, 4)}</td>
                <td className="py-2.5 text-right">
                  {!m.config ? <Pill tone="muted">—</Pill>
                    : m.config.paused ? <Pill tone="danger">Paused</Pill>
                    : <Pill tone="success">Active</Pill>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-3 text-[11px] text-[var(--color-muted-foreground)]">
          Amounts in token units. Revenue is accrued reserves; part of it may still be owed by borrowers until loans are repaid.
        </p>
      </Card>

      <div className="grid md:grid-cols-2 gap-5">
        <Card>
          <CardHeader><CardTitle>Price keeper</CardTitle></CardHeader>
          <div className="space-y-2 text-sm">
            <p className="flex justify-between"><span className="text-[var(--color-muted-foreground)]">Wallet</span>
              <a className="mono hover:underline" href={addrUrl(KEEPER_ADDRESS)} target="_blank" rel="noreferrer">{shortAddr(KEEPER_ADDRESS)}</a></p>
            <p className="flex justify-between"><span className="text-[var(--color-muted-foreground)]">Gas balance</span>
              <span className={`mono ${keeperUsdc !== null && keeperUsdc < KEEPER_LOW_BALANCE_USDC ? 'text-[var(--color-destructive)]' : ''}`}>
                {keeperUsdc === null ? '…' : `${keeperUsdc.toFixed(4)} USDC`}</span></p>
            <p className="flex justify-between"><span className="text-[var(--color-muted-foreground)]">Estimated runway</span>
              <span className="mono">{keeperUsdc === null ? '…' : `${(keeperUsdc / KEEPER_USD_PER_DAY).toFixed(1)} days`}</span></p>
            <p className="text-[11px] text-[var(--color-muted-foreground)]">Based on one Pyth update per minute (~${KEEPER_USD_PER_DAY}/day).</p>
          </div>
        </Card>

        <Card>
          <CardHeader><CardTitle>Contracts</CardTitle></CardHeader>
          <ul className="space-y-1.5 text-sm">
            {(['LendingPool', 'Timelock', 'PythOracle'] as const).map(k => (
              <li key={k} className="flex justify-between">
                <span className="text-[var(--color-muted-foreground)]">{k}</span>
                <a className="mono flex items-center gap-1 hover:underline" href={addrUrl(CONTRACTS[k])} target="_blank" rel="noreferrer">
                  {shortAddr(CONTRACTS[k])} <ArrowSquareOut size={12} aria-hidden="true" />
                </a>
              </li>
            ))}
            <li className="flex justify-between">
              <span className="text-[var(--color-muted-foreground)]">Timelock delay</span>
              <span className="mono">{timelock.delayS === null ? '…' : `${Number(timelock.delayS) / 3600} h`}</span>
            </li>
            <li className="flex justify-between">
              <span className="text-[var(--color-muted-foreground)]">Timelock admin</span>
              <span className="mono">{timelock.admin ? shortAddr(timelock.admin) : '…'}</span>
            </li>
          </ul>
        </Card>
      </div>
    </div>
  )
}
