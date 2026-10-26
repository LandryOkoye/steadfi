/**
 * Markets — protocol overview (Aave-style): market totals header, searchable
 * asset table with supply/borrow sizes and rates, and a details link per asset.
 * All data is live from LendingPool on Arc Testnet.
 */
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { MagnifyingGlass, CaretRight } from '@phosphor-icons/react'
import { clsx } from 'clsx'
import { NetworkArc } from '@web3icons/react'
import { TokenLabel, TOKEN_NAMES } from '../components/ui/TokenIcon'
import { useMarketData, type MarketData } from '../hooks/useSteadFi'

export function compactUsd(n: number | null) {
  if (n === null || !Number.isFinite(n)) return '—'
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`
  if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`
  if (n >= 1e4) return `$${(n / 1e3).toFixed(2)}K`
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export function compactAmount(n: number) {
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`
  if (n >= 1e4) return `${(n / 1e3).toFixed(2)}K`
  return n.toLocaleString('en-US', { maximumFractionDigits: n < 1 ? 4 : 2 })
}

/** Totals in USD; an empty unpriced market (e.g. EURC while FX is closed) counts as 0. */
export function marketTotals(markets: MarketData[]) {
  const priced = markets.every(m =>
    (m.totalSupplyUsd !== null && m.totalBorrowUsd !== null) || (m.totalSupply === 0 && m.totalDebt === 0))
  if (!priced) return { size: null, borrowed: null, available: null }
  const size = markets.reduce((a, m) => a + (m.totalSupplyUsd ?? 0), 0)
  const borrowed = markets.reduce((a, m) => a + (m.totalBorrowUsd ?? 0), 0)
  return { size, borrowed, available: size - borrowed }
}

export default function Markets() {
  const markets = useMarketData()
  const [query, setQuery] = useState('')
  const totals = marketTotals(markets)
  const loading = markets.some(m => m.loading)

  const q = query.trim().toLowerCase()
  const shown = markets.filter(m => !q || m.symbol.toLowerCase().includes(q) || TOKEN_NAMES[m.symbol].toLowerCase().includes(q))

  return (
    <div className="space-y-8">
      <motion.section initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}
        className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-md">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-full bg-[var(--color-muted)]">
              <NetworkArc variant="branded" size={24} aria-hidden="true" />
            </span>
            <h1 className="text-3xl md:text-4xl font-semibold">Arc Market</h1>
          </div>
          <p className="mt-3 text-sm text-[var(--color-muted-foreground)]">
            Lend Circle stablecoins for yield, or borrow them against Bitcoin and Ether collateral. Gas is paid in USDC.
          </p>
        </div>
        <dl className="grid grid-cols-3 gap-6 md:gap-10">
          {([
            ['Total market size', totals.size],
            ['Total available', totals.available],
            ['Total borrows', totals.borrowed],
          ] as const).map(([label, v]) => (
            <div key={label}>
              <dt className="text-xs text-[var(--color-muted-foreground)]">{label}</dt>
              <dd className="mono mt-1 text-xl md:text-2xl font-semibold">
                {loading ? <span className="skeleton h-7 w-24" /> : compactUsd(v)}
              </dd>
            </div>
          ))}
        </dl>
      </motion.section>

      <section className="rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-card)] shadow-[var(--shadow-card)]">
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-5 pb-4">
          <h2 className="text-base font-semibold">Assets</h2>
          <label className="relative w-full sm:w-72">
            <span className="sr-only">Search assets</span>
            <MagnifyingGlass size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-muted-foreground)]" aria-hidden="true" />
            <input
              type="search"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search asset name or symbol"
              className="h-10 w-full rounded-[12px] border border-[var(--color-border)] bg-[var(--color-background)] pl-9 pr-3 text-sm outline-none focus:border-[var(--color-primary)] transition-base"
            />
          </label>
        </div>

        {/* Phones: stacked cards */}
        <ul className="md:hidden divide-y divide-[var(--color-border)] border-t border-[var(--color-border)]">
          {shown.map(m => (
            <li key={m.symbol}>
              <Link to={`/markets/${m.symbol}`} className="block px-5 py-4 active:bg-[var(--color-card-hover)]">
                <div className="flex items-center justify-between">
                  <TokenLabel symbol={m.symbol} size={36} />
                  <CaretRight size={16} className="text-[var(--color-muted-foreground)]" aria-hidden="true" />
                </div>
                <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                  <MobileStat label="Total supplied" value={compactAmount(m.totalSupply)} sub={compactUsd(m.totalSupplyUsd)} />
                  <MobileStat label={m.borrowEnabled ? 'Supply APY' : 'Max LTV'} value={m.borrowEnabled ? `${m.supplyApy.toFixed(2)}%` : `${m.ltv.toFixed(0)}%`} />
                  {m.borrowEnabled && (
                    <>
                      <MobileStat label="Total borrowed" value={compactAmount(m.totalDebt)} sub={compactUsd(m.totalBorrowUsd)} />
                      <MobileStat label="Borrow APR" value={`${m.borrowApr.toFixed(2)}%`} />
                    </>
                  )}
                </dl>
              </Link>
            </li>
          ))}
          {shown.length === 0 && (
            <li className="px-5 py-10 text-center text-sm text-[var(--color-muted-foreground)]">No assets match “{query}”.</li>
          )}
        </ul>

        <div className="hidden md:block overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider text-[var(--color-muted-foreground)]">
                <th scope="col" className="px-5 py-3 font-medium">Asset</th>
                <th scope="col" className="px-3 py-3 font-medium">Total supplied</th>
                <th scope="col" className="px-3 py-3 font-medium">Supply APY</th>
                <th scope="col" className="px-3 py-3 font-medium">Total borrowed</th>
                <th scope="col" className="px-3 py-3 font-medium">Borrow APR</th>
                <th scope="col" className="px-5 py-3"><span className="sr-only">Details</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)] border-t border-[var(--color-border)]">
              {shown.map(m => (
                <tr key={m.symbol} className="group hover:bg-[var(--color-card-hover)] transition-base">
                  <td className="px-5 py-4">
                    <Link to={`/markets/${m.symbol}`} className="block">
                      <TokenLabel symbol={m.symbol} size={36} />
                    </Link>
                  </td>
                  <td className="px-3 py-4">
                    <p className="mono font-medium">{m.loading ? '…' : compactAmount(m.totalSupply)}</p>
                    <p className="mono text-xs text-[var(--color-muted-foreground)]">{compactUsd(m.totalSupplyUsd)}</p>
                  </td>
                  <td className="px-3 py-4">
                    {m.borrowEnabled
                      ? <span className="mono font-medium">{m.supplyApy.toFixed(2)}%</span>
                      : <Tag>Collateral · {m.ltv.toFixed(0)}% LTV</Tag>}
                  </td>
                  <td className="px-3 py-4">
                    {m.borrowEnabled ? (
                      <>
                        <p className="mono font-medium">{compactAmount(m.totalDebt)}</p>
                        <p className="mono text-xs text-[var(--color-muted-foreground)]">{compactUsd(m.totalBorrowUsd)}</p>
                      </>
                    ) : <span className="text-[var(--color-muted-foreground)]">—</span>}
                  </td>
                  <td className="px-3 py-4">
                    {m.borrowEnabled
                      ? <span className="mono font-medium">{m.borrowApr.toFixed(2)}%</span>
                      : <span className="text-[var(--color-muted-foreground)]">Not borrowable</span>}
                  </td>
                  <td className="px-5 py-4 text-right">
                    <Link
                      to={`/markets/${m.symbol}`}
                      className="inline-flex h-9 items-center gap-1 rounded-[10px] border border-[var(--color-border)] bg-[var(--color-muted)] px-3 text-xs font-medium hover:border-[var(--color-border-strong)] transition-base"
                      aria-label={`${TOKEN_NAMES[m.symbol]} details`}
                    >
                      Details <CaretRight size={12} className="transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
                    </Link>
                  </td>
                </tr>
              ))}
              {shown.length === 0 && (
                <tr><td colSpan={6} className="px-5 py-10 text-center text-sm text-[var(--color-muted-foreground)]">No assets match “{query}”.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <p className="text-xs text-[var(--color-muted-foreground)]">
        Only cirBTC and WETH count as collateral. USDC and EURC can be lent and borrowed; supplying them earns interest but doesn’t unlock borrowing.
      </p>
    </div>
  )
}

function MobileStat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div>
      <dt className="text-xs text-[var(--color-muted-foreground)]">{label}</dt>
      <dd className="mono mt-0.5 font-semibold">{value}{sub && <span className="ml-1.5 text-xs font-normal text-[var(--color-muted-foreground)]">{sub}</span>}</dd>
    </div>
  )
}

function Tag({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={clsx('inline-flex rounded-full bg-[var(--color-muted)] px-2.5 py-1 text-xs text-[var(--color-muted-foreground)]', className)}>
      {children}
    </span>
  )
}
