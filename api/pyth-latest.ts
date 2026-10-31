/**
 * Vercel serverless function: POST /api/pyth-latest  { feedIds: number[] }
 *
 * Returns the latest signed Pyth Pro update for the browser keeper
 * (src/admin/keeper). PYTH_API_KEY is a server-side Vercel Environment
 * Variable (Project → Settings → Environment Variables), never VITE_*.
 */

import { fetchPythLatest, ProxyError } from './_pyth'

type Req = { method?: string; body?: unknown }
type Res = {
  status(code: number): Res
  setHeader(name: string, value: string): Res
  json(body: unknown): void
}

export default async function handler(req: Req, res: Res) {
  res.setHeader('Cache-Control', 'no-store')
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Method not allowed' })
  }
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body
    res.status(200).json(await fetchPythLatest(body, process.env.PYTH_API_KEY))
  } catch (err) {
    const status = err instanceof ProxyError ? err.status : 400
    const message = err instanceof ProxyError ? err.message : 'Bad request'
    res.status(status).json({ error: message })
  }
}
