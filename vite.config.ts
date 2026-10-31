import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { nodePolyfills } from 'vite-plugin-node-polyfills'
import { fetchPythLatest, ProxyError } from './api/_pyth'

// Dev-only stand-in for the Vercel function api/pyth-latest.ts. PYTH_API_KEY is
// read from .env on the dev server and never reaches the browser bundle.
const pythProxyPlugin = (apiKey: string | undefined): Plugin => ({
  name: 'steadfi-pyth-proxy',
  configureServer(server) {
    server.middlewares.use('/api/pyth-latest', (req, res) => {
      const send = (status: number, body: unknown) => {
        res.statusCode = status
        res.setHeader('Content-Type', 'application/json')
        res.setHeader('Cache-Control', 'no-store')
        res.end(JSON.stringify(body))
      }
      if (req.method !== 'POST') return send(405, { error: 'Method not allowed' })
      let raw = ''
      req.on('data', chunk => { raw += chunk })
      req.on('end', async () => {
        try {
          send(200, await fetchPythLatest(JSON.parse(raw || '{}'), apiKey))
        } catch (err) {
          send(err instanceof ProxyError ? err.status : 400, {
            error: err instanceof ProxyError ? err.message : 'Bad request',
          })
        }
      })
    })
  },
})

export default defineConfig(({ mode }) => ({
  plugins: [react(), nodePolyfills(), pythProxyPlugin(loadEnv(mode, process.cwd(), '').PYTH_API_KEY)],
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
}))
