/**
 * Dashboard — the user's position at a glance (net worth, net APY, health
 * factor) and the four Aave-style panels: your supplies, assets to supply,
 * your borrows, assets to borrow. Every action opens a modal.
 * Deep links: /dashboard?action=supply&asset=USDC opens that modal.
 */
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAccount } from 'wagmi'
import { ConnectKitButton } from 'connectkit'
import { motion } from 'framer-motion'
import { CalendarBlank, CheckCircle, Info, Wallet } from '@phosphor-icons/react'
import { clsx } from 'clsx'
import Button from '../components/ui/Button'
import HealthFactor, { formatHf, hfBand } from '../components/ui/HealthFactor'
import { TokenLabel } from '../components/ui/TokenIcon'
import { useActions, type ActionType } from '../components/actions/ActionProvider'
import LegacyPoolNotice from '../components/LegacyPoolNotice'
import {
  SYMBOLS, useBorrowFee, useLoanTerm, useMarketData, useNowMs, useOraclePrices, useTokenBalance, useUserPosition,
  type MarketData,
} from '../hooks/useSteadFi'
import {
  BORROW_TOKENS, COLLATERAL_TOKENS, TOKENS, type TokenSymbol, formatToken, usdFromTokenAmount,
} from '../lib/steadfi'

const fadeUp = {
  hidden: { opacity: 0, y: 12 },
  show: (i: number) => ({ opacity: 1, y: 0, transition: { delay: i * 0.05, duration: 0.35, ease: [0.2, 0.7, 0.2, 1] } }),
}

function usd(n: number | null, frac = 2) {
  if (n === null || !Number.isFinite(n)) return '—'
  return '$' + n.toLocaleString('en-US', { minimumFractionDigits: frac, maximumFractionDigits: frac })
}

export default function Dashboard() {
  const { isConnected } = useAccount()
  const position = useUserPosition()
  const markets = useMarketData()
  const { prices } = useOraclePrices()
  const { openAction } = useActions()
  const [params, setParams] = useSearchParams()

  // Deep link from old routes (/supply, /borrow, …) or shared URLs.
  useEffect(() => {
    const action = params.get('action') as ActionType | null
    if (!action || !['supply', 'withdraw', 'borrow', 'repay'].includes(action) || !isConnected) return
    const asset = params.get('asset') as TokenSymbol | null
    const fallback: TokenSymbol = action === 'withdraw' ? 'cirBTC' : 'USDC'
    openAction(action, asset && asset in TOKENS ? asset : fallback)
    setParams({}, { replace: true })
  }, [params, isConnected, openAction, setParams])

  const usdOf = (sym: TokenSymbol, amount: bigint) => {
    const p = prices[sym]
    return p ? usdFromTokenAmount(amount, TOKENS[sym].decimals, p) : null
  }
  const market = (sym: TokenSymbol) => markets.find(m => m.symbol === sym)

  const summary = useMemo(() => {
    let supplied = 0, debt = 0, earn = 0, cost = 0, collateral = 0
    let priced = true
    for (const sym of SYMBOLS) {
      const s = position.supplies[sym], d = position.debts[sym]
      if (s > 0n) {
        const v = usdOf(sym, s); if (v === null) { priced = false; continue }
        supplied += v
        if (TOKENS[sym].collateralEnabled) collateral += v
        else earn += v * ((market(sym)?.supplyApy ?? 0) / 100)
      }
      if (d > 0n) {
        const v = usdOf(sym, d); if (v === null) { priced = false; continue }
        debt += v; cost += v * ((market(sym)?.borrowApr ?? 0) / 100)
      }
    }
    const net = supplied - debt
    return {
      priced, supplied, debt, collateral, net,
      netApy: net > 0 ? ((earn - cost) / net) * 100 : 0,
      supplyApy: supplied - collateral > 0 ? (earn / (supplied - collateral)) * 100 : 0,
      borrowApr: debt > 0 ? (cost / debt) * 100 : 0,
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [position.supplies, position.debts, prices, markets])

  const borrowPowerUsd = Number(position.borrowPowerRay) / 1e27
  const debtUsd = Number(position.totalDebtRay) / 1e27
  const powerUsedPct = borrowPowerUsd > 0 ? Math.min((debtUsd / borrowPowerUsd) * 100, 100) : 0
  const hasCollateral = COLLATERAL_TOKENS.some(s => position.supplies[s] > 0n)
  const [showRisk, setShowRisk] = useState(false)

  const yourSupplies = SYMBOLS.filter(s => position.supplies[s] > 0n)
  const yourBorrows = BORROW_TOKENS.filter(s => position.debts[s] > 0n)

  return (
    <div className="space-y-8">
      {/* ── Header ── */}
      <motion.section initial="hidden" animate="show" custom={0} variants={fadeUp}>
        <p className="text-sm text-[var(--color-muted-foreground)]">Arc Testnet market</p>
        <h1 className="mt-1 text-3xl md:text-4xl font-semibold">Dashboard</h1>

        {isConnected && (
          <div className="mt-6 flex flex-wrap items-end gap-x-10 gap-y-5">
            <HeaderStat label="Net worth" loading={position.loading}>
              {summary.priced ? usd(summary.net) : '—'}
            </HeaderStat>
            <HeaderStat label="Net APY" loading={position.loading}>
              <span className={summary.netApy < 0 ? 'text-[var(--color-warning)]' : ''}>
                {summary.net > 0 ? `${summary.netApy.toFixed(2)}%` : '—'}
              </span>
            </HeaderStat>
            {position.healthFactor !== null && (
              <HeaderStat label="Health factor" loading={position.loading}>
                <span className="flex items-center gap-3">
                  <span className={position.healthFactor === Infinity ? '' : hfBand(position.healthFactor).cls}>
                    {formatHf(position.healthFactor)}
                  </span>
                  <button
                    onClick={() => setShowRisk(v => !v)}
                    aria-expanded={showRisk}
                    className="h-7 rounded-full border border-[var(--color-border)] px-3 text-xs font-medium text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)] hover:border-[var(--color-border-strong)] cursor-pointer transition-base"
                  >
                    Risk details
                  </button>
                </span>
              </HeaderStat>
            )}
            {hasCollateral && (
              <HeaderStat label="Available to borrow" loading={position.loading}>
                {usd(Math.max(borrowPowerUsd - debtUsd, 0))}
              </HeaderStat>
            )}
          </div>
        )}

        {isConnected && showRisk && position.healthFactor !== null && (
          <motion.div
            initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}
            className="mt-5 grid gap-5 rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-card)] p-5 md:grid-cols-2"
          >
            <div>
              <p className="text-sm font-medium">Health factor</p>
              <p className="mt-1 mb-3 text-xs text-[var(--color-muted-foreground)]">
                Collateral at liquidation threshold ÷ debt. Below 1.0, part of your collateral can be liquidated.
              </p>
              <HealthFactor value={position.healthFactor} />
            </div>
            <div>
              <p className="text-sm font-medium">Borrow power used</p>
              <p className="mt-1 mb-3 text-xs text-[var(--color-muted-foreground)]">
                Debt as a share of what your collateral lets you borrow (its LTV limit).
              </p>
              <p className="mono text-3xl font-semibold">{powerUsedPct.toFixed(1)}%</p>
              <div className="mt-3 h-1.5 rounded-full bg-[var(--color-muted)] overflow-hidden">
                <div className="h-full rounded-full bg-[image:var(--gradient-brand)] transition-all duration-500" style={{ width: `${powerUsedPct}%` }} />
              </div>
              <p className="mt-1.5 text-[11px] text-[var(--color-muted-foreground)]">{usd(debtUsd)} of {usd(borrowPowerUsd)}</p>
            </div>
          </motion.div>
        )}
      </motion.section>

      {isConnected && <LegacyPoolNotice />}

      {!isConnected ? (
        <ConnectPrompt markets={markets} />
      ) : (
        <div className="grid gap-6 lg:grid-cols-2 items-start">
          <div className="space-y-6">
            <Panel
              i={1}
              title="Your supplies"
              chips={yourSupplies.length > 0 ? [
                ['Balance', usd(summary.supplied)],
                ['APY', `${summary.supplyApy.toFixed(2)}%`],
                ['Collateral', usd(summary.collateral)],
              ] : undefined}
            >
              {position.loading ? <RowsSkeleton /> : yourSupplies.length === 0 ? (
                <Empty>Nothing supplied yet.</Empty>
              ) : (
                <Rows head={['Asset', 'Balance', 'APY', '']}>
                  {yourSupplies.map(sym => (
                    <Row key={sym}>
                      <TokenLabel symbol={sym} />
                      <Amount amount={formatToken(position.supplies[sym], TOKENS[sym].decimals)} usd={usd(usdOf(sym, position.supplies[sym]))} />
                      <Cell label="APY">
                        {TOKENS[sym].collateralEnabled
                          ? <span className="inline-flex items-center gap-1 text-xs text-[var(--color-success)]"><CheckCircle size={14} weight="fill" aria-hidden="true" /> Collateral</span>
                          : <span className="mono">{(market(sym)?.supplyApy ?? 0).toFixed(2)}%</span>}
                      </Cell>
                      <Actions>
                        <Button size="sm" variant="primary" onClick={() => openAction('withdraw', sym)}>Withdraw</Button>
                        <Button size="sm" variant="secondary" onClick={() => openAction('supply', sym)}>Supply</Button>
                      </Actions>
                    </Row>
                  ))}
                </Rows>
              )}
            </Panel>

            <Panel i={2} title="Assets to supply">
              <Rows head={['Asset', 'Wallet balance', 'APY', '']}>
                {SYMBOLS.map(sym => (
                  <SupplyRow key={sym} sym={sym} market={market(sym)} onSupply={() => openAction('supply', sym)} />
                ))}
              </Rows>
            </Panel>
          </div>

          <div className="space-y-6">
            <Panel
              i={3}
              title="Your borrows"
              chips={yourBorrows.length > 0 ? [
                ['Balance', usd(summary.debt)],
                ['APR', `${summary.borrowApr.toFixed(2)}%`],
                ['Power used', `${powerUsedPct.toFixed(1)}%`],
              ] : undefined}
            >
              {position.loading ? <RowsSkeleton /> : yourBorrows.length === 0 ? (
                <Empty>Nothing borrowed yet.</Empty>
              ) : (
                <Rows head={['Asset', 'Debt', 'APR', '']}>
                  {yourBorrows.map(sym => (
                    <Row key={sym}>
                      <div>
                        <TokenLabel symbol={sym} />
                        <DueBadge sym={sym} />
                      </div>
                      <Amount amount={formatToken(position.debts[sym], TOKENS[sym].decimals)} usd={usd(usdOf(sym, position.debts[sym]))} />
                      <Cell label="APR"><span className="mono">{(market(sym)?.borrowApr ?? 0).toFixed(2)}%</span></Cell>
                      <Actions>
                        <Button size="sm" variant="primary" onClick={() => openAction('repay', sym)}>Repay</Button>
                        <Button size="sm" variant="secondary" onClick={() => openAction('borrow', sym)}>Borrow</Button>
                      </Actions>
                    </Row>
                  ))}
                </Rows>
              )}
            </Panel>

            <Panel i={4} title="Assets to borrow">
              {!hasCollateral && !position.loading && (
                <p className="mb-3 flex items-start gap-2 rounded-xl bg-[var(--color-muted)] px-3 py-2.5 text-xs text-[var(--color-muted-foreground)]">
                  <Info size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
                  Supply cirBTC or WETH as collateral to start borrowing.
                </p>
              )}
              <Rows head={['Asset', 'Available', 'APR', '']}>
                {BORROW_TOKENS.map(sym => (
                  <BorrowRow
                    key={sym}
                    sym={sym}
                    market={market(sym)}
                    availableUsd={Math.max(borrowPowerUsd - debtUsd, 0)}
                    disabled={!hasCollateral}
                    onBorrow={() => openAction('borrow', sym)}
                  />
                ))}
              </Rows>
            </Panel>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Pieces ───────────────────────────────────────────────────────────────────

function HeaderStat({ label, loading, children }: { label: string; loading?: boolean; children: ReactNode }) {
  return (
    <div>
      <p className="text-xs text-[var(--color-muted-foreground)]">{label}</p>
      <div className="mono mt-1 text-2xl md:text-[28px] font-semibold leading-none">
        {loading ? <span className="skeleton h-7 w-28" /> : children}
      </div>
    </div>
  )
}

function Panel({ i, title, chips, children }: {
  i: number; title: string; chips?: [string, string][]; children: ReactNode
}) {
  return (
    <motion.section
      initial="hidden" animate="show" custom={i} variants={fadeUp}
      className="rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-card)] shadow-[var(--shadow-card)]"
      aria-labelledby={`panel-${i}`}
    >
      <div className="px-5 pt-5 pb-3">
        <h2 id={`panel-${i}`} className="text-base font-semibold">{title}</h2>
        {chips && (
          <div className="mt-3 flex flex-wrap gap-2">
            {chips.map(([k, v]) => (
              <span key={k} className="rounded-lg border border-[var(--color-border)] px-2.5 py-1 text-xs text-[var(--color-muted-foreground)]">
                {k} <span className="mono font-medium text-[var(--color-foreground)]">{v}</span>
              </span>
            ))}
          </div>
        )}
      </div>
      <div className="px-2 pb-2">{children}</div>
    </motion.section>
  )
}

const ROW_GRID = 'grid grid-cols-2 sm:grid-cols-[1.5fr_1fr_0.8fr_auto] items-center gap-x-4 gap-y-3'

function Rows({ head, children }: { head: string[]; children: ReactNode }) {
  return (
    <div>
      <div aria-hidden="true" className={clsx(ROW_GRID, 'hidden sm:grid px-3 pb-2 text-[11px] uppercase tracking-wider text-[var(--color-muted-foreground)]')}>
        {head.map((h, idx) => <span key={idx}>{h}</span>)}
      </div>
      <div className="divide-y divide-[var(--color-border)]">{children}</div>
    </div>
  )
}

function Row({ children }: { children: ReactNode }) {
  return (
    <div className={clsx(ROW_GRID, 'rounded-xl px-3 py-3.5 hover:bg-[var(--color-card-hover)] transition-base')}>
      {children}
    </div>
  )
}

function Cell({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="text-sm">
      <span className="sm:hidden block text-[11px] text-[var(--color-muted-foreground)]">{label}</span>
      {children}
    </div>
  )
}

function Amount({ amount, usd: usdText }: { amount: string; usd: string }) {
  return (
    <div className="text-right sm:text-left">
      <p className="mono text-sm font-medium">{amount}</p>
      <p className="mono text-xs text-[var(--color-muted-foreground)]">{usdText}</p>
    </div>
  )
}

function Actions({ children }: { children: ReactNode }) {
  return <div className="col-span-2 sm:col-span-1 flex justify-end gap-2">{children}</div>
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="px-3 py-6 text-sm text-[var(--color-muted-foreground)]">{children}</p>
}

function RowsSkeleton() {
  return (
    <div className="space-y-2 px-3 py-2">
      {[0, 1].map(i => <div key={i} className="skeleton h-12 w-full" />)}
    </div>
  )
}

function SupplyRow({ sym, market, onSupply }: { sym: TokenSymbol; market?: MarketData; onSupply: () => void }) {
  const balance = useTokenBalance(sym)
  return (
    <Row>
      <TokenLabel symbol={sym} />
      <div className="text-right sm:text-left">
        <p className={clsx('mono text-sm', balance === 0n && 'text-[var(--color-muted-foreground)]')}>
          {formatToken(balance, TOKENS[sym].decimals)}
        </p>
      </div>
      <Cell label="APY">
        {TOKENS[sym].collateralEnabled
          ? <span className="text-xs text-[var(--color-muted-foreground)]">Collateral · {market?.ltv.toFixed(0) ?? '—'}% LTV</span>
          : <span className="mono text-[var(--color-success)]">{(market?.supplyApy ?? 0).toFixed(2)}%</span>}
      </Cell>
      <Actions>
        <Button size="sm" variant="primary" disabled={balance === 0n} onClick={onSupply}>Supply</Button>
      </Actions>
    </Row>
  )
}

function BorrowRow({ sym, market, availableUsd, disabled, onBorrow }: {
  sym: TokenSymbol; market?: MarketData; availableUsd: number; disabled: boolean; onBorrow: () => void
}) {
  const { feeBps } = useBorrowFee(sym)
  const price = market?.priceUsd ?? null
  const cap = Math.min(availableUsd / (1 + feeBps / 10_000), market?.liquidityUsd ?? 0)
  const tokens = price ? cap / price : null
  return (
    <Row>
      <TokenLabel symbol={sym} />
      <div className="text-right sm:text-left">
        <p className="mono text-sm">{tokens === null ? '—' : tokens.toLocaleString('en-US', { maximumFractionDigits: 2 })}</p>
        <p className="mono text-xs text-[var(--color-muted-foreground)]">{usd(cap)}</p>
      </div>
      <Cell label="APR">
        <span className="mono">{(market?.borrowApr ?? 0).toFixed(2)}%</span>
        {feeBps > 0 && <span className="block text-[11px] text-[var(--color-muted-foreground)]">+{(feeBps / 100).toFixed(2)}% fee</span>}
      </Cell>
      <Actions>
        <Button size="sm" variant="primary" disabled={disabled || cap <= 0} onClick={onBorrow}>Borrow</Button>
      </Actions>
    </Row>
  )
}

function DueBadge({ sym }: { sym: TokenSymbol }) {
  const term = useLoanTerm(sym)
  const nowMs = useNowMs()
  if (!term?.dueDate) return null
  const due = new Date(term.dueDate)
  const overdue = nowMs > 0 && nowMs > due.getTime()
  return (
    <span className={clsx(
      'ml-11 mt-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium',
      overdue ? 'bg-[color-mix(in_srgb,var(--color-destructive)_12%,transparent)] text-[var(--color-destructive)]' : 'bg-[var(--color-muted)] text-[var(--color-muted-foreground)]',
    )}>
      <CalendarBlank size={11} aria-hidden="true" />
      {overdue ? 'Overdue since' : 'Due'} {due.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
    </span>
  )
}

function ConnectPrompt({ markets }: { markets: MarketData[] }) {
  return (
    <motion.div initial="hidden" animate="show" custom={1} variants={fadeUp}
      className="relative overflow-hidden rounded-[24px] border border-[var(--color-border)] bg-[var(--color-card)] p-8 md:p-12 text-center">
      <div className="pointer-events-none absolute inset-0 app-glow opacity-80" aria-hidden="true" />
      <div className="relative">
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-[var(--color-muted)]">
          <Wallet size={26} className="text-[var(--color-primary)]" aria-hidden="true" />
        </span>
        <h2 className="mt-5 text-2xl font-semibold">Connect your wallet</h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-[var(--color-muted-foreground)]">
          See your positions, supply assets and borrow against your collateral. Gas on Arc is paid in USDC.
        </p>
        <div className="mt-6 flex justify-center"><ConnectKitButton /></div>
        <div className="mx-auto mt-10 grid max-w-2xl grid-cols-2 gap-3 sm:grid-cols-4">
          {markets.map(m => (
            <div key={m.symbol} className="rounded-2xl border border-[var(--color-border)] bg-[color-mix(in_srgb,var(--color-background)_50%,transparent)] p-4 text-left">
              <TokenLabel symbol={m.symbol} size={28} />
              <p className="mt-3 text-[11px] text-[var(--color-muted-foreground)]">{m.borrowEnabled ? 'Supply APY' : 'Max LTV'}</p>
              <p className="mono text-lg font-semibold">
                {m.borrowEnabled ? `${m.supplyApy.toFixed(2)}%` : `${m.ltv.toFixed(0)}%`}
              </p>
            </div>
          ))}
        </div>
      </div>
    </motion.div>
  )
}
