/**
 * HealthFactor — HF value with colour band, label and a liquidation gauge.
 * Bands: >= 2.0 safe, >= 1.2 at risk, < 1.2 danger. Colour is always paired
 * with a text label so it never carries meaning alone.
 */
import { clsx } from 'clsx'

interface HealthFactorProps {
  value: number | null
  /** Value after the pending action (shown as "→ x.xx"). */
  preview?: number | null
  size?: 'sm' | 'lg'
  /** Hide the gauge bar (compact inline use). */
  bare?: boolean
}

export function hfBand(hf: number) {
  if (hf >= 2.0) return { cls: 'hf-safe',    label: 'Safe',    bar: 'bg-[var(--color-success)]' }
  if (hf >= 1.2) return { cls: 'hf-warning', label: 'At risk', bar: 'bg-[var(--color-warning)]' }
  return           { cls: 'hf-danger',  label: 'Danger',  bar: 'bg-[var(--color-destructive)]' }
}

export function formatHf(hf: number) {
  return hf === Infinity ? '∞' : hf > 1000 ? '>1000' : hf.toFixed(2)
}

/** Gauge position — log-ish scale so 1.0–3.0 uses most of the bar. */
function gaugePct(hf: number) {
  if (hf === Infinity) return 100
  return Math.min(100, Math.max(2, (Math.log(Math.max(hf, 0.5)) - Math.log(0.5)) / (Math.log(5) - Math.log(0.5)) * 100))
}

export default function HealthFactor({ value, preview, size = 'lg', bare = false }: HealthFactorProps) {
  if (value === null) {
    return <span className="text-[var(--color-muted-foreground)] text-sm">—</span>
  }

  const noDebt = value === Infinity
  const b = hfBand(value)
  const showPreview = preview !== null && preview !== undefined && preview !== value
  const pb = showPreview ? hfBand(preview) : null

  return (
    <div className="w-full">
      <div className="flex items-baseline gap-2 flex-wrap">
        <span className={clsx('mono font-semibold', b.cls, size === 'lg' ? 'text-3xl' : 'text-base')}>
          {formatHf(value)}
        </span>
        {showPreview && pb && (
          <span className={clsx('mono font-semibold', pb.cls, size === 'lg' ? 'text-xl' : 'text-sm')}>
            → {formatHf(preview)}
          </span>
        )}
        {/* With a preview, label the resulting state; otherwise the current one. */}
        {showPreview && pb ? (
          <span className={clsx('text-xs font-medium', preview === Infinity ? 'text-[var(--color-muted-foreground)]' : pb.cls)}>
            {preview === Infinity ? 'No debt' : pb.label}
          </span>
        ) : (
          <span className={clsx('text-xs font-medium', noDebt ? 'text-[var(--color-muted-foreground)]' : b.cls)}>
            {noDebt ? 'No debt' : b.label}
          </span>
        )}
      </div>

      {!bare && (
        <>
          <div className="relative mt-3 h-1.5 rounded-full bg-[linear-gradient(90deg,var(--color-destructive)_0%,var(--color-warning)_35%,var(--color-success)_70%)] opacity-90">
            <div
              className="absolute top-1/2 h-3.5 w-1 -translate-y-1/2 rounded-full bg-[var(--color-foreground)] shadow-[0_0_0_3px_var(--color-card)] transition-all duration-500"
              style={{ left: `calc(${gaugePct(showPreview ? preview : value)}% - 2px)` }}
            />
          </div>
          <div className="mt-1.5 flex justify-between text-[11px] text-[var(--color-muted-foreground)]">
            <span>Liquidation &lt; 1.0</span>
            <span>Safer →</span>
          </div>
          {!noDebt && value < 1.5 && (
            <p className="mt-2 text-xs text-[var(--color-warning)]" role="alert">
              {value < 1.05
                ? 'Liquidation imminent. Repay debt or add collateral now.'
                : 'Health factor below 1.5. Consider repaying debt or adding collateral.'}
            </p>
          )}
        </>
      )}
    </div>
  )
}
