/**
 * HealthFactor — prominent HF display with colour bands and progress bar.
 * Bands: >= 2.0 safe (green), >= 1.2 warning (amber), < 1.2 danger (red).
 */
import { clsx } from 'clsx'

interface HealthFactorProps {
  value: number | null
  /** Show a preview delta (e.g. after a borrow action) */
  preview?: number | null
  size?: 'sm' | 'lg'
}

function band(hf: number) {
  if (hf >= 2.0) return { cls: 'hf-safe',    label: 'Safe',    bar: 'bg-[var(--color-success)]' }
  if (hf >= 1.2) return { cls: 'hf-warning',  label: 'At Risk', bar: 'bg-[var(--color-warning)]' }
  return           { cls: 'hf-danger',   label: 'Danger', bar: 'bg-[var(--color-destructive)]' }
}

/** Width % for the bar — clamped 0-100, cap at HF=3 */
function barWidth(hf: number) {
  return Math.min(100, Math.max(0, (hf / 3) * 100))
}

export default function HealthFactor({ value, preview, size = 'lg' }: HealthFactorProps) {
  if (value === null) {
    return <span className="text-[var(--color-muted-foreground)] text-sm">—</span>
  }

  const b = band(value)
  const pb = preview !== null && preview !== undefined ? band(preview) : null

  return (
    <div className="w-full">
      <div className="flex items-baseline gap-2">
        <span className={clsx('mono font-bold', b.cls, size === 'lg' ? 'text-3xl' : 'text-xl')}>
          {value.toFixed(2)}
        </span>
        <span className={clsx('text-xs font-semibold', b.cls)}>{b.label}</span>
        {pb && preview !== null && preview !== undefined && (
          <span className={clsx('text-xs ml-1', pb.cls)}>
            → {preview.toFixed(2)}
          </span>
        )}
      </div>

      {/* Bar */}
      <div className="mt-2 h-1.5 rounded-full bg-[var(--color-muted)] overflow-hidden">
        <div
          className={clsx('h-full rounded-full transition-all duration-500', b.bar)}
          style={{ width: `${barWidth(value)}%` }}
        />
      </div>

      {value < 1.5 && (
        <p className="mt-1.5 text-xs text-[var(--color-warning)]" role="alert">
          Health factor below 1.5 — consider repaying debt or adding collateral.
        </p>
      )}
      {value < 1.05 && (
        <p className="mt-1 text-xs font-semibold text-[var(--color-destructive)]" role="alert">
          Liquidation imminent. Repay immediately.
        </p>
      )}
    </div>
  )
}
