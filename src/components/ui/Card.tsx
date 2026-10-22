/**
 * Card — base card with optional hover state and header slot.
 */
import { type ReactNode } from 'react'
import { clsx } from 'clsx'

interface CardProps {
  children: ReactNode
  className?: string
  hover?: boolean
  as?: 'div' | 'article' | 'section'
}

export function Card({ children, className, hover = false, as: Tag = 'div' }: CardProps) {
  return (
    <Tag
      className={clsx(
        'rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-5',
        hover && 'hover:bg-[var(--color-card-hover)] transition-base cursor-pointer',
        className,
      )}
    >
      {children}
    </Tag>
  )
}

export function CardHeader({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={clsx('flex items-center justify-between mb-4', className)}>
      {children}
    </div>
  )
}

export function CardTitle({ children }: { children: ReactNode }) {
  return (
    <h2 className="text-sm font-semibold text-[var(--color-muted-foreground)] uppercase tracking-wider">
      {children}
    </h2>
  )
}
