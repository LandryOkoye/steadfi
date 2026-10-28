/**
 * Landing — public marketing page (light theme, Aave-inspired): hero with a
 * live product preview, live protocol stats, Arc/Circle assets, how it works,
 * features, and a dark call-to-action. Every number shown is read on-chain.
 */
import { Link } from 'react-router-dom'
import { motion, type Variants } from 'framer-motion'
import {
  ArrowRight, ArrowsLeftRight, CalendarCheck, ChartLineUp, CurrencyCircleDollar, GasPump, LockKey,
  Note, ShieldCheck,
} from '@phosphor-icons/react'
import { NetworkArc } from '@web3icons/react'
import Logo from '../components/ui/Logo'
import TokenIcon, { TOKEN_NAMES } from '../components/ui/TokenIcon'
import { useMarketData } from '../hooks/useSteadFi'
import { compactUsd, marketTotals } from './Markets'

const reveal: Variants = {
  hidden: { opacity: 0, y: 18 },
  show: (i: number = 0) => ({ opacity: 1, y: 0, transition: { delay: i * 0.06, duration: 0.5, ease: [0.2, 0.7, 0.2, 1] } }),
}
const inView = { initial: 'hidden', whileInView: 'show', viewport: { once: true, margin: '-60px' } } as const

export default function Landing() {
  const markets = useMarketData()
  const totals = marketTotals(markets)
  const loading = markets.some(m => m.loading)

  return (
    <div className="theme-light min-h-dvh overflow-x-hidden">
      {/* ── Nav ── */}
      <header className="sticky top-0 z-40 border-b border-transparent bg-[color-mix(in_srgb,var(--color-background)_75%,transparent)] backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 md:px-6">
          <Link to="/" aria-label="SteadFi home"><Logo tone="navy" /></Link>
          <nav className="hidden md:flex items-center gap-8 text-sm text-[var(--color-muted-foreground)]" aria-label="Site">
            <a href="#assets" className="hover:text-[var(--color-foreground)]">Assets</a>
            <a href="#how" className="hover:text-[var(--color-foreground)]">How it works</a>
            <a href="#features" className="hover:text-[var(--color-foreground)]">Features</a>
            <Link to="/markets" className="hover:text-[var(--color-foreground)]">Markets</Link>
          </nav>
          <Link to="/dashboard" className="inline-flex h-10 items-center gap-1.5 rounded-full bg-[var(--color-foreground)] px-5 text-sm font-semibold text-white hover:opacity-90 transition-base">
            Launch app <ArrowRight size={14} aria-hidden="true" />
          </Link>
        </div>
      </header>

      <main>
        {/* ── Hero ── */}
        <section className="relative">
          <div className="pointer-events-none absolute inset-x-0 -top-24 h-[640px] bg-[radial-gradient(50%_60%_at_30%_30%,rgba(16,185,129,0.16),transparent_70%),radial-gradient(40%_50%_at_75%_20%,rgba(15,23,42,0.06),transparent_70%)]" aria-hidden="true" />
          <div className="relative mx-auto grid max-w-6xl items-center gap-14 px-4 pt-16 pb-20 md:px-6 md:pt-24 lg:grid-cols-[1.1fr_1fr]">
            <div>
              <motion.p variants={reveal} initial="hidden" animate="show" custom={0}
                className="inline-flex items-center gap-2 rounded-full border border-[var(--color-border)] bg-white/70 py-1 pl-1 pr-3 text-xs font-medium text-[var(--color-muted-foreground)] shadow-sm">
                <span className="grid h-6 w-6 place-items-center rounded-full bg-[var(--color-muted)]">
                  <NetworkArc variant="branded" size={15} aria-hidden="true" />
                </span>
                Live on Arc Testnet · Gas paid in USDC
              </motion.p>
              <motion.h1 variants={reveal} initial="hidden" animate="show" custom={1}
                className="mt-6 text-[44px] leading-[1.02] font-bold md:text-[68px] tracking-[-0.035em]">
                Lend stablecoins.<br />Borrow against <span className="text-gradient">cirBTC/WETH.</span>
              </motion.h1>
              <motion.p variants={reveal} initial="hidden" animate="show" custom={2}
                className="mt-6 max-w-xl text-lg leading-relaxed text-[var(--color-muted-foreground)]">
                SteadFi is a lending market for Arc. Earn interest on USDC and EURC, or borrow them against
                cirBTC and WETH with fixed terms, costs shown upfront and no separate gas token.
              </motion.p>
              <motion.div variants={reveal} initial="hidden" animate="show" custom={3} className="mt-9 flex flex-wrap gap-3">
                <Link to="/dashboard" className="inline-flex h-12 items-center gap-2 rounded-full bg-[var(--color-foreground)] px-6 text-[15px] font-semibold text-white hover:opacity-90 transition-base">
                  Launch app <ArrowRight size={16} aria-hidden="true" />
                </Link>
                <Link to="/markets" className="inline-flex h-12 items-center rounded-full border border-[var(--color-border-strong)] bg-white px-6 text-[15px] font-semibold hover:bg-[var(--color-muted)] transition-base">
                  Explore markets
                </Link>
              </motion.div>
            </div>

            <motion.div
              initial={{ opacity: 0, y: 30, rotate: -1.5 }}
              animate={{ opacity: 1, y: 0, rotate: -1.5, transition: { delay: 0.25, duration: 0.7, ease: [0.2, 0.7, 0.2, 1] } }}
              className="relative"
            >
              <ProductPreview />
            </motion.div>
          </div>
        </section>

        {/* ── Stats band ── */}
        <section className="mx-auto max-w-6xl px-4 md:px-6">
          <motion.div {...inView} variants={reveal}
            className="rounded-[28px] border border-[var(--color-border)] bg-white px-6 py-10 shadow-[var(--shadow-card)] md:px-12">
            <p className="text-center text-sm font-medium text-[var(--color-muted-foreground)]">Live protocol data, read from the chain</p>
            <dl className="mt-8 grid grid-cols-2 gap-y-8 md:grid-cols-4 md:divide-x md:divide-[var(--color-border)]">
              <BandStat label="Total supplied" value={loading ? null : compactUsd(totals.size)} />
              <BandStat label="Total borrowed" value={loading ? null : compactUsd(totals.borrowed)} />
              <BandStat label="Markets" value={String(markets.length)} />
              <BandStat label="Loan terms" value="7–180d" />
            </dl>
          </motion.div>
        </section>

        {/* ── Assets ── */}
        <section id="assets" className="mx-auto max-w-6xl scroll-mt-20 px-4 pt-28 md:px-6">
          <SectionHead eyebrow="Assets" title="Built on Arc and Circle assets" sub="Two stablecoins to lend and borrow, two majors to borrow against. Nothing else." />
          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {markets.map((m, i) => (
              <motion.div key={m.symbol} {...inView} variants={reveal} custom={i}>
                <Link to={`/markets/${m.symbol}`}
                  className="group block h-full rounded-[22px] border border-[var(--color-border)] bg-white p-6 shadow-[var(--shadow-card)] transition-base hover:-translate-y-0.5 hover:border-[var(--color-border-strong)]">
                  <TokenIcon symbol={m.symbol} size={44} />
                  <p className="mt-5 text-lg font-semibold">{TOKEN_NAMES[m.symbol]}</p>
                  <p className="text-sm text-[var(--color-muted-foreground)]">{m.symbol} · {m.borrowEnabled ? 'Lend & borrow' : 'Collateral'}</p>
                  <div className="mt-6 flex items-end justify-between">
                    <div>
                      <p className="text-xs text-[var(--color-muted-foreground)]">{m.borrowEnabled ? 'Supply APY' : 'Max LTV'}</p>
                      <p className="mono text-2xl font-semibold">{m.loading ? '…' : m.borrowEnabled ? `${m.supplyApy.toFixed(2)}%` : `${m.ltv.toFixed(0)}%`}</p>
                    </div>
                    <ArrowRight size={18} className="text-[var(--color-muted-foreground)] transition-transform group-hover:translate-x-1" aria-hidden="true" />
                  </div>
                </Link>
              </motion.div>
            ))}
          </div>
        </section>

        {/* ── How it works ── */}
        <section id="how" className="mx-auto max-w-6xl scroll-mt-20 px-4 pt-28 md:px-6">
          <SectionHead eyebrow="How it works" title="Three steps, all on-chain" />
          <ol className="mt-12 grid gap-4 md:grid-cols-3">
            {[
              { t: 'Supply collateral', d: 'Deposit cirBTC or WETH. Its value, priced by Pyth, sets how much you can borrow.' },
              { t: 'Borrow USDC or EURC', d: 'Pick an amount and a 7–180 day term. You see the fee, rate and total to repay before you sign.' },
              { t: 'Repay any time', d: 'Repay early with no penalty and withdraw your collateral. Add a payment reference if you need one.' },
            ].map((s, i) => (
              <motion.li key={s.t} {...inView} variants={reveal} custom={i}
                className="rounded-[22px] border border-[var(--color-border)] bg-white p-7 shadow-[var(--shadow-card)]">
                <span className="mono grid h-9 w-9 place-items-center rounded-full bg-[var(--color-foreground)] text-sm font-semibold text-white">{i + 1}</span>
                <h3 className="mt-6 text-xl font-semibold">{s.t}</h3>
                <p className="mt-2 text-[15px] leading-relaxed text-[var(--color-muted-foreground)]">{s.d}</p>
              </motion.li>
            ))}
          </ol>
        </section>

        {/* ── Features ── */}
        <section id="features" className="mx-auto max-w-6xl scroll-mt-20 px-4 pt-28 md:px-6">
          <SectionHead eyebrow="Why SteadFi" title="Designed for predictable credit" />
          <div className="mt-12 grid gap-4 md:grid-cols-6">
            <Feature span="md:col-span-3" Icon={GasPump} title="Gas in USDC" body="Arc uses USDC for gas, so there is no separate volatile token to hold just to pay fees." />
            <Feature span="md:col-span-3" Icon={ChartLineUp} title="Pyth Pro prices" body="Collateral is valued with Pyth’s low-latency feeds, pushed on-chain and rejected when stale." />
            <Feature span="md:col-span-2" Icon={CalendarCheck} title="Fixed terms" body="Choose 7 to 180 days. The due date is recorded on-chain." />
            <Feature span="md:col-span-2" Icon={CurrencyCircleDollar} title="Costs upfront" body="One-time fee, rate and total to repay are shown before you sign." />
            <Feature span="md:col-span-2" Icon={ArrowsLeftRight} title="Bridge with CCTP" body="Move USDC in from Ethereum, Base, Arbitrum and OP testnets." />
            <Feature span="md:col-span-3" Icon={LockKey} title="Timelocked changes" body="Risk parameter changes queue in a timelock before they apply, giving users time to react." />
            <Feature span="md:col-span-3" Icon={Note} title="Payment references" body="Attach an invoice number or reference to a repayment. It is stored on-chain with the transaction." />
          </div>
        </section>

        {/* ── CTA ── */}
        <section className="mx-auto max-w-6xl px-4 pt-28 pb-16 md:px-6">
          <motion.div {...inView} variants={reveal}
            className="theme-dark relative overflow-hidden rounded-[32px] bg-[var(--color-background)] px-6 py-20 text-center text-[var(--color-foreground)] md:py-24">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_80%_at_50%_0%,rgba(16,185,129,0.22),transparent_70%)]" aria-hidden="true" />
            <div className="relative">
              <p className="inline-flex items-center gap-2 rounded-full border border-[var(--color-border)] px-3 py-1 text-xs text-[var(--color-muted-foreground)]">
                <ShieldCheck size={13} aria-hidden="true" /> Overcollateralized · Non-custodial
              </p>
              <h2 className="mx-auto mt-6 max-w-2xl text-4xl font-bold md:text-6xl tracking-[-0.03em]">
                Put your dollars to work <span className="text-gradient">on Arc.</span>
              </h2>
              <p className="mx-auto mt-5 max-w-lg text-[var(--color-muted-foreground)]">
                Connect a wallet, grab testnet USDC from Circle’s faucet, and try a full lend-borrow-repay cycle.
              </p>
              <div className="mt-9 flex flex-wrap justify-center gap-3">
                <Link to="/dashboard" className="inline-flex h-12 items-center gap-2 rounded-full bg-white px-6 text-[15px] font-semibold text-[#07080B] hover:opacity-90 transition-base">
                  Launch app <ArrowRight size={16} aria-hidden="true" />
                </Link>
                <a href="https://faucet.circle.com" target="_blank" rel="noopener noreferrer"
                  className="inline-flex h-12 items-center rounded-full border border-[var(--color-border-strong)] px-6 text-[15px] font-semibold hover:bg-[var(--color-muted)] transition-base">
                  Get testnet USDC
                </a>
              </div>
            </div>
          </motion.div>
        </section>
      </main>

      <footer className="border-t border-[var(--color-border)]">
        <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-10 md:flex-row md:items-center md:justify-between md:px-6">
          <Logo size={24} tone="navy" />
          <nav className="flex flex-wrap gap-6 text-sm text-[var(--color-muted-foreground)]" aria-label="Footer">
            <Link to="/dashboard" className="hover:text-[var(--color-foreground)]">App</Link>
            <Link to="/markets" className="hover:text-[var(--color-foreground)]">Markets</Link>
            <Link to="/bridge" className="hover:text-[var(--color-foreground)]">Bridge</Link>
            <a href="https://faucet.circle.com" target="_blank" rel="noopener noreferrer" className="hover:text-[var(--color-foreground)]">Faucet</a>
          </nav>
        </div>
        <p className="mx-auto max-w-6xl px-4 pb-10 text-xs leading-relaxed text-[var(--color-muted-foreground)] md:px-6">
          SteadFi runs on Arc Testnet with test tokens only. The smart contracts have not been externally audited.
          Nothing on this site is financial advice. Borrowing carries liquidation risk.
        </p>
      </footer>
    </div>
  )
}

// ── Pieces ───────────────────────────────────────────────────────────────────

function SectionHead({ eyebrow, title, sub }: { eyebrow: string; title: string; sub?: string }) {
  return (
    <motion.div {...inView} variants={reveal} className="max-w-2xl">
      <p className="text-sm font-semibold text-[var(--color-primary)]">{eyebrow}</p>
      <h2 className="mt-3 text-4xl font-bold tracking-[-0.03em] md:text-5xl">{title}</h2>
      {sub && <p className="mt-4 text-lg text-[var(--color-muted-foreground)]">{sub}</p>}
    </motion.div>
  )
}

function BandStat({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex flex-col-reverse items-center text-center md:px-4">
      <dt className="mt-1 text-sm text-[var(--color-muted-foreground)]">{label}</dt>
      <dd className="mono text-3xl font-bold tracking-tight text-gradient md:text-4xl">
        {value ?? <span className="skeleton h-9 w-28 align-middle" />}
      </dd>
    </div>
  )
}

function Feature({ span, Icon, title, body }: {
  span: string; Icon: typeof GasPump; title: string; body: string
}) {
  return (
    <motion.div {...inView} variants={reveal}
      className={`${span} rounded-[22px] border border-[var(--color-border)] bg-white p-7 shadow-[var(--shadow-card)]`}>
      <span className="grid h-11 w-11 place-items-center rounded-2xl bg-[var(--color-muted)]">
        <Icon size={22} className="text-[var(--color-primary)]" aria-hidden="true" />
      </span>
      <h3 className="mt-6 text-lg font-semibold">{title}</h3>
      <p className="mt-2 text-[15px] leading-relaxed text-[var(--color-muted-foreground)]">{body}</p>
    </motion.div>
  )
}

/** Dark product preview in the hero: live markets, styled like the app. */
function ProductPreview() {
  const markets = useMarketData()
  return (
    <div className="theme-dark rounded-[26px] border border-black/5 bg-[var(--color-background)] p-2 text-[var(--color-foreground)] shadow-[0_40px_80px_-30px_rgba(16,24,40,0.45)]">
      <div className="flex items-center gap-1.5 px-3 py-2" aria-hidden="true">
        <span className="h-2.5 w-2.5 rounded-full bg-[#FF5F57]" />
        <span className="h-2.5 w-2.5 rounded-full bg-[#FEBC2E]" />
        <span className="h-2.5 w-2.5 rounded-full bg-[#28C840]" />
        <span className="ml-3 text-[11px] text-[var(--color-muted-foreground)]">steadfi · Arc market</span>
      </div>
      <div className="rounded-[20px] border border-[var(--color-border)] bg-[var(--color-card)] p-5">
        <div className="flex items-end justify-between">
          <div>
            <p className="text-xs text-[var(--color-muted-foreground)]">Markets</p>
            <p className="mt-1 text-lg font-semibold">Live rates</p>
          </div>
          <span className="flex items-center gap-1.5 rounded-full bg-[color-mix(in_srgb,var(--color-success)_12%,transparent)] px-2.5 py-1 text-[11px] font-medium text-[var(--color-success)]">
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-success)]" aria-hidden="true" /> On-chain
          </span>
        </div>
        <ul className="mt-4 divide-y divide-[var(--color-border)]">
          {markets.map(m => (
            <li key={m.symbol} className="flex items-center justify-between py-3">
              <span className="flex items-center gap-3">
                <TokenIcon symbol={m.symbol} size={30} />
                <span>
                  <span className="block text-sm font-semibold">{m.symbol}</span>
                  <span className="block text-[11px] text-[var(--color-muted-foreground)]">{m.borrowEnabled ? 'Lend & borrow' : 'Collateral'}</span>
                </span>
              </span>
              <span className="text-right">
                <span className="mono block text-sm font-semibold">
                  {m.loading ? '…' : m.borrowEnabled ? `${m.supplyApy.toFixed(2)}%` : `${m.ltv.toFixed(0)}%`}
                </span>
                <span className="block text-[11px] text-[var(--color-muted-foreground)]">{m.borrowEnabled ? 'Supply APY' : 'Max LTV'}</span>
              </span>
            </li>
          ))}
        </ul>
        <div className="mt-3 rounded-2xl border border-[var(--color-border)] bg-[color-mix(in_srgb,var(--color-background)_60%,transparent)] p-4">
          <div className="flex items-center justify-between text-xs">
            <span className="text-[var(--color-muted-foreground)]">Example position · health factor</span>
            <span className="mono font-semibold hf-safe">2.14 · Safe</span>
          </div>
          <div className="relative mt-3 h-1.5 rounded-full bg-[linear-gradient(90deg,var(--color-destructive)_0%,var(--color-warning)_35%,var(--color-success)_70%)]">
            <span className="absolute top-1/2 h-3.5 w-1 -translate-y-1/2 rounded-full bg-white shadow-[0_0_0_3px_var(--color-background)]" style={{ left: '64%' }} />
          </div>
        </div>
      </div>
    </div>
  )
}
