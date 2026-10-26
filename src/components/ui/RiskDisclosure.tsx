/**
 * RiskDisclosure — plain-language risks, collapsed by default so it stays
 * present on every action without crowding it.
 */
import { WarningCircle, CaretDown } from '@phosphor-icons/react'

interface RiskDisclosureProps {
  includesBridge?: boolean
}

export default function RiskDisclosure({ includesBridge = false }: RiskDisclosureProps) {
  return (
    <details className="group rounded-[14px] border border-[var(--color-border)] bg-[color-mix(in_srgb,var(--color-background)_40%,transparent)] text-xs text-[var(--color-muted-foreground)]">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 [&::-webkit-details-marker]:hidden">
        <WarningCircle size={15} className="shrink-0 text-[var(--color-warning)]" aria-hidden="true" />
        <span className="font-medium text-[var(--color-foreground)]">Risks</span>
        <span className="truncate">Unaudited testnet contracts, liquidation risk</span>
        <CaretDown size={13} className="ml-auto shrink-0 transition-transform group-open:rotate-180" aria-hidden="true" />
      </summary>
      <ul className="list-disc space-y-1 px-4 pb-3 pl-9">
        <li>Smart-contract risk: SteadFi contracts have not been externally audited. Use at your own risk.</li>
        <li>USDC/EURC issuer risk: issued by Circle, which can freeze or blocklist addresses.</li>
        <li>Permissioned validators: Arc uses permissioned validators at launch.</li>
        {includesBridge && (
          <li>Bridge risk: bridged assets (WETH, cirBTC) carry risk from their bridges.</li>
        )}
        <li>Liquidation risk: positions with a health factor below 1.0 can be liquidated at any time.</li>
      </ul>
    </details>
  )
}
