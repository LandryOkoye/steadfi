/**
 * StatRow — label + value row used in cards and position panels.
 */
import { type ReactNode } from 'react'
import { clsx } from 'clsx'

interface StatRowProps {
  label: string
  value: ReactNode
  hint?: string
  mono?: boolean
  className?: string
}

export default function StatRow({ label, value, hint, mono = false, className }: StatRowProps) {
  return (
    <div className={clsx('flex items-center justify-between py-2 border-b border-[var(--color-border)] last:border-0', className)}>
      <span className="text-sm text-[var(--color-muted-foreground)]">
        {label}
        {hint && <span className="ml-1 text-[10px] text-[var(--color-muted-foreground)] opacity-60">{hint}</span>}
      </span>
      <span className={clsx('text-sm text-[var(--color-foreground)] font-medium', mono && 'mono')}>
        {value}
      </span>
    </div>
  )
}
