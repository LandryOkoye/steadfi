/**
 * AmountInput — large token amount field with token chip, USD equivalent,
 * balance line and MAX. Accepts only digits and one decimal point.
 */
import { type ChangeEvent } from 'react'
import { clsx } from 'clsx'
import TokenIcon from './TokenIcon'
import { TOKENS, type TokenSymbol } from '../../lib/steadfi'

interface AmountInputProps {
  label: string
  value: string
  onChange: (v: string) => void
  /** Value MAX fills in (plain decimal string). */
  max?: string
  /** Label + formatted amount for the balance line, e.g. "Wallet balance". */
  balanceLabel?: string
  balance?: string
  usdEquiv?: string
  symbol?: string
  disabled?: boolean
  invalid?: boolean
  id?: string
  describedBy?: string
}

export default function AmountInput({
  label, value, onChange, max, balanceLabel = 'Balance', balance, usdEquiv, symbol = 'USDC',
  disabled, invalid, id = 'amount', describedBy,
}: AmountInputProps) {
  function handleChange(e: ChangeEvent<HTMLInputElement>) {
    const v = e.target.value.replace(',', '.')
    if (/^\d*\.?\d*$/.test(v)) onChange(v)
  }
  const isToken = symbol in TOKENS

  return (
    <div>
      <label htmlFor={id} className="block text-sm text-[var(--color-muted-foreground)] mb-2">
        {label}
      </label>
      <div
        className={clsx(
          'rounded-[14px] border bg-[var(--color-background)] px-4 pt-3 pb-2.5 transition-base',
          invalid
            ? 'border-[var(--color-destructive)]'
            : 'border-[var(--color-border)] focus-within:border-[var(--color-primary)]',
        )}
      >
        <div className="flex items-center gap-3">
          <input
            id={id}
            type="text"
            inputMode="decimal"
            autoComplete="off"
            value={value}
            onChange={handleChange}
            disabled={disabled}
            placeholder="0.00"
            aria-invalid={invalid || undefined}
            aria-describedby={describedBy}
            className="mono min-w-0 flex-1 bg-transparent text-2xl font-semibold text-[var(--color-foreground)] outline-none focus-visible:outline-none placeholder:text-[color-mix(in_srgb,var(--color-muted-foreground)_50%,transparent)] disabled:cursor-not-allowed"
          />
          <span className="flex items-center gap-2 rounded-full bg-[var(--color-muted)] py-1 pl-1 pr-3 text-sm font-semibold">
            {isToken
              ? <TokenIcon symbol={symbol as TokenSymbol} size={22} />
              : null}
            {symbol}
          </span>
        </div>
        <div className="mt-1.5 flex items-center justify-between gap-3 text-xs text-[var(--color-muted-foreground)]">
          <span className="mono">{usdEquiv ? `$${usdEquiv}` : '$0.00'}</span>
          {(balance !== undefined || max) && (
            <span className="flex items-center gap-2">
              {balance !== undefined && <span>{balanceLabel} <span className="mono text-[var(--color-foreground)]">{balance}</span></span>}
              {max && (
                <button
                  type="button"
                  onClick={() => onChange(max)}
                  disabled={disabled}
                  className="rounded-md px-1.5 py-0.5 font-semibold text-[var(--color-primary)] hover:bg-[var(--color-muted)] cursor-pointer"
                >
                  MAX
                </button>
              )}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
