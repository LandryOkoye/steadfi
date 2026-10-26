/**
 * TokenIcon — branded logo for each Arc asset. cirBTC uses the Bitcoin mark
 * and WETH the Ether mark, since they represent those underlying assets.
 */
import { TokenBTC, TokenETH, TokenEURC, TokenUSDC } from '@web3icons/react'
import { clsx } from 'clsx'
import type { TokenSymbol } from '../../lib/steadfi'

const ICONS = {
  USDC: TokenUSDC,
  EURC: TokenEURC,
  cirBTC: TokenBTC,
  WETH: TokenETH,
} as const

export default function TokenIcon({ symbol, size = 32, className }: {
  symbol: TokenSymbol; size?: number; className?: string
}) {
  const Icon = ICONS[symbol]
  return (
    <span
      className={clsx('inline-flex shrink-0 items-center justify-center rounded-full bg-[var(--color-muted)]', className)}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <Icon variant="branded" size={size} />
    </span>
  )
}

/** Token name + symbol stacked, as used in asset tables. */
export function TokenLabel({ symbol, size = 32 }: { symbol: TokenSymbol; size?: number }) {
  return (
    <span className="flex items-center gap-3 min-w-0">
      <TokenIcon symbol={symbol} size={size} />
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-[var(--color-foreground)] truncate">{TOKEN_NAMES[symbol]}</span>
        <span className="block text-xs text-[var(--color-muted-foreground)]">{symbol}</span>
      </span>
    </span>
  )
}

export const TOKEN_NAMES: Record<TokenSymbol, string> = {
  USDC: 'USD Coin',
  EURC: 'Euro Coin',
  cirBTC: 'Bitcoin',
  WETH: 'Wrapped Ether',
}
