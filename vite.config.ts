import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { nodePolyfills } from 'vite-plugin-node-polyfills'
import { handlePythLatest, corsHeaders } from './api/_pyth'

const pythProxyPlugin = () => ({
  name: 'steadfi-pyth-proxy',
  configureServer(server: any) {
    server.middlewares.use((req: any, res: any, next: () => void) => {
      if (req.url !== '/api/pyth-latest' || req.method !== 'POST') return next()
      let body = ''
      req.on('data', (chunk: string) => { body += chunk })
      req.on('end', async () => {
        try {
          const parsed = JSON.parse(body || '{}')
          const payload = await handlePythLatest(parsed)
          for (const [k, v] of Object.entries(corsHeaders())) res.setHeader(k, v)
          res.statusCode = 200
          res.end(JSON.stringify(payload))
        } catch (err: unknown) {
          const status = (err as { status?: number }).status ?? 502
          for (const [k, v] of Object.entries(corsHeaders())) res.setHeader(k, v)
          res.statusCode = status
          res.end(JSON.stringify({ error: err instanceof Error ? err.message : 'upstream error' }))
        }
      })
    })
  },
})

export default defineConfig({
  plugins: [react(), nodePolyfills(), pythProxyPlugin()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
    dedupe: ['react', 'react-dom'],
  },
  optimizeDeps: {
    include: [
      'react',
      'react-dom',
      'react-dom/client',
      'react/jsx-runtime',
      '@tanstack/react-query',
      'wagmi',
      'wagmi/chains',
      'wagmi/connectors',
      'viem',
      'viem/chains',
      'connectkit',
      'framer-motion',
      'lucide-react',
      'sonner',
      'clsx',
      'tailwind-merge',
      'vite-plugin-node-polyfills/shims/buffer',
      'vite-plugin-node-polyfills/shims/global',
      'vite-plugin-node-polyfills/shims/process',
    ],
  },
  server: {
    allowedHosts: true,
    cors: true,
    proxy: {
      // Same-origin path to the Arc RPC. Browsers (extensions, privacy filters)
      // can block cross-origin calls to rpc.testnet.arc.io, which leaves every
      // balance/price read empty. See src/config.ts.
      '/arc-rpc': {
        // Default: Arc Mainnet. Override by setting VITE_NETWORK=testnet in .env.
        target: (process.env.VITE_NETWORK === 'testnet')
          ? 'https://rpc.testnet.arc.io'
          : 'https://rpc.mainnet.arc.io',
        changeOrigin: true,
        rewrite: () => '/',
      },
    },
  },
})
