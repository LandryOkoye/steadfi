/**
 * Small building blocks shared by the admin pages.
 */
import { useEffect, useState, type ReactNode } from 'react'
import { clsx } from 'clsx'
import { toast } from 'sonner'
import Button from '../components/ui/Button'
import { txUrl } from '../lib/steadfi'

export function fmtUsd(n: number | null, maxFrac = 2): string {
  if (n === null || !Number.isFinite(n)) return '—'
  return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: maxFrac })
}

/** Native token units → display string without float rounding surprises on large values. */
export function fmtAmount(amount: bigint, decimals: number, maxFrac = 6): string {
  const neg = amount < 0n
  const abs = neg ? -amount : amount
  const base = 10n ** BigInt(decimals)
  const whole = abs / base
  let frac = (abs % base).toString().padStart(decimals, '0').slice(0, maxFrac).replace(/0+$/, '')
  if (frac.length < 2 && whole < 1_000_000n) frac = frac.padEnd(2, '0')
  return `${neg ? '-' : ''}${whole.toLocaleString('en-US')}${frac ? '.' + frac : ''}`
}

export function usdOf(amount: bigint, decimals: number, price18: bigint | null): number | null {
  if (price18 === null) return null
  return Number(amount) / 10 ** decimals * (Number(price18) / 1e18)
}

export function shortAddr(a: string): string {
  return `${a.slice(0, 6)}…${a.slice(-4)}`
}

export function KpiTile({ label, value, sub, tone }: {
  label: string; value: ReactNode; sub?: ReactNode; tone?: 'warning' | 'success' | 'danger'
}) {
  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-4">
      <p className="text-xs uppercase tracking-wider text-[var(--color-muted-foreground)]">{label}</p>
      <p className={clsx(
        'mono mt-1.5 text-xl font-bold',
        tone === 'warning' && 'text-[var(--color-warning)]',
        tone === 'success' && 'text-[var(--color-success)]',
        tone === 'danger' && 'text-[var(--color-destructive)]',
      )}>{value}</p>
      {sub && <p className="mt-1 text-xs text-[var(--color-muted-foreground)]">{sub}</p>}
    </div>
  )
}

export function Pill({ tone, children }: { tone: 'success' | 'warning' | 'danger' | 'muted'; children: ReactNode }) {
  return (
    <span className={clsx(
      'inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold',
      tone === 'success' && 'bg-[color-mix(in_srgb,var(--color-success)_15%,transparent)] text-[var(--color-success)]',
      tone === 'warning' && 'bg-[color-mix(in_srgb,var(--color-warning)_15%,transparent)] text-[var(--color-warning)]',
      tone === 'danger'  && 'bg-[color-mix(in_srgb,var(--color-destructive)_15%,transparent)] text-[var(--color-destructive)]',
      tone === 'muted'   && 'bg-[var(--color-muted)] text-[var(--color-muted-foreground)]',
    )}>{children}</span>
  )
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-medium text-[var(--color-muted-foreground)]">{label}</span>
      {children}
      {hint && <span className="block text-[11px] text-[var(--color-muted-foreground)]">{hint}</span>}
    </label>
  )
}

export const inputCls =
  'w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm mono ' +
  'text-[var(--color-foreground)] focus:outline-none focus:border-[var(--color-primary)]'

/**
 * Two-step button for irreversible admin actions: the first click arms it,
 * the second (within 5s) runs the action. The wallet prompt follows.
 */
export function ConfirmButton({
  onConfirm, children, variant = 'primary', disabled, loading, className,
}: {
  onConfirm: () => void; children: ReactNode; variant?: 'primary' | 'danger' | 'secondary'
  disabled?: boolean; loading?: boolean; className?: string
}) {
  const [armed, setArmed] = useState(false)
  useEffect(() => {
    if (!armed) return
    const t = setTimeout(() => setArmed(false), 5_000)
    return () => clearTimeout(t)
  }, [armed])
  return (
    <Button
      size="sm"
      variant={armed ? 'danger' : variant}
      disabled={disabled}
      loading={loading}
      className={className}
      onClick={() => {
        if (armed) { setArmed(false); onConfirm() } else setArmed(true)
      }}
    >
      {armed ? 'Click again to confirm' : children}
    </Button>
  )
}

/**
 * Runs an admin transaction with busy-state and toasts. Returns the runner and
 * the label of the action in flight (null when idle).
 */
export function useTxRunner() {
  const [busy, setBusy] = useState<string | null>(null)
  async function run(key: string, label: string, fn: () => Promise<string | { hash: string; queued: boolean }>) {
    setBusy(key)
    try {
      const res = await fn()
      const hash = typeof res === 'string' ? res : res.hash
      const queued = typeof res !== 'string' && res.queued
      toast.success(queued ? `${label} queued in the Timelock` : label, {
        description: (
          <span className="text-xs">
            {queued && 'Execute it from the Timelock tab once the delay has passed. '}
            <a href={txUrl(hash)} target="_blank" rel="noreferrer" className="underline">View on explorer</a>
          </span>
        ),
      })
      return true
    } catch (e: unknown) {
      const msg = e instanceof Error ? (e as { shortMessage?: string }).shortMessage ?? e.message : String(e)
      toast.error(`${label} failed`, { description: msg })
      return false
    } finally {
      setBusy(null)
    }
  }
  return { run, busy }
}
