/**
 * Keeper console — run the price keeper / liquidator from this browser tab.
 * Open to any connected wallet: keeper calls are permissionless and spend only
 * the keeper wallet's gas. Engine and wallet logic live in src/admin/keeper/.
 */

import { useEffect, useState, type ReactNode } from 'react'
import { useAccount } from 'wagmi'
import {
  Robot, Play, Stop, ArrowClockwise, Copy, Key, LockSimple, LockSimpleOpen, Trash,
  ArrowDown, ArrowUp, ArrowSquareOut, Warning, Info,
} from '@phosphor-icons/react'
import { toast } from 'sonner'
import { Card, CardHeader, CardTitle } from '../../components/ui/Card'
import Button from '../../components/ui/Button'
import { ConfirmButton, Field, KpiTile, Pill, inputCls, shortAddr } from '../components'
import { IS_MAINNET, NETWORK_NAME, addrUrl, txUrl } from '../../lib/steadfi'
import { useKeeper } from '../keeper/KeeperProvider'
import { MIN_PASSPHRASE } from '../keeper/wallet'
import type { KeeperSettings, LogEntry, PriceRow } from '../keeper/engine'

function useNow(ms = 1000) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms)
    return () => clearInterval(t)
  }, [ms])
  return now
}

function errMsg(e: unknown) {
  const err = e as { shortMessage?: string; message?: string }
  return (err?.shortMessage ?? err?.message ?? String(e)).split('\n')[0]
}

function ago(sec: number | null) {
  if (sec === null) return '—'
  if (sec < 90) return `${Math.max(0, Math.round(sec))}s`
  if (sec < 5400) return `${Math.round(sec / 60)}m`
  return `${(sec / 3600).toFixed(1)}h`
}

const usdc = (n: number | null, frac = 4) => (n === null ? '—' : `${n.toFixed(frac)} USDC`)

export default function Keeper() {
  const k = useKeeper()
  const { snap } = k
  const now = useNow()
  const running = snap.status !== 'idle'
  const canRun = !!k.keeperAddress && (k.mode === 'connected' || k.unlocked)

  const status = snap.status === 'running'
    ? <Pill tone="success">{snap.busy ? 'Running · working' : 'Running'}</Pill>
    : snap.status === 'stopping'
      ? <Pill tone="warning">Stopping after this step</Pill>
      : snap.busy
        ? <Pill tone="warning">Running once</Pill>
        : snap.autoStopReason
          ? <Pill tone="danger">Auto-stopped</Pill>
          : <Pill tone="muted">Stopped</Pill>

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold" style={{ fontFamily: 'var(--font-heading)' }}>
            <Robot size={22} aria-hidden="true" /> Keeper {status}
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-[var(--color-muted-foreground)]">
            Pushes Pyth Pro prices on-chain and liquidates unhealthy loans, from this tab.
            Anyone can run it — these calls are permissionless and only spend the keeper wallet's gas.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {snap.status === 'running'
            ? <Button variant="danger" onClick={k.stop}><Stop size={15} weight="fill" aria-hidden="true" /> Stop</Button>
            : <Button
                variant="brand"
                onClick={k.start}
                disabled={!canRun || k.mode !== 'browser' || snap.busy || snap.status === 'stopping'}
                title={k.mode !== 'browser' ? 'Auto-run needs the browser keeper wallet' : undefined}
              ><Play size={15} weight="fill" aria-hidden="true" /> Start</Button>}
          <Button variant="secondary" onClick={k.runOnce} disabled={!canRun || running || snap.busy} loading={snap.busy && !running}>
            <ArrowClockwise size={15} aria-hidden="true" /> Run once
          </Button>
        </div>
      </div>

      {IS_MAINNET && (
        <Notice tone="warning">
          {NETWORK_NAME} mainnet: every transaction spends real USDC gas (a price push is about 0.003 USDC).
          The session budget below stops the keeper automatically.
        </Notice>
      )}
      {snap.autoStopReason && snap.status === 'idle' && <Notice tone="danger">Auto-stopped: {snap.autoStopReason}</Notice>}
      {running && <Notice tone="info">Keep this tab open — closing it stops the keeper. Switching admin tabs is fine.</Notice>}

      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <KpiTile
          label="Gas this session"
          value={snap.spentUsdc.toFixed(4)}
          sub={snap.settings.sessionBudgetUsdc > 0 ? `of ${snap.settings.sessionBudgetUsdc} USDC budget` : 'no budget set'}
          tone={snap.settings.sessionBudgetUsdc > 0 && snap.spentUsdc >= snap.settings.sessionBudgetUsdc * 0.8 ? 'warning' : undefined}
        />
        <KpiTile label="Transactions" value={snap.txs} sub={`${snap.cycles} cycles`} />
        <KpiTile
          label="Borrowers"
          value={snap.borrowers}
          sub={`${snap.nearLiquidation} near · ${snap.liquidatable} liquidatable`}
          tone={snap.liquidatable > 0 ? 'danger' : snap.nearLiquidation > 0 ? 'warning' : undefined}
        />
        <KpiTile
          label="Next cycle"
          value={snap.busy ? 'now' : snap.nextCycleAt ? ago((snap.nextCycleAt - now) / 1000) : '—'}
          sub={snap.lastCycleAt ? `last ${ago((now - snap.lastCycleAt) / 1000)} ago` : 'not run yet'}
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <WalletCard />
        <PricesCard prices={snap.prices} chainTime={snap.chainTime} now={now} decision={snap.lastDecision} />
      </div>

      <SettingsCard settings={snap.settings} onChange={k.updateSettings} />
      <LogCard logs={snap.logs} onClear={k.clearLogs} />
      <HowTo />
    </div>
  )
}

// ── Wallet ───────────────────────────────────────────────────────────────────

function WalletCard() {
  const k = useKeeper()
  const { isConnected } = useAccount()
  const [busy, setBusy] = useState<string | null>(null)

  async function act(key: string, fn: () => Promise<unknown>, ok?: string) {
    setBusy(key)
    try {
      await fn()
      if (ok) toast.success(ok)
    } catch (e) {
      toast.error(errMsg(e))
    } finally {
      setBusy(null)
    }
  }

  return (
    <Card>
      <CardHeader><CardTitle>Keeper wallet</CardTitle></CardHeader>
      <div className="space-y-4">
        <div className="inline-flex rounded-lg border border-[var(--color-border)] p-0.5" role="tablist">
          {(['browser', 'connected'] as const).map(m => (
            <button
              key={m}
              role="tab"
              aria-selected={k.mode === m}
              onClick={() => k.setMode(m)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-base cursor-pointer ${
                k.mode === m ? 'bg-[var(--color-muted)] text-[var(--color-foreground)]' : 'text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]'}`}
            >
              {m === 'browser' ? 'Browser keeper wallet' : 'Connected wallet'}
            </button>
          ))}
        </div>

        {k.mode === 'connected' ? (
          <>
            <p className="text-sm text-[var(--color-muted-foreground)]">
              Uses the wallet connected at the top right. Each transaction needs your confirmation,
              so only <strong>Run once</strong> is available. Use the browser keeper wallet for auto-run.
            </p>
            {k.keeperAddress ? <AddressRow address={k.keeperAddress} balance={k.balanceUsdc} /> : <p className="text-sm">Connect a wallet to continue.</p>}
          </>
        ) : !k.stored ? (
          <CreateWallet busy={busy} act={act} />
        ) : !k.unlocked ? (
          <>
            <AddressRow address={k.stored.address} balance={k.balanceUsdc} />
            <PassphraseForm
              label="Unlock"
              icon={<LockSimpleOpen size={14} aria-hidden="true" />}
              loading={busy === 'unlock'}
              onSubmit={p => act('unlock', () => k.unlock(p), 'Keeper wallet unlocked')}
            />
            <ConfirmButton variant="secondary" onConfirm={k.forget}>
              <Trash size={14} aria-hidden="true" /> Forget this wallet
            </ConfirmButton>
          </>
        ) : (
          <>
            <AddressRow address={k.stored.address} balance={k.balanceUsdc} />
            <FundRow
              disabled={!isConnected}
              loading={busy === 'fund'}
              onFund={amount => act('fund', () => k.fund(amount), 'Keeper wallet funded')}
            />
            <div className="flex flex-wrap gap-2">
              <ConfirmButton
                variant="secondary"
                disabled={!isConnected || !k.balanceUsdc}
                loading={busy === 'withdraw'}
                onConfirm={() => act('withdraw', k.withdrawAll, 'Funds sent back to your connected wallet')}
              >
                <ArrowUp size={14} aria-hidden="true" /> Withdraw all
              </ConfirmButton>
              <ExportKey />
              <Button size="sm" variant="ghost" onClick={k.lock}>
                <LockSimple size={14} aria-hidden="true" /> Lock
              </Button>
            </div>
            <p className="text-[11px] text-[var(--color-muted-foreground)]">
              Hot wallet stored encrypted in this browser only — keep a small balance (0.05 USDC is plenty)
              and withdraw when done. Lost passphrase = lost wallet.
            </p>
          </>
        )}
      </div>
    </Card>
  )
}

function AddressRow({ address, balance }: { address: string; balance: number | null }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-[var(--color-muted)] px-3 py-2.5">
      <span className="flex items-center gap-2 text-sm">
        <a className="mono hover:underline" href={addrUrl(address)} target="_blank" rel="noreferrer">{shortAddr(address)}</a>
        <button
          className="text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)] cursor-pointer"
          aria-label="Copy address"
          onClick={() => { void navigator.clipboard.writeText(address); toast.success('Address copied') }}
        ><Copy size={14} /></button>
      </span>
      <span className={`mono text-sm ${balance !== null && balance < 0.01 ? 'text-[var(--color-destructive)]' : ''}`}>
        {usdc(balance)}
      </span>
    </div>
  )
}

function CreateWallet({ busy, act }: { busy: string | null; act: (k: string, fn: () => Promise<unknown>, ok?: string) => Promise<void> }) {
  const k = useKeeper()
  const [importing, setImporting] = useState(false)
  const [pass, setPass] = useState('')
  const [confirm, setConfirm] = useState('')
  const [key, setKey] = useState('')
  const mismatch = confirm.length > 0 && pass !== confirm
  const valid = pass.length >= MIN_PASSPHRASE && pass === confirm && (!importing || key.trim().length > 0)

  return (
    <form
      className="space-y-3"
      onSubmit={e => {
        e.preventDefault()
        if (!valid) return
        void act('create', () => (importing ? k.importWallet(key, pass) : k.createWallet(pass)),
          importing ? 'Keeper wallet imported' : 'Keeper wallet created').then(() => setKey(''))
      }}
    >
      <p className="text-sm text-[var(--color-muted-foreground)]">
        Create a dedicated keeper wallet in this browser. It signs price pushes on its own, so the keeper can run unattended.
      </p>
      {importing && (
        <Field label="Private key" hint="Only import a key used for nothing else.">
          <input className={inputCls} type="password" autoComplete="off" value={key} onChange={e => setKey(e.target.value)} placeholder="0x…" />
        </Field>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Passphrase" hint={`At least ${MIN_PASSPHRASE} characters`}>
          <input className={inputCls} type="password" autoComplete="new-password" value={pass} onChange={e => setPass(e.target.value)} />
        </Field>
        <Field label="Confirm passphrase" hint={mismatch ? 'Does not match' : undefined}>
          <input className={inputCls} type="password" autoComplete="new-password" value={confirm} onChange={e => setConfirm(e.target.value)} />
        </Field>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button size="sm" type="submit" disabled={!valid} loading={busy === 'create'}>
          <Key size={14} aria-hidden="true" /> {importing ? 'Import wallet' : 'Create keeper wallet'}
        </Button>
        <button type="button" className="text-xs text-[var(--color-primary)] underline cursor-pointer" onClick={() => setImporting(v => !v)}>
          {importing ? 'Generate a new key instead' : 'Import an existing key'}
        </button>
      </div>
    </form>
  )
}

function PassphraseForm({ label, icon, loading, onSubmit }: { label: string; icon: ReactNode; loading: boolean; onSubmit: (p: string) => void }) {
  const [pass, setPass] = useState('')
  return (
    <form className="flex gap-2" onSubmit={e => { e.preventDefault(); if (pass) onSubmit(pass); setPass('') }}>
      <input className={inputCls} type="password" autoComplete="current-password" placeholder="Passphrase" value={pass} onChange={e => setPass(e.target.value)} />
      <Button size="sm" type="submit" disabled={!pass} loading={loading}>{icon} {label}</Button>
    </form>
  )
}

function FundRow({ disabled, loading, onFund }: { disabled: boolean; loading: boolean; onFund: (amount: string) => void }) {
  const [amount, setAmount] = useState('0.05')
  return (
    <form className="flex gap-2" onSubmit={e => { e.preventDefault(); onFund(amount) }}>
      <input className={inputCls} inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} aria-label="USDC amount to fund" />
      <Button size="sm" type="submit" disabled={disabled} loading={loading} title={disabled ? 'Connect a wallet to fund from' : undefined}>
        <ArrowDown size={14} aria-hidden="true" /> Fund
      </Button>
    </form>
  )
}

function ExportKey() {
  const k = useKeeper()
  const [open, setOpen] = useState(false)
  const [revealed, setRevealed] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const close = () => { setOpen(false); setRevealed(null) }

  return (
    <>
      <Button size="sm" variant="ghost" onClick={() => setOpen(true)}><Key size={14} aria-hidden="true" /> Export key</Button>
      {open && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4" onClick={close}>
          <div className="w-full max-w-md" onClick={e => e.stopPropagation()}>
          <Card className="space-y-3">
              <h2 className="font-semibold">Export keeper private key</h2>
              <p className="text-sm text-[var(--color-muted-foreground)]">
                Anyone with this key controls the keeper wallet. Store it somewhere safe and never share it.
              </p>
              {revealed ? (
                <>
                  <p className="mono break-all rounded-lg bg-[var(--color-muted)] p-3 text-xs">{revealed}</p>
                  <div className="flex justify-end gap-2">
                    <Button size="sm" variant="secondary" onClick={() => { void navigator.clipboard.writeText(revealed); toast.success('Key copied') }}>
                      <Copy size={14} aria-hidden="true" /> Copy
                    </Button>
                    <Button size="sm" onClick={close}>Done</Button>
                  </div>
                </>
              ) : (
                <>
                  <PassphraseForm
                    label="Reveal"
                    icon={<Key size={14} aria-hidden="true" />}
                    loading={loading}
                    onSubmit={async p => {
                      setLoading(true)
                      try { setRevealed(await k.exportKey(p)) } catch (e) { toast.error(errMsg(e)) } finally { setLoading(false) }
                    }}
                  />
                  <div className="flex justify-end"><Button size="sm" variant="ghost" onClick={close}>Cancel</Button></div>
                </>
              )}
          </Card>
          </div>
        </div>
      )}
    </>
  )
}

// ── Prices ───────────────────────────────────────────────────────────────────

function PricesCard({ prices, chainTime, now, decision }: { prices: PriceRow[]; chainTime: number | null; now: number; decision: string | null }) {
  // Chain time advances with the wall clock between refreshes.
  const t = chainTime === null ? now / 1000 : Math.max(chainTime, now / 1000)

  return (
    <Card>
      <CardHeader><CardTitle>Oracle prices</CardTitle></CardHeader>
      {prices.length === 0 ? (
        <p className="text-sm text-[var(--color-muted-foreground)]">Loading prices…</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-[var(--color-muted-foreground)]">
                <th className="pb-2 font-medium">Asset</th>
                <th className="pb-2 font-medium text-right">On-chain</th>
                <th className="pb-2 font-medium text-right">Age</th>
                <th className="pb-2 font-medium text-right">Pyth now</th>
                <th className="pb-2 font-medium text-right">Status</th>
              </tr>
            </thead>
            <tbody>
              {prices.map(r => {
                const age = r.onchainPublishTime === null ? null : t - r.onchainPublishTime
                const pythAge = r.pythPublishTime === null ? null : t - r.pythPublishTime
                const stale = age === null || age >= r.maxAge
                const pythIdle = pythAge !== null && pythAge >= r.maxAge
                return (
                  <tr key={r.symbol} className="border-t border-[var(--color-border)]">
                    <td className="py-2 font-medium">{r.symbol}</td>
                    <td className="py-2 text-right mono">{fmtPrice(r.onchainPrice)}</td>
                    <td className="py-2 text-right mono">{ago(age)}</td>
                    <td className="py-2 text-right mono">{fmtPrice(r.pythPrice)}</td>
                    <td className="py-2 text-right">
                      {!stale ? <Pill tone="success">Fresh</Pill>
                        : pythIdle ? <Pill tone="muted">Market closed</Pill>
                        : <Pill tone="danger">Stale</Pill>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-3 text-[11px] text-[var(--color-muted-foreground)]">
        Prices older than {prices[0]?.maxAge ?? 300}s are stale: borrows and liquidations touching that asset revert until the keeper pushes.
        {decision && <> Last decision: <span className="text-[var(--color-foreground)]">{decision}</span>.</>}
      </p>
    </Card>
  )
}

function fmtPrice(n: number | null) {
  if (n === null) return '—'
  return `$${n.toLocaleString(undefined, { maximumFractionDigits: n < 10 ? 4 : 2 })}`
}

// ── Settings ─────────────────────────────────────────────────────────────────

function NumberSetting({ label, hint, value, step, onCommit }: {
  label: string; hint: string; value: number; step: string; onCommit: (v: number) => void
}) {
  const [draft, setDraft] = useState(String(value))
  useEffect(() => setDraft(String(value)), [value])
  return (
    <Field label={label} hint={hint}>
      <input
        className={inputCls}
        type="number"
        min="0"
        step={step}
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={() => { const v = Number(draft); if (Number.isFinite(v)) onCommit(v); else setDraft(String(value)) }}
      />
    </Field>
  )
}

function Toggle({ label, hint, checked, onChange }: { label: string; hint: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-start gap-3 cursor-pointer">
      <input type="checkbox" className="mt-1 accent-[var(--color-primary)]" checked={checked} onChange={e => onChange(e.target.checked)} />
      <span>
        <span className="block text-sm font-medium">{label}</span>
        <span className="block text-[11px] text-[var(--color-muted-foreground)]">{hint}</span>
      </span>
    </label>
  )
}

function SettingsCard({ settings: s, onChange }: { settings: KeeperSettings; onChange: (p: Partial<KeeperSettings>) => void }) {
  return (
    <Card>
      <CardHeader><CardTitle>Settings</CardTitle></CardHeader>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <NumberSetting label="Interval (seconds)" hint="Minimum 30" step="1" value={s.intervalSec} onCommit={v => onChange({ intervalSec: v })} />
        <NumberSetting label="Refresh margin (seconds)" hint="Push when a price has this long left" step="1" value={s.refreshMarginSec} onCommit={v => onChange({ refreshMarginSec: v })} />
        <NumberSetting label="Session budget (USDC)" hint="Auto-stop at this much gas; 0 = no limit" step="0.01" value={s.sessionBudgetUsdc} onCommit={v => onChange({ sessionBudgetUsdc: v })} />
        <NumberSetting label="Minimum balance (USDC)" hint="Auto-stop below this" step="0.01" value={s.minBalanceUsdc} onCommit={v => onChange({ minBalanceUsdc: v })} />
      </div>
      <div className="mt-5 grid gap-4 sm:grid-cols-3">
        <Toggle label="Gas saver" hint="Only push prices that are about to go stale, or when a loan is near liquidation" checked={s.gasSaver} onChange={v => onChange({ gasSaver: v })} />
        <Toggle label="Liquidations" hint="Repay unhealthy loans with the keeper's own USDC/EURC and receive collateral" checked={s.liquidationsOn} onChange={v => onChange({ liquidationsOn: v })} />
        <Toggle label="Dry run" hint="Simulate everything, send nothing" checked={s.dryRun} onChange={v => onChange({ dryRun: v })} />
      </div>
    </Card>
  )
}

// ── Log ──────────────────────────────────────────────────────────────────────

const LEVEL: Record<LogEntry['level'], { label: string; tone: 'success' | 'warning' | 'danger' | 'muted' }> = {
  info: { label: 'Info', tone: 'muted' },
  warn: { label: 'Warn', tone: 'warning' },
  error: { label: 'Error', tone: 'danger' },
  tx: { label: 'Tx', tone: 'success' },
}

function LogCard({ logs, onClear }: { logs: LogEntry[]; onClear: () => void }) {
  return (
    <Card>
      <CardHeader className="flex items-center justify-between">
        <CardTitle>Activity</CardTitle>
        <Button size="sm" variant="ghost" onClick={onClear} disabled={logs.length === 0}>Clear</Button>
      </CardHeader>
      {logs.length === 0 ? (
        <p className="py-6 text-center text-sm text-[var(--color-muted-foreground)]">No activity yet. Press Run once to try a cycle.</p>
      ) : (
        <ul className="max-h-96 space-y-1 overflow-y-auto">
          {logs.map(l => (
            <li key={l.id} className="flex items-start gap-3 rounded-md px-2 py-1.5 text-sm hover:bg-[var(--color-muted)]">
              <span className="mono w-16 shrink-0 pt-0.5 text-[11px] text-[var(--color-muted-foreground)]">
                {new Date(l.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </span>
              <span className="w-12 shrink-0"><Pill tone={LEVEL[l.level].tone}>{LEVEL[l.level].label}</Pill></span>
              <span className="min-w-0 flex-1 break-words">
                {l.message}
                {l.costUsdc !== undefined && <span className="mono text-[var(--color-muted-foreground)]"> · {l.costUsdc.toFixed(5)} USDC</span>}
                {l.txHash && (
                  <a className="ml-2 inline-flex items-center gap-1 text-[var(--color-primary)] hover:underline" href={txUrl(l.txHash)} target="_blank" rel="noreferrer">
                    {shortAddr(l.txHash)} <ArrowSquareOut size={12} aria-hidden="true" />
                  </a>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

// ── Help ─────────────────────────────────────────────────────────────────────

function HowTo() {
  return (
    <Card>
      <CardHeader><CardTitle>Try the keeper</CardTitle></CardHeader>
      <ol className="list-decimal space-y-1.5 pl-5 text-sm text-[var(--color-muted-foreground)]">
        <li>Connect any wallet on {NETWORK_NAME} (top right). No admin role needed.</li>
        <li>Create a browser keeper wallet with a passphrase.</li>
        <li>Fund it with about 0.05 USDC from your connected wallet.</li>
        <li>Press <strong>Run once</strong>: the keeper fetches signed Pyth prices and pushes them if they're due. Follow the tx link in Activity.</li>
        <li>Press <strong>Start</strong> to keep it running every minute, then <strong>Stop</strong>. The session budget caps what it can spend.</li>
        <li>When done, <strong>Withdraw all</strong> returns the remaining USDC to your wallet.</li>
      </ol>
    </Card>
  )
}

function Notice({ tone, children }: { tone: 'warning' | 'danger' | 'info'; children: ReactNode }) {
  const color = tone === 'danger' ? 'var(--color-destructive)' : tone === 'warning' ? 'var(--color-warning)' : 'var(--color-primary)'
  const Icon = tone === 'info' ? Info : Warning
  return (
    <div
      className="flex items-start gap-2.5 rounded-lg border px-3.5 py-2.5 text-sm"
      style={{ borderColor: `color-mix(in srgb, ${color} 35%, transparent)`, background: `color-mix(in srgb, ${color} 8%, transparent)` }}
    >
      <Icon size={16} className="mt-0.5 shrink-0" style={{ color }} aria-hidden="true" />
      <span>{children}</span>
    </div>
  )
}
