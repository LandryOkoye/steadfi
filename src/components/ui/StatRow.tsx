/**
 * StatRow — label + value row used in cards, modals and detail panels.
 */
import { type ReactNode } from 'react'
import { clsx } from 'clsx'

interface StatRowProps {
  label: ReactNode
  value: ReactNode
  hint?: string
  mono?: boolean
  className?: string
}

export default function StatRow({ label, value, hint, mono = false, className }: StatRowProps) {
  return (
    <div className={clsx('flex items-center justify-between gap-4 py-2.5', className)}>
      <span className="text-sm text-[var(--color-muted-foreground)]" title={hint}>
        {label}
      </span>
      <span className={clsx('text-sm text-right text-[var(--color-foreground)]', mono && 'mono')}>
        {value}
      </span>
    </div>
  )
}
