/**
 * Keeper page — src/admin/pages/Keeper.tsx
 *
 * Browser-based keeper control panel. Operators (and hackathon judges with
 * no admin role) can create/connect a keeper wallet, start/stop auto-run,
 * run one price cycle, and monitor live.
 *
 * Mounted inside KeeperProvider; all engine logic is in src/admin/keeper/.
 *
 * ⚠ Money safety: every action that sends a transaction costs real USDC gas
 * (Arc uses USDC as the gas token). On mainnet, "Run once" and auto-run
 * will spend funds. Always test on testnet first.
 */

import { useEffect, useState, useRef } from 'react'
import {
  Robot, Play, Stop, Copy, ArrowRight, Key, Lock, Plus, Minus,
  Trash, Warning, CheckCircle, Info,
} from '@phosphor-icons/react'
import { useAccount } from 'wagmi'
import { useKeeper } from '../keeper/KeeperProvider'
import { Card, CardHeader, CardTitle } from '../../components/ui/Card'
import Button from '../../components/ui/Button'
import { Pill, shortAddr, fmtUsd } from '../components'
import { addrUrl, TOKENS, ARC_CHAIN_ID } from '../../lib/steadfi'
import { toast } from 'sonner'

const NETWORK_LABEL = ARC_CHAIN_ID === 5042 ? 'Arc Mainnet' : 'Arc Testnet'
const NETWORK_TONE = ARC_CHAIN_ID === 5042 ? 'danger' : 'warning'

function msToSecs(ms: number | null): string {
  if (ms === null) return '—'
  const s = Math.max(0, Math.round(ms / 1000))
  return `${s}s`
}

type KeeperEvent = {
  type: string
  asset?: string
  priceUsd?: number | null
  ageSec?: number | null
  fresh?: boolean
  hash?: string
  action?: string
  costUsdc?: number | null
  status?: 'sent' | 'confirmed' | 'failed'
  message?: string
}

export default function Keeper() {
  const { address: connectedAddress } = useAccount()
  const {
    state, settings, events, wallet,
    start, stop, runOnce, updateSettings,
    createWallet, importWallet, unlockWallet, lockWallet,
    fundWallet, withdrawWallet, exportWallet, forgetWallet,
    setConnectedWallet,
  } = useKeeper()

  const [walletMode, setWalletMode] = useState<'browser' | 'connected'>(wallet.mode)
  const [passphrase, setPassphrase] = useState('')
  const [importKey, setImportKey] = useState('')
  const [fundAmount, setFundAmount] = useState('0.05')
  const [showExportConfirm, setShowExportConfirm] = useState(false)
  const [exportPassphrase, setExportPassphrase] = useState('')
  const [autoStopBudget, setAutoStopBudget] = useState(String(settings.sessionBudgetUsdc))
  const [showForgetConfirm, setShowForgetConfirm] = useState(false)
  const [forgetPassphrase, setForgetPassphrase] = useState('')
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Status pill
  const statusLabel = (() => {
    switch (state.status) {
      case 'running': return 'Running'
      case 'run-once': return 'Run once'
      case 'error': return 'Error'
      case 'auto-stopped': return `Auto-stopped${state.autoStoppedReason ? `: ${state.autoStoppedReason}` : ''}`
      default: return 'Stopped'
    }
  })()

  // Poll balance while running
  useEffect(() => {
    if (state.status === 'running' || state.status === 'run-once') {
      timerRef.current = setInterval(() => {
        // noop: balance is refreshed by engine events
      }, 15_000)
    } else {
      if (timerRef.current) clearInterval(timerRef.current)
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [state.status])

  // ── Guardrails ──────────────────────────────────────────────────────

  const isMainnet = ARC_CHAIN_ID === 5042

  // ── Render ─────────────────────────────────────────────────────────

  return (
    <div className="space-y-5">
      {/* ── Amber admin header banner ── */}
      <div className="border border-[color-mix(in_srgb,var(--color-warning)_40%,transparent)] bg-[color-mix(in_srgb,var(--color-warning)_8%,transparent)] rounded-lg p-4">
        <div className="flex items-start gap-3">
          <Robot size={16} className="text-[var(--color-warning)] mt-0.5" aria-hidden="true" />
          <div>
            <h2 className="text-sm font-semibold text-[var(--color-foreground)]">Keeper — price keeper &amp; liquidator</h2>
            <p className="text-[10px] text-[var(--color-muted-foreground)]">
              Browser-based keeper. Runs Pyth price pushes and liquidates unhealthy borrowers.
              {isMainnet
                ? '⚠ On Arc MAINNET this spends real USDC gas. Test on testnet first.'
                : 'Running on Arc Testnet — test tokens only.'}
            </p>
          </div>
        </div>
      </div>

      {/* ── Header ── */}
      <Card>
        <CardHeader><CardTitle>Control</CardTitle></CardHeader>
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Robot size={18} aria-hidden="true" />
              <span className="font-semibold">Keeper status</span>
              <span className={`ml-auto px-2 py-0.5 rounded text-[10px] font-medium ${
                state.status === 'running' ? 'bg-[var(--color-success)]/10 text-[var(--color-success)] border border-[var(--color-success)]/20' :
                state.status === 'error' || state.status === 'auto-stopped' ? 'bg-[var(--color-destructive)]/10 text-[var(--color-destructive)] border border-[var(--color-destructive)]/20' :
                'bg-[var(--color-muted)]/10 text-[var(--color-muted-foreground)] border border-[var(--color-muted)]/20'
              }`}>{statusLabel}</span>
            </div>
            <div className="flex items-center gap-2 text-xs text-[var(--color-muted-foreground)]">
              <span className={`rounded bg-[color-mix(in_srgb,var(--color-${NETWORK_TONE})_15%,transparent)] px-2 py-0.5 text-[var(--color-${NETWORK_TONE})]`}>
                {NETWORK_LABEL}
              </span>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {wallet.mode === 'browser' && wallet.unlocked && state.status !== 'running' ? (
              <Button
                onClick={start}
                variant="primary"
              >
                <Play size={14} aria-hidden="true" /> Start auto-run
              </Button>
            ) : (
              <Button onClick={stop} variant="danger" disabled={state.status === 'stopped'}>
                <Stop size={14} aria-hidden="true" /> Stop
              </Button>
            )}
            <Button
              onClick={runOnce}
              disabled={state.status === 'running' || !wallet.address || !wallet.unlocked}
              variant={isMainnet ? 'danger' : 'primary'}
            >
              <Warning size={14} aria-hidden="true" /> Run once
            </Button>
            <span className="ml-auto text-[11px] text-[var(--color-muted-foreground)]">
              Cycles: {state.cycleCount} · Tx: {state.txCount} · Gas spent: {fmtUsd(state.gasSpentUsdc)} USDC
            </span>
          </div>

          {state.autoStoppedReason && (
            <p className="text-[11px] text-[var(--color-destructive)]">{state.autoStoppedReason}</p>
          )}

          {/* Countdown */}
          {state.nextCycleMs && state.status === 'running' && (
            <p className="text-[11px] text-[var(--color-muted-foreground)]">
              Next cycle in {msToSecs(state.nextCycleMs - Date.now())}
            </p>
          )}

          {isMainnet && state.status !== 'stopped' && (
            <p className="mt-2 text-[10px] text-[var(--color-destructive)]">
              ⚠ Mainnet: every cycle spends USDC gas. Use budget guardrails below to cap spending.
            </p>
          )}
        </div>
      </Card>

      {/* ── Wallet card ── */}
      <Card>
        <CardHeader><CardTitle>Keeper wallet</CardTitle></CardHeader>
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <div className="flex flex-col">
              <span className="text-[10px] text-[var(--color-muted-foreground)]">Mode</span>
              <div className="flex gap-1">
                <Button
                  variant={walletMode === 'browser' ? 'primary' : 'secondary'}
                  size="sm"
                  onClick={() => setWalletMode('browser')}
                >
                  Browser wallet
                </Button>
                <Button
                  variant={walletMode === 'connected' ? 'primary' : 'secondary'}
                  size="sm"
                  onClick={() => {
                    setWalletMode('connected')
                    setConnectedWallet(connectedAddress ?? null)
                  }}
                >
                  Connected wallet
                </Button>
              </div>
              {walletMode === 'connected' && (
                <p className="mt-1 text-[11px] text-[var(--color-muted-foreground)]">
                  Every tx needs your wallet confirmation — only Run once is available.
                </p>
              )}
              {walletMode === 'browser' && (
                <p className="mt-1 text-[10px] text-[var(--color-muted-foreground)]">
                  Key is encrypted in this browser. Auto-run works while unlocked.
                </p>
              )}
            </div>
            <div className="flex flex-col items-end">
              <span className="text-[10px] text-[var(--color-muted-foreground)]">Address</span>
              <div className="flex items-center gap-2 mono text-xs">
                {wallet.address ? shortAddr(wallet.address) : '—'}
                {wallet.address && (
                  <Button size="sm" variant="ghost" onClick={() => {
                    navigator.clipboard.writeText(wallet.address ?? '')
                    toast.success('Address copied')
                  }}>
                    <Copy size={12} aria-hidden="true" />
                  </Button>
                )}
              </div>
              {wallet.address && (
                <a href={addrUrl(wallet.address)} target="_blank" rel="noopener noreferrer" className="mt-1 text-[10px] text-[var(--color-primary)] hover:underline">
                  View on explorer <ArrowRight size={10} aria-hidden="true" />
                </a>
              )}
            </div>
          </div>

          {wallet.mode === 'browser' && (
            <>
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] text-[var(--color-muted-foreground)]">Status</span>
                <Pill tone={wallet.unlocked ? 'success' : 'danger'}>
                  {wallet.unlocked ? 'Unlocked (key in memory)' : 'Locked'}
                </Pill>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {wallet.unlocked ? (
                  <>
                    <Button onClick={lockWallet} size="sm" variant="secondary">
                      <Lock size={13} aria-hidden="true" /> Lock
                    </Button>
                    <Button onClick={() => setShowExportConfirm(true)} size="sm" variant="secondary">
                      <Key size={13} aria-hidden="true" /> Export key
                    </Button>
                  </>
                ) : (
                  <div className="flex gap-2">
                    <input
                      type="password"
                      placeholder="Passphrase"
                      value={passphrase}
                      onChange={e => setPassphrase(e.target.value)}
                      className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm mono text-[var(--color-foreground)] focus:outline-none focus:border-[var(--color-primary)]"
                    />
                    <Button onClick={() => unlockWallet(passphrase)} size="sm">
                      <Lock size={13} aria-hidden="true" /> Unlock
                    </Button>
                  </div>
                )}
                <Button onClick={() => setShowForgetConfirm(true)} size="sm" variant="danger">
                  <Trash size={13} aria-hidden="true" /> Forget wallet
                </Button>
              </div>
              <div className="bg-[color-mix(in_srgb,var(--color-warning)_12%,transparent)] border border-[color-mix(in_srgb,var(--color-warning)_25%,transparent)] rounded-lg p-2">
                <p className="text-[10px] text-[var(--color-warning)]">
                  ⚠ Hot wallet in this browser — keep only a small balance. Never share your passphrase.
                </p>
              </div>
            </>
          )}

          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] text-[var(--color-muted-foreground)]">Gas balance</span>
            <span className="mono text-xs">{wallet.balanceUsdc === null ? '—' : fmtUsd(wallet.balanceUsdc)} USDC</span>
          </div>

          <div className="flex gap-2">
            <input
              placeholder="USDC"
              value={fundAmount}
              onChange={e => setFundAmount(e.target.value)}
              className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm mono text-[var(--color-foreground)] focus:outline-none focus:border-[var(--color-primary)]"
            />
            <Button onClick={() => fundWallet(Number(fundAmount))} size="sm">
              <Plus size={13} aria-hidden="true" /> Fund
            </Button>
            <Button onClick={withdrawWallet} size="sm" variant="secondary">
              <Minus size={13} aria-hidden="true" /> Withdraw all
            </Button>
          </div>
          <p className="text-[10px] text-[var(--color-muted-foreground)]">
            Fund: send USDC from your connected wallet to the keeper address above.
            Withdraw: sends keeper balance (minus gas reserve) back to your connected wallet.
          </p>
        </div>
      </Card>

      {/* ── Live prices ── */}
      <Card>
        <CardHeader><CardTitle>Live prices</CardTitle></CardHeader>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--color-border)]">
                <th className="text-left text-[10px] text-[var(--color-muted-foreground)] pb-2">Asset</th>
                <th className="text-right text-[10px] text-[var(--color-muted-foreground)] pb-2">On-chain price</th>
                <th className="text-right text-[10px] text-[var(--color-muted-foreground)] pb-2">Age</th>
                <th className="text-right text-[10px] text-[var(--color-muted-foreground)] pb-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(TOKENS).map(([sym, token]) => {
                const event = events.find(e => e.type === 'price' && e.asset === token.address) as KeeperEvent | undefined
                return (
                  <tr key={sym} className="border-b border-[var(--color-border)] last:border-0">
                    <td className="py-2 mono">{sym}</td>
                    <td className="py-2 text-right mono">{event?.priceUsd?.toFixed(2) ?? '—'}</td>
                    <td className="py-2 text-right mono">{event ? msToSecs(event.ageSec ? event.ageSec * 1000 : null) : '—'}</td>
                    <td className="py-2 text-right">
                      {event ? <Pill tone={event.fresh ? 'success' : 'warning'}>{event.fresh ? 'Fresh' : 'Stale'}</Pill> : <Pill tone="muted">—</Pill>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {/* ── Stats ── */}
      <div className="grid md:grid-cols-2 gap-3">
        <Card>
          <CardHeader><CardTitle>Session stats</CardTitle></CardHeader>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-[var(--color-muted-foreground)]">Borrowers tracked</span>
              <span className="mono">{state.borrowersTracked}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--color-muted-foreground)]">Unhealthy (HF &lt; 1)</span>
              <span className="mono text-[var(--color-destructive)]">{state.unhealthyCount}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--color-muted-foreground)]">Last cycle</span>
              <span className="mono">{msToSecs(state.lastCycleMs)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--color-muted-foreground)]">Next cycle</span>
              <span className="mono">{state.nextCycleMs ? msToSecs(state.nextCycleMs - Date.now()) : '—'}</span>
            </div>
          </div>
        </Card>
        <Card>
          <CardHeader><CardTitle>Budget guardrails</CardTitle></CardHeader>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-[var(--color-muted-foreground)]">Session budget</span>
              <span className="mono">{fmtUsd(settings.sessionBudgetUsdc)} USDC</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--color-muted-foreground)]">Spent this session</span>
              <span className="mono">{fmtUsd(state.gasSpentUsdc)} USDC</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--color-muted-foreground)]">Min balance</span>
              <span className="mono">{fmtUsd(settings.minBalanceUsdc)} USDC</span>
            </div>
            <div className="w-full bg-[var(--color-muted)] rounded h-1.5">
              <div
                className="h-full bg-[var(--color-primary)] rounded"
                style={{ width: Math.min((state.gasSpentUsdc / settings.sessionBudgetUsdc) * 100, 100) + '%' }}
              />
            </div>
          </div>
          <p className="text-[10px] text-[var(--color-muted-foreground)]">
            Auto-stops when session budget is reached or balance drops below minimum.
          </p>
        </Card>
      </div>

      {/* ── Settings ── */}
      <Card>
        <CardHeader><CardTitle>Settings</CardTitle></CardHeader>
        <div className="grid md:grid-cols-3 gap-3">
          <div className="flex items-center justify-between">
            <span className="text-[var(--color-muted-foreground)]">Interval</span>
            <div className="flex gap-1">
              <input
                type="number"
                min="30"
                value={settings.intervalSec}
                onChange={e => updateSettings({ intervalSec: Math.max(30, Number(e.target.value || 30)) })}
                className="w-16 mono text-xs rounded border border-[var(--color-border)] bg-[var(--color-background)] px-2 py-1 text-[var(--color-foreground)] focus:outline-none focus:border-[var(--color-primary)]"
              />
              <span className="text-[10px] text-[var(--color-muted-foreground)]">s</span>
            </div>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[var(--color-muted-foreground)]">Gas saver</span>
            <Button size="sm" variant={settings.gasSaver ? 'primary' : 'secondary'} onClick={() => updateSettings({ gasSaver: !settings.gasSaver })}>
              {settings.gasSaver ? 'On' : 'Off'}
            </Button>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[var(--color-muted-foreground)]">Liquidations</span>
            <Button size="sm" variant={settings.liquidationsOn ? 'primary' : 'secondary'} onClick={() => updateSettings({ liquidationsOn: !settings.liquidationsOn })}>
              {settings.liquidationsOn ? 'On' : 'Off'}
            </Button>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[var(--color-muted-foreground)]">Dry-run</span>
            <Button size="sm" variant={settings.dryRun ? 'primary' : 'secondary'} onClick={() => updateSettings({ dryRun: !settings.dryRun })}>
              {settings.dryRun ? 'On' : 'Off'}
            </Button>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[var(--color-muted-foreground)]">Session budget</span>
            <input
              type="number"
              min="0"
              value={autoStopBudget}
              onChange={e => setAutoStopBudget(e.target.value)}
              className="w-20 mono text-xs rounded border border-[var(--color-border)] bg-[var(--color-background)] px-2 py-1 text-[var(--color-foreground)] focus:outline-none focus:border-[var(--color-primary)]"
            />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[var(--color-muted-foreground)]">Min balance</span>
            <input
              type="number"
              min="0"
              value={settings.minBalanceUsdc}
              onChange={e => updateSettings({ minBalanceUsdc: Number(e.target.value || 0) })}
              className="w-20 mono text-xs rounded border border-[var(--color-border)] bg-[var(--color-background)] px-2 py-1 text-[var(--color-foreground)] focus:outline-none focus:border-[var(--color-primary)]"
            />
          </div>
        </div>
        <div className="mt-4 md:mt-0">
          <Button onClick={() => updateSettings({ sessionBudgetUsdc: Number(autoStopBudget) || 0 })} size="sm">
            Apply budget
          </Button>
        </div>
      </Card>

      {/* ── Activity log ── */}
      <Card>
        <CardHeader><CardTitle>Activity log</CardTitle></CardHeader>
        <div className="flex justify-between items-end mb-2">
          <span className="text-[10px] text-[var(--color-muted-foreground)]">Newest first — tx hashes link to the explorer</span>
          <Button size="sm" variant="secondary" onClick={() => {
            // clear handled by provider; placeholder
          }}>Clear</Button>
        </div>
        <div className="max-h-96 overflow-y-auto space-y-1">
          {events.length === 0 ? (
            <p className="text-[11px] text-[var(--color-muted-foreground)] text-center py-4">No activity yet. Run a cycle to see events.</p>
          ) : (
            events.map((ev, i) => (
              <div key={i} className="flex items-start gap-2 px-2 py-1 text-xs border-l-2">
                <span className={`w-2.5 rounded ${levelTone(ev.type)}`} />
                <div className="flex-1">
                  <div className="flex justify-between">
                    <span className={`mono font-medium ${evTextColor(ev.type)}`}>{ev.type === 'tx' ? 'TX' : ev.type === 'error' ? 'ERR' : ev.type === 'warning' ? 'WARN' : 'INFO'}</span>
                    <span className="text-[var(--color-muted-foreground)]">{new Date().toLocaleTimeString()}</span>
                  </div>
                  <div className="mono text-[10px]">
                    {ev.type === 'tx' && ev.hash ? (
                      <>
                        {ev.action} {ev.costUsdc !== null ? `· ${fmtUsd(ev.costUsdc)} USDC` : ''} ·{' '}
                        <a href={addrUrl(ev.hash)} target="_blank" rel="noopener noreferrer" className="text-[var(--color-primary)] hover:underline">
                          {shortAddr(ev.hash)}
                        </a>
                        {ev.status === 'confirmed' ? ' ✓' : ev.status === 'failed' ? ' ✗' : ' ⏳'}
                      </>
                    ) : (ev.type === 'warning' || ev.type === 'error' ? (ev as { message?: string }).message : "—")}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </Card>

      {/* Export confirm modal */}
      {showExportConfirm && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm" onClick={(e) => e.stopPropagation()}>
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <Card className="w-full max-w-sm bg-[var(--color-background)] border border-[var(--color-border)]">
              <CardHeader><CardTitle>Export keeper key</CardTitle></CardHeader>
              <div className="space-y-3">
                <p className="text-[11px] text-[var(--color-muted-foreground)]">
                  Re-enter your passphrase to reveal the private key. <strong className="text-[var(--color-destructive)]">This exposes your key — copy it somewhere safe.</strong>
                </p>
                <input
                  type="password"
                  placeholder="Passphrase"
                  value={exportPassphrase}
                  onChange={e => setExportPassphrase(e.target.value)}
                  className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm mono text-[var(--color-foreground)] focus:outline-none focus:border-[var(--color-primary)]"
                />
                <div className="flex justify-end gap-2">
                  <Button variant="secondary" size="sm" onClick={() => setShowExportConfirm(false)}>Cancel</Button>
                  <Button
                    onClick={async () => {
                      const key = await exportWallet(exportPassphrase)
                      if (key) {
                        navigator.clipboard.writeText(key)
                        toast.success('Key copied to clipboard')
                      } else {
                        toast.error('Wrong passphrase')
                      }
                      setShowExportConfirm(false)
                    }}
                    size="sm"
                  >
                    Reveal
                  </Button>
                </div>
              </div>
            </Card>
          </div>
        </div>
      )}

      {/* Forget confirm modal */}
      {showForgetConfirm && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm" onClick={(e) => e.stopPropagation()}>
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <Card className="w-full max-w-sm bg-[var(--color-background)] border border-[var(--color-border)]">
              <CardHeader><CardTitle>Forget keeper wallet</CardTitle></CardHeader>
              <div className="space-y-3">
                <p className="text-[11px] text-[var(--color-muted-foreground)]">
                  This deletes the wallet from this browser. <strong className="text-[var(--color-destructive)]">Any funds left on the keeper address will be inaccessible unless you have exported the key.</strong>
                </p>
                <input
                  type="password"
                  placeholder="Passphrase"
                  value={forgetPassphrase}
                  onChange={e => setForgetPassphrase(e.target.value)}
                  className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm mono text-[var(--color-foreground)] focus:outline-none focus:border-[var(--color-primary)]"
                />
                <div className="flex justify-end gap-2">
                  <Button variant="secondary" size="sm" onClick={() => setShowForgetConfirm(false)}>Cancel</Button>
                  <Button
                    onClick={async () => {
                      await forgetWallet()
                      setShowForgetConfirm(false)
                      toast.success('Wallet forgotten')
                    }}
                    size="sm"
                    variant="danger"
                  >
                    Forget
                  </Button>
                </div>
              </div>
            </Card>
          </div>
        </div>
      )}
    </div>
  )
}

function levelTone(type: string): string {
  switch (type) {
    case 'error': return 'bg-[var(--color-destructive)]'
    case 'warning': return 'bg-[var(--color-warning)]'
    case 'tx': return 'bg-[var(--color-primary)]'
    default: return 'bg-[var(--color-success)]'
  }
}

function evTextColor(type: string): string {
  switch (type) {
    case 'error': return 'text-[var(--color-destructive)]'
    case 'warning': return 'text-[var(--color-warning)]'
    case 'tx': return 'text-[var(--color-primary)]'
    default: return 'text-[var(--color-foreground)]'
  }
}
