/**
 * AssetDetail — /markets/:symbol. Reserve overview for one Arc asset: size,
 * liquidity, utilisation, oracle price, supply & borrow configuration, the
 * interest-rate curve, and the user's own balances with actions.
 */
import { Link, Navigate, useParams } from 'react-router-dom'
import { useAccount, useReadContract } from 'wagmi'
import { ConnectKitButton } from 'connectkit'
import { motion } from 'framer-motion'
import { ArrowLeft, ArrowSquareOut } from '@phosphor-icons/react'
import {
  CartesianGrid, Line, LineChart, ReferenceDot, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import Button from '../components/ui/Button'
import StatRow from '../components/ui/StatRow'
import TokenIcon, { TOKEN_NAMES } from '../components/ui/TokenIcon'
import { useActions } from '../components/actions/ActionProvider'
import {
  borrowRateAt, useBorrowFee, useMarketData, useRateModel, useTokenBalance, useUserPosition,
} from '../hooks/useSteadFi'
import {
  ARC_TESTNET_CHAIN_ID, CONTRACTS, LENDING_POOL_ABI, TOKENS, type TokenSymbol, addrUrl, formatToken,
} from '../lib/steadfi'
import { compactAmount, compactUsd } from './Markets'

interface ConfigView {
  liqBonus: number; reserveFactor: number; supplyCap: bigint; borrowCap: bigint; paused: boolean
}

export default function AssetDetail() {
  const { symbol: raw } = useParams()
  const symbol = (raw && raw in TOKENS ? raw : null) as TokenSymbol | null
  if (!symbol) return <Navigate to="/markets" replace />
  return <AssetView symbol={symbol} />
}

function AssetView({ symbol }: { symbol: TokenSymbol }) {
  const token = TOKENS[symbol]
  const markets = useMarketData()
  const m = markets.find(x => x.symbol === symbol)
  const cfgRead = useReadContract({
    address: CONTRACTS.LendingPool, abi: LENDING_POOL_ABI, functionName: 'getMarketConfig',
    args: [token.address], chainId: ARC_TESTNET_CHAIN_ID,
  })
  const cfg = cfgRead.data as ConfigView | undefined
  const { feeBps } = useBorrowFee(symbol)
  const rateModel = useRateModel(symbol)

  const supplyCap = cfg ? Number(cfg.supplyCap) / 10 ** token.decimals : null
  const borrowCap = cfg && cfg.borrowCap > 0n ? Number(cfg.borrowCap) / 10 ** token.decimals : null

  return (
    <div className="space-y-8">
      <Link to="/markets" className="inline-flex items-center gap-1.5 text-sm text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]">
        <ArrowLeft size={14} aria-hidden="true" /> Markets
      </Link>

      <motion.section initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}
        className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-4">
          <TokenIcon symbol={symbol} size={52} />
          <div>
            <p className="text-sm text-[var(--color-muted-foreground)]">{symbol}</p>
            <h1 className="text-3xl md:text-4xl font-semibold">{TOKEN_NAMES[symbol]}</h1>
          </div>
          <a href={addrUrl(token.address)} target="_blank" rel="noreferrer" aria-label="View token contract"
            className="grid h-9 w-9 place-items-center rounded-full border border-[var(--color-border)] text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]">
            <ArrowSquareOut size={15} aria-hidden="true" />
          </a>
        </div>
        <dl className="grid grid-cols-2 gap-x-10 gap-y-4 sm:grid-cols-4">
          <HeadStat label="Reserve size" value={compactUsd(m?.totalSupplyUsd ?? null)} />
          <HeadStat label="Available liquidity" value={compactUsd(m?.liquidityUsd ?? null)} />
          <HeadStat label="Utilization" value={m ? `${m.utilizationPct.toFixed(1)}%` : '—'} />
          <HeadStat label={symbol === 'USDC' ? 'Price (fixed)' : 'Oracle price'}
            value={m?.priceUsd ? `$${m.priceUsd.toLocaleString('en-US', { maximumFractionDigits: m.priceUsd < 10 ? 4 : 2 })}` : 'Unavailable'} />
        </dl>
      </motion.section>

      {cfg?.paused && (
        <p role="alert" className="rounded-xl bg-[color-mix(in_srgb,var(--color-warning)_10%,transparent)] px-4 py-3 text-sm text-[var(--color-warning)]">
          This market is paused by the protocol guardian. Supplying and borrowing are temporarily disabled.
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_340px] items-start">
        <div className="space-y-6">
          <Section title="Supply info">
            <div className="grid gap-6 sm:grid-cols-[auto_1fr] items-center">
              <CapRing used={m?.totalSupply ?? 0} cap={supplyCap} />
              <div className="grid grid-cols-2 gap-x-6 gap-y-1">
                <Mini label="Total supplied" value={m ? `${compactAmount(m.totalSupply)} of ${supplyCap ? compactAmount(supplyCap) : '∞'}` : '—'} />
                <Mini label="APY" value={m?.borrowEnabled ? `${m.supplyApy.toFixed(2)}%` : '—'} />
              </div>
            </div>
            {token.collateralEnabled && m && cfg && (
              <div className="mt-6 border-t border-[var(--color-border)] pt-5">
                <p className="mb-3 text-sm font-medium">Collateral usage <span className="ml-2 text-xs font-normal text-[var(--color-success)]">Can be collateral</span></p>
                <div className="grid grid-cols-3 gap-3">
                  <Tile label="Max LTV" value={`${m.ltv.toFixed(0)}%`} />
                  <Tile label="Liquidation threshold" value={`${m.liqThreshold.toFixed(0)}%`} />
                  <Tile label="Liquidation penalty" value={`${(cfg.liqBonus / 100).toFixed(0)}%`} />
                </div>
              </div>
            )}
          </Section>

          {token.borrowEnabled && (
            <Section title="Borrow info">
              <div className="grid gap-6 sm:grid-cols-[auto_1fr] items-center">
                <CapRing used={m?.totalDebt ?? 0} cap={borrowCap} />
                <div className="grid grid-cols-2 gap-x-6 gap-y-1">
                  <Mini label="Total borrowed" value={m ? `${compactAmount(m.totalDebt)} of ${borrowCap ? compactAmount(borrowCap) : '∞'}` : '—'} />
                  <Mini label="APR, variable" value={m ? `${m.borrowApr.toFixed(2)}%` : '—'} />
                  <Mini label="Origination fee" value={`${(feeBps / 100).toFixed(2)}%`} />
                  <Mini label="Loan terms" value="7 – 180 days" />
                </div>
              </div>
              <div className="mt-6 grid grid-cols-3 gap-3">
                <Tile label="Reserve factor" value={cfg ? `${(cfg.reserveFactor / 100).toFixed(0)}%` : '—'} />
                <Tile label="Collateral" value="cirBTC, WETH" />
                <Tile label="Early repayment" value="No penalty" />
              </div>
            </Section>
          )}

          {token.borrowEnabled && rateModel && m && (
            <Section title="Interest rate model">
              <RateChart model={rateModel} currentUtil={m.utilizationPct / 100} />
            </Section>
          )}
        </div>

        <YourInfo symbol={symbol} paused={!!cfg?.paused} />
      </div>
    </div>
  )
}

// ── Pieces ───────────────────────────────────────────────────────────────────

function HeadStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-[var(--color-muted-foreground)]">{label}</dt>
      <dd className="mono mt-1 text-xl font-semibold">{value}</dd>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-card)] p-5 md:p-6 shadow-[var(--shadow-card)]">
      <h2 className="mb-5 text-base font-semibold">{title}</h2>
      {children}
    </section>
  )
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="py-2">
      <p className="text-xs text-[var(--color-muted-foreground)]">{label}</p>
      <p className="mono mt-0.5 text-[15px] font-semibold">{value}</p>
    </div>
  )
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[14px] border border-[var(--color-border)] px-3 py-3">
      <p className="text-[11px] text-[var(--color-muted-foreground)]">{label}</p>
      <p className="mono mt-1 text-sm font-semibold">{value}</p>
    </div>
  )
}

/** Usage of a cap as a ring; with no cap shows "No cap". */
function CapRing({ used, cap }: { used: number; cap: number | null }) {
  const pct = cap && cap > 0 ? Math.min(used / cap, 1) : 0
  const r = 30, c = 2 * Math.PI * r
  return (
    <div className="relative h-[76px] w-[76px]" role="img" aria-label={cap ? `${(pct * 100).toFixed(1)}% of cap used` : 'No cap'}>
      <svg viewBox="0 0 76 76" className="h-full w-full -rotate-90" aria-hidden="true">
        <circle cx="38" cy="38" r={r} fill="none" stroke="var(--color-muted)" strokeWidth="7" />
        {cap && pct > 0 && (
          <circle cx="38" cy="38" r={r} fill="none" stroke="var(--color-chart-1)" strokeWidth="7" strokeLinecap="round"
            strokeDasharray={`${Math.max(pct * c, 1)} ${c}`} />
        )}
      </svg>
      <span className="mono absolute inset-0 grid place-items-center text-xs font-semibold">
        {cap ? `${(pct * 100).toFixed(pct < 0.01 ? 2 : 1)}%` : 'No cap'}
      </span>
    </div>
  )
}

function RateChart({ model, currentUtil }: { model: Parameters<typeof borrowRateAt>[0]; currentUtil: number }) {
  const data = Array.from({ length: 101 }, (_, i) => ({ u: i, apr: borrowRateAt(model, i / 100) * 100 }))
  const currentApr = borrowRateAt(model, currentUtil) * 100
  const kinkPct = model.kink * 100
  const atKink = borrowRateAt(model, model.kink) * 100

  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-x-8 gap-y-2 text-sm">
        <span><span className="text-[var(--color-muted-foreground)]">Current utilization </span><span className="mono font-semibold">{(currentUtil * 100).toFixed(1)}%</span></span>
        <span><span className="text-[var(--color-muted-foreground)]">Borrow APR now </span><span className="mono font-semibold">{currentApr.toFixed(2)}%</span></span>
        <span><span className="text-[var(--color-muted-foreground)]">Optimal utilization </span><span className="mono font-semibold">{kinkPct.toFixed(0)}%</span></span>
      </div>
      <p className="sr-only">
        Borrow APR rises from {(model.base * 100).toFixed(2)}% at 0% utilization to {atKink.toFixed(2)}% at the {kinkPct.toFixed(0)}% optimal
        point, then steeply to {(borrowRateAt(model, 1) * 100).toFixed(0)}% at full utilization.
      </p>
      <div className="h-56" aria-hidden="true">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -12 }}>
            <CartesianGrid vertical={false} stroke="var(--color-border)" strokeDasharray="0" />
            <XAxis dataKey="u" type="number" domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} tickFormatter={v => `${v}%`}
              stroke="var(--color-border)" tick={{ fill: 'var(--color-muted-foreground)', fontSize: 11 }} tickLine={false} />
            <YAxis tickFormatter={v => `${v}%`} stroke="transparent" tick={{ fill: 'var(--color-muted-foreground)', fontSize: 11 }} width={48} />
            <Tooltip
              cursor={{ stroke: 'var(--color-border-strong)', strokeWidth: 1 }}
              content={({ active, payload }) => active && payload?.length ? (
                <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-elevated)] px-3 py-2 text-xs shadow-[var(--shadow-pop)]">
                  <p className="text-[var(--color-muted-foreground)]">Utilization {payload[0].payload.u}%</p>
                  <p className="mono font-semibold text-[var(--color-foreground)]">Borrow APR {Number(payload[0].value).toFixed(2)}%</p>
                </div>
              ) : null}
            />
            <ReferenceLine x={kinkPct} stroke="var(--color-muted-foreground)" strokeDasharray="4 4"
              label={{ value: `Optimal ${kinkPct.toFixed(0)}%`, position: 'insideTopLeft', fill: 'var(--color-muted-foreground)', fontSize: 11 }} />
            <Line type="linear" dataKey="apr" stroke="var(--color-chart-1)" strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: 'var(--color-card)' }} isAnimationActive={false} />
            <ReferenceDot x={currentUtil * 100} y={currentApr} r={5} fill="var(--color-chart-1)" stroke="var(--color-card)" strokeWidth={2}
              label={{ value: 'Now', position: 'top', fill: 'var(--color-foreground)', fontSize: 11 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

function YourInfo({ symbol, paused }: { symbol: TokenSymbol; paused: boolean }) {
  const { isConnected } = useAccount()
  const token = TOKENS[symbol]
  const wallet = useTokenBalance(symbol)
  const position = useUserPosition()
  const { openAction } = useActions()
  const supplied = position.supplies[symbol]
  const debt = position.debts[symbol]

  return (
    <aside className="lg:sticky lg:top-24 rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-card)] p-5 shadow-[var(--shadow-card)]">
      <h2 className="text-base font-semibold">Your info</h2>
      {!isConnected ? (
        <div className="mt-4 space-y-3">
          <p className="text-sm text-[var(--color-muted-foreground)]">Connect a wallet to see your balances and take actions.</p>
          <ConnectKitButton />
        </div>
      ) : (
        <>
          <div className="mt-3 divide-y divide-[var(--color-border)]">
            <StatRow label="Wallet balance" mono value={`${formatToken(wallet, token.decimals)} ${symbol}`} />
            <StatRow label="Supplied" mono value={`${formatToken(supplied, token.decimals)} ${symbol}`} />
            {token.borrowEnabled && <StatRow label="Borrowed" mono value={`${formatToken(debt, token.decimals)} ${symbol}`} />}
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <Button variant="primary" disabled={paused || wallet === 0n} onClick={() => openAction('supply', symbol)}>Supply</Button>
            {token.borrowEnabled
              ? <Button variant="secondary" disabled={paused} onClick={() => openAction('borrow', symbol)}>Borrow</Button>
              : <Button variant="secondary" disabled={supplied === 0n} onClick={() => openAction('withdraw', symbol)}>Withdraw</Button>}
            {token.borrowEnabled && supplied > 0n && (
              <Button variant="secondary" onClick={() => openAction('withdraw', symbol)}>Withdraw</Button>
            )}
            {token.borrowEnabled && debt > 0n && (
              <Button variant="secondary" onClick={() => openAction('repay', symbol)}>Repay</Button>
            )}
          </div>
          {wallet === 0n && (
            <p className="mt-3 text-xs text-[var(--color-muted-foreground)]">
              No {symbol} in your wallet.{' '}
              {(symbol === 'USDC' || symbol === 'EURC') && (
                <a href="https://faucet.circle.com" target="_blank" rel="noopener noreferrer" className="text-[var(--color-primary)] hover:underline">Get testnet {symbol}</a>
              )}
            </p>
          )}
        </>
      )}
    </aside>
  )
}
