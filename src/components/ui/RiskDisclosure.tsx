/**
 * RiskDisclosure — plain-language risk banner shown on all action pages.
 */
import { WarningCircle } from '@phosphor-icons/react'

interface RiskDisclosureProps {
  includesBridge?: boolean
}

export default function RiskDisclosure({ includesBridge = false }: RiskDisclosureProps) {
  return (
    <aside
      className="mt-6 rounded-xl border border-[var(--color-border)] bg-[var(--color-muted)] p-4 text-xs text-[var(--color-muted-foreground)]"
      aria-label="Risk disclosures"
    >
      <div className="flex items-start gap-2">
        <WarningCircle size={16} className="shrink-0 mt-0.5 text-[var(--color-warning)]" aria-hidden="true" />
        <div className="space-y-1">
          <p className="font-semibold text-[var(--color-foreground)]">Risk disclosures</p>
          <ul className="list-disc list-inside space-y-0.5">
            <li>Smart-contract risk: SteadFi contracts have not yet been externally audited. Use at your own risk.</li>
            <li>USDC issuer risk: USDC is issued by Circle. Circle can freeze or blacklist addresses.</li>
            <li>Permissioned validators: Arc uses proof-of-authority validators at launch. Censorship risk exists until PoS migration.</li>
            {includesBridge && (
              <li>Bridge risk: bridged assets (WETH, cirBTC) carry smart-contract risk from their respective bridges.</li>
            )}
            <li>Liquidation risk: positions with a health factor below 1.0 may be liquidated at any time.</li>
          </ul>
        </div>
      </div>
    </aside>
  )
}
