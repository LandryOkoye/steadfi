/**
 * NetworkBadge — Arc Testnet indicator with a live dot.
 */
import { NetworkArc } from '@web3icons/react'

export default function NetworkBadge() {
  return (
    <div className="hidden sm:flex items-center gap-2 h-9 pl-1.5 pr-3 rounded-full border border-[var(--color-border)] bg-[var(--color-card)] text-xs font-medium text-[var(--color-foreground)]">
      <span className="grid place-items-center h-6 w-6 rounded-full bg-[var(--color-muted)]">
        <NetworkArc variant="branded" size={16} aria-hidden="true" />
      </span>
      Arc Testnet
      <span className="relative flex h-1.5 w-1.5" aria-hidden="true">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[var(--color-success)] opacity-60" />
        <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-[var(--color-success)]" />
      </span>
    </div>
  )
}
