/**
 * GasEstimate — live gas price from Arc, converted to a USDC cost estimate.
 * On Arc gas is USDC, so a 300k-gas transaction is quoted directly in dollars.
 */
import { GasPump } from '@phosphor-icons/react'
import { useGasPrice } from 'wagmi'
import { formatUnits } from 'viem'
import { ARC_TESTNET_CHAIN_ID } from '../../lib/steadfi'

const TYPICAL_GAS = 300_000n

export default function GasEstimate() {
  const { data: gasPrice } = useGasPrice({ chainId: ARC_TESTNET_CHAIN_ID })
  const cost = gasPrice ? Number(formatUnits(gasPrice * TYPICAL_GAS, 18)) : null

  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-[var(--color-muted-foreground)]">
      <GasPump size={13} aria-hidden="true" />
      Gas ≈{' '}
      <span className="mono text-[var(--color-foreground)]">
        {cost === null ? '—' : `$${cost.toFixed(cost < 0.01 ? 4 : 3)}`}
      </span>
      <span>in USDC</span>
    </span>
  )
}
