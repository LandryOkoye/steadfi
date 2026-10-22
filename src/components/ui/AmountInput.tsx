/**
 * AmountInput — token amount field with MAX button and USD equivalent label.
 */
import { type ChangeEvent } from 'react'

interface AmountInputProps {
  label: string
  value: string
  onChange: (v: string) => void
  max?: string
  usdEquiv?: string
  symbol?: string
  disabled?: boolean
  id?: string
}

export default function AmountInput({
  label, value, onChange, max, usdEquiv, symbol = 'USDC', disabled, id = 'amount',
}: AmountInputProps) {
  function handleChange(e: ChangeEvent<HTMLInputElement>) {
    const v = e.target.value
    // Allow only numbers and one decimal point
    if (/^\d*\.?\d*$/.test(v)) onChange(v)
  }

  return (
    <div>
      <label htmlFor={id} className="block text-xs text-[var(--color-muted-foreground)] mb-1.5 font-medium">
        {label}
      </label>
      <div className="flex items-center rounded-xl border border-[var(--color-border)] bg-[var(--color-muted)] overflow-hidden focus-within:border-[var(--color-primary)] transition-base">
        <input
          id={id}
          type="text"
          inputMode="decimal"
          value={value}
          onChange={handleChange}
          disabled={disabled}
          placeholder="0.00"
          className="flex-1 bg-transparent px-4 py-3 text-base mono text-[var(--color-foreground)] outline-none placeholder:text-[var(--color-muted-foreground)] disabled:cursor-not-allowed"
          aria-label={label}
        />
        <span className="px-3 text-sm text-[var(--color-muted-foreground)] font-medium">{symbol}</span>
        {max && (
          <button
            type="button"
            onClick={() => onChange(max)}
            className="px-3 py-1 mr-2 text-xs rounded-lg bg-[var(--color-muted)] border border-[var(--color-border)] text-[var(--color-primary)] hover:brightness-110 transition-base font-semibold"
          >
            MAX
          </button>
        )}
      </div>
      {usdEquiv && (
        <p className="mt-1 text-xs text-[var(--color-muted-foreground)] mono">≈ ${usdEquiv}</p>
      )}
    </div>
  )
}
