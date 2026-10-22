/**
 * NetworkBadge — shows Arc Testnet indicator with a green pulse dot.
 */
export default function NetworkBadge() {
  return (
    <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[var(--color-muted)] text-xs text-[var(--color-muted-foreground)]">
      <span className="relative flex h-2 w-2">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[var(--color-success)] opacity-75" />
        <span className="relative inline-flex rounded-full h-2 w-2 bg-[var(--color-success)]" />
      </span>
      Arc Testnet
    </div>
  )
}
