/**
 * WrongNetworkBanner — shown when the connected wallet is on any chain other
 * than Arc Testnet. All reads/writes are pinned to Arc Testnet, but signing
 * requires the wallet itself to switch.
 */
import { useAccount, useSwitchChain } from 'wagmi'
import { Warning } from '@phosphor-icons/react'
import { ARC_TESTNET_CHAIN_ID } from '../../lib/steadfi'

export default function WrongNetworkBanner() {
  const { chainId, isConnected } = useAccount()
  const { switchChain } = useSwitchChain()

  if (!isConnected || chainId === ARC_TESTNET_CHAIN_ID) return null

  return (
    <div
      role="alert"
      className="flex flex-wrap items-center justify-center gap-2 px-4 py-2.5
                 bg-[var(--color-warning)]/15 border-b border-[var(--color-warning)]/40
                 text-sm text-[var(--color-foreground)]"
    >
      <Warning size={16} weight="fill" className="text-[var(--color-warning)]" aria-hidden="true" />
      <span>
        Your wallet is on the wrong network. SteadFi runs on <strong>Arc Testnet</strong> (chain 5042002).
      </span>
      <button
        onClick={() => switchChain({ chainId: ARC_TESTNET_CHAIN_ID })}
        className="px-3 py-1 rounded-full text-xs font-semibold cursor-pointer
                   bg-[var(--color-primary)] text-[var(--color-on-primary)]
                   hover:opacity-90 transition-base"
      >
        Switch to Arc Testnet
      </button>
    </div>
  )
}
