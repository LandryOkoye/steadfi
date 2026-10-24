/**
 * wagmi configuration
 * Built with Arc Studio — https://studio.arc.io
 */

import { http, fallback, createConfig } from 'wagmi'
import { mainnet } from 'wagmi/chains'
import { arcTestnet } from 'viem/chains'
import { injected } from 'wagmi/connectors'
import { registerChain } from './tracing'

// In dev, reads go through the Vite proxy (/arc-rpc, see vite.config.ts) so they
// are same-origin and cannot be blocked as cross-origin requests. Every public
// Arc endpoint follows as a fallback, so one RPC returning 503 no longer leaves
// balances and prices empty.
const ARC_PROXY_URL = import.meta.env.DEV && typeof window !== 'undefined'
  ? `${window.location.origin}/arc-rpc`
  : null
// Production: set VITE_ARC_RPC_URL to a dedicated RPC provider (or a same-origin
// proxy on your host). Public endpoints are rate-limited and are only a fallback.
const CUSTOM_RPC_URL = import.meta.env.VITE_ARC_RPC_URL as string | undefined
const ARC_RPC_URLS = [
  ...(CUSTOM_RPC_URL ? [CUSTOM_RPC_URL] : []),
  ...(ARC_PROXY_URL ? [ARC_PROXY_URL] : []),
  ...arcTestnet.rpcUrls.default.http,
]

// Pre-register chain RPC URLs so trace events show correct chain names immediately
ARC_RPC_URLS.forEach(url => registerChain(arcTestnet.id, url))

export const config = createConfig({
  chains: [arcTestnet, mainnet], // mainnet needed for ENS resolution
  connectors: [injected()],
  transports: {
    [arcTestnet.id]: fallback(ARC_RPC_URLS.map(url => http(url))),
    [mainnet.id]: http(), // ENS resolution uses mainnet
  },
})
