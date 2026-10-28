/**
 * WrongNetworkBanner — shown when the connected wallet is on a different chain
 * from the active network (Arc Mainnet on production, Arc Testnet in dev).
 */
import { useAccount, useSwitchChain } from 'wagmi'
import { Warning } from '@phosphor-icons/react'
import { ARC_CHAIN_ID, NETWORK_NAME } from '../../lib/steadfi'

export default function WrongNetworkBanner() {
  const { chainId, isConnected } = useAccount()
  const { switchChain, isPending } = useSwitchChain()

  if (!isConnected || chainId === ARC_CHAIN_ID) return null

  return (
    <div
      role="alert"
      className="flex flex-wrap items-center justify-center gap-x-3 gap-y-2 px-4 py-2.5
                 bg-[color-mix(in_srgb,var(--color-warning)_10%,transparent)] border-b border-[color-mix(in_srgb,var(--color-warning)_30%,transparent)]
                 text-sm text-[var(--color-foreground)]"
    >
      <Warning size={16} weight="fill" className="text-[var(--color-warning)]" aria-hidden="true" />
      <span>Your wallet is on another network. SteadFi runs on <strong>{NETWORK_NAME}</strong>.</span>
      <button
        onClick={() => switchChain({ chainId: ARC_CHAIN_ID })}
        disabled={isPending}
        className="h-8 px-3 rounded-full text-xs font-semibold cursor-pointer bg-[var(--color-foreground)] text-[var(--color-background)] hover:opacity-90 transition-base disabled:opacity-50"
      >
        {isPending ? 'Switching…' : 'Switch network'}
      </button>
    </div>
  )
}
