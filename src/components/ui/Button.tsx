/**
 * Button — primary / brand / secondary / ghost / danger variants.
 * Primary is a high-contrast solid (foreground on background), brand uses the
 * blue→cyan gradient for the single most important action on a surface.
 */
import { type ReactNode, type ButtonHTMLAttributes } from 'react'
import { clsx } from 'clsx'

type Variant = 'primary' | 'brand' | 'secondary' | 'ghost' | 'danger'
type Size    = 'sm' | 'md' | 'lg'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  loading?: boolean
  children: ReactNode
}

const VARIANTS: Record<Variant, string> = {
  primary:   'bg-[var(--color-foreground)] text-[var(--color-background)] hover:opacity-90 font-semibold',
  brand:     'bg-[image:var(--gradient-brand)] text-[#0F172A] hover:brightness-110 font-semibold shadow-[0_8px_24px_-12px_rgba(16,185,129,0.6)]',
  secondary: 'bg-[var(--color-muted)] text-[var(--color-foreground)] border border-[var(--color-border)] hover:bg-[var(--color-card-hover)] hover:border-[var(--color-border-strong)] font-medium',
  ghost:     'text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)] hover:bg-[var(--color-muted)] bg-transparent font-medium',
  danger:    'bg-[var(--color-destructive)] text-white hover:brightness-110 font-semibold',
}

const SIZES: Record<Size, string> = {
  sm: 'h-8 px-3 text-xs rounded-[10px]',
  md: 'h-11 px-4 text-sm rounded-[var(--radius-control)]',
  lg: 'h-12 px-6 text-[15px] rounded-[14px]',
}

export default function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled,
  children,
  className,
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button
      {...rest}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={clsx(
        'inline-flex items-center justify-center gap-2 whitespace-nowrap cursor-pointer select-none',
        'transition-base active:scale-[0.98]',
        'disabled:opacity-45 disabled:cursor-not-allowed disabled:active:scale-100',
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
    >
      {loading && (
        <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
        </svg>
      )}
      {children}
    </button>
  )
}
