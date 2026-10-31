/**
 * wagmi configuration
 * Built with Arc Studio — https://studio.arc.io
 */

import { http, fallback, createConfig } from 'wagmi'
import { mainnet } from 'wagmi/chains'
import { arc, arcTestnet } from 'viem/chains'
import { injected } from 'wagmi/connectors'
import { registerChain } from './tracing'

// Active chain: Arc Mainnet (5042) or Arc Testnet (5042002) based on VITE_NETWORK.
const _network = String(import.meta.env.VITE_NETWORK ?? 'mainnet').toLowerCase()
const IS_MAINNET = _network !== 'testnet'
export const activeChain = IS_MAINNET ? arc : arcTestnet

// Reads go through a same-origin proxy (/arc-rpc: the Vite proxy in dev, a
// rewrite in vercel.json in production) so they cannot be blocked as
// cross-origin requests. Every public Arc endpoint follows as a fallback, so
// one RPC returning 503 no longer leaves balances and prices empty.
const ARC_PROXY_URL = typeof window !== 'undefined'
  ? `${window.location.origin}/arc-rpc`
  : null
// Production: set VITE_ARC_RPC_URL to a dedicated RPC provider.
const CUSTOM_RPC_URL = import.meta.env.VITE_ARC_RPC_URL as string | undefined
const DEFAULT_RPC = IS_MAINNET ? 'https://rpc.mainnet.arc.io' : 'https://rpc.testnet.arc.io'
const ARC_RPC_URLS = [
  ...(CUSTOM_RPC_URL ? [CUSTOM_RPC_URL] : []),
  ...(ARC_PROXY_URL ? [ARC_PROXY_URL] : []),
  DEFAULT_RPC,
]

// Pre-register chain RPC URLs so trace events show correct chain names immediately
ARC_RPC_URLS.forEach(url => registerChain(activeChain.id, url))

// Arc chain IDs — cover both so TS is happy even though only one is active.
const ARC_MAINNET_ID = arc.id         // 5042
const ARC_TESTNET_ID = arcTestnet.id  // 5042002

export const arcTransport = fallback(ARC_RPC_URLS.map(url => http(url)))

export const config = createConfig({
  chains: [activeChain, mainnet], // mainnet needed for ENS resolution
  connectors: [injected()],
  transports: {
    [ARC_MAINNET_ID]:  IS_MAINNET  ? arcTransport : http(),
    [ARC_TESTNET_ID]:  !IS_MAINNET ? arcTransport : http(),
    [mainnet.id]: http(), // ENS resolution uses mainnet
  },
})
