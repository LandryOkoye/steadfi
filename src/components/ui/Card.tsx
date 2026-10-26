/**
 * Card — base surface with optional hover state and header slot.
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
        'rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-card)] p-5 shadow-[var(--shadow-card)]',
        hover && 'hover:bg-[var(--color-card-hover)] hover:border-[var(--color-border-strong)] transition-base cursor-pointer',
        className,
      )}
    >
      {children}
    </Tag>
  )
}

export function CardHeader({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={clsx('flex items-center justify-between gap-3 mb-4', className)}>
      {children}
    </div>
  )
}

export function CardTitle({ children }: { children: ReactNode }) {
  return (
    <h2 className="text-[15px] font-semibold text-[var(--color-foreground)] tracking-tight">
      {children}
    </h2>
  )
}
