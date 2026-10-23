/**
 * GasEstimate — live gas price from Arc, converted to a USDC cost estimate.
 * On Arc gas is USDC, so a 300k-gas transaction is quoted directly in dollars.
 */
import { GasPump } from '@phosphor-icons/react'
import { useGasPrice } from 'wagmi'
import { formatUnits } from 'viem'

const TYPICAL_GAS = 300_000n

export default function GasEstimate() {
  const { data: gasPrice } = useGasPrice()
  const cost = gasPrice ? Number(formatUnits(gasPrice * TYPICAL_GAS, 18)) : null

  return (
    <div className="flex items-center gap-1.5 text-[11px] text-[var(--color-muted-foreground)]">
      <GasPump size={13} aria-hidden="true" />
      <span>
        Gas est.{' '}
        <span className="mono text-[var(--color-foreground)]">
          {cost === null ? '—' : `$${cost.toFixed(cost < 0.01 ? 5 : 3)}`}
        </span>{' '}
        USDC
      </span>
    </div>
  )
}
