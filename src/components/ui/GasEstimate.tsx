/**
 * GasEstimate — shows estimated gas cost in USDC for a typical action.
 * On Arc, gas is USDC so this is a dollar amount — no ETH needed.
 */
import { GasPump } from '@phosphor-icons/react'

export default function GasEstimate() {
  // Arc stable fee target: ~$0.01 per tx. Displayed as a static hint until
  // live block.basefee is wired in Phase 3 indexer.
  return (
    <div className="flex items-center gap-1.5 text-[11px] text-[var(--color-muted-foreground)]">
      <GasPump size={13} aria-hidden="true" />
      <span>Gas ~<span className="mono text-[var(--color-foreground)]">$0.01</span> USDC</span>
    </div>
  )
}
