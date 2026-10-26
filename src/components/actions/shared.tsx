/**
 * Shared pieces for the action modals: transaction overview panel, approval
 * stepper, error text and toast helpers.
 */
import { type ReactNode } from 'react'
import { toast } from 'sonner'
import { Check } from '@phosphor-icons/react'
import { clsx } from 'clsx'
import { txUrl } from '../../lib/steadfi'

/** Readable message from a viem/wagmi error (short message, no stack). */
export function errMsg(e: unknown): string {
  if (e && typeof e === 'object') {
    const short = (e as { shortMessage?: string }).shortMessage
    if (short) return short
  }
  return e instanceof Error ? e.message.split('\n')[0] : String(e)
}

export function toastTx(title: string, hash: string, extra?: ReactNode) {
  toast.success(title, {
    description: (
      <span className="text-xs">
        {extra}
        <a href={txUrl(hash)} target="_blank" rel="noreferrer" className="underline">View on explorer</a>
      </span>
    ),
  })
}

export function Overview({ children }: { children: ReactNode }) {
  return (
    <div className="mt-5">
      <p className="mb-2 text-sm text-[var(--color-muted-foreground)]">Transaction overview</p>
      <div className="rounded-[14px] border border-[var(--color-border)] px-4 py-1 divide-y divide-[var(--color-border)]">
        {children}
      </div>
    </div>
  )
}

export function Notice({ tone, children }: { tone: 'danger' | 'warning' | 'info'; children: ReactNode }) {
  return (
    <p
      role={tone === 'info' ? undefined : 'alert'}
      className={clsx(
        'mt-3 rounded-xl px-3 py-2.5 text-xs leading-relaxed',
        tone === 'danger' && 'bg-[color-mix(in_srgb,var(--color-destructive)_10%,transparent)] text-[var(--color-destructive)]',
        tone === 'warning' && 'bg-[color-mix(in_srgb,var(--color-warning)_10%,transparent)] text-[var(--color-warning)]',
        tone === 'info' && 'bg-[var(--color-muted)] text-[var(--color-muted-foreground)]',
      )}
    >
      {children}
    </p>
  )
}

/** Two-step indicator shown when an ERC-20 approval is needed first. */
export function ApprovalSteps({ approved, action }: { approved: boolean; action: string }) {
  return (
    <ol className="mt-5 mb-3 flex items-center gap-2 text-xs" aria-label="Steps">
      <Step n={1} label="Approve" done={approved} active={!approved} />
      <span className="h-px flex-1 bg-[var(--color-border)]" aria-hidden="true" />
      <Step n={2} label={action} done={false} active={approved} />
    </ol>
  )
}

function Step({ n, label, done, active }: { n: number; label: string; done: boolean; active: boolean }) {
  return (
    <li className={clsx('flex items-center gap-1.5', active || done ? 'text-[var(--color-foreground)]' : 'text-[var(--color-muted-foreground)]')}>
      <span className={clsx(
        'grid h-5 w-5 place-items-center rounded-full text-[10px] font-semibold',
        done ? 'bg-[var(--color-success)] text-[#07080B]'
          : active ? 'bg-[var(--color-foreground)] text-[var(--color-background)]'
          : 'bg-[var(--color-muted)]',
      )}>
        {done ? <Check size={11} weight="bold" aria-hidden="true" /> : n}
      </span>
      {label}
      {done && <span className="sr-only">(done)</span>}
    </li>
  )
}

export function fmtUsd(n: number, max = 2) {
  return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: max })
}

/** Safe parse of a decimal input into token units; null when not a valid amount. */
export function parseAmount(value: string, decimals: number, parse: (v: string, d: number) => bigint): bigint | null {
  if (!value || value === '.') return null
  try { return parse(value, decimals) } catch { return null }
}
