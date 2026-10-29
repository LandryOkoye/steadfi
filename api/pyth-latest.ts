/**
 * Vercel serverless function: proxies Pyth Pro (Lazer) price requests.
 *
 * PYTH_API_KEY must be set as a server-side Vercel Environment Variable
 * (Project → Settings → Environment Variables, NOT VITE_*).
 *
 * Route: POST /api/pyth-latest  (OPTIONS preflight allowed)
 * Body:  { feedIds: number[] }  — only 1, 2, 327 allowed.
 */

import { handlePythLatest, corsHeaders } from './_pyth'

type Req = { method: string; body: unknown; headers: { [key: string]: string | string[] | undefined } }
type Res = {
  status(code: number): Res
  setHeader(k: string, v: string | string[]): Res
  json(obj: unknown): Res
  end(): Res
}

export default function handler(req: Req, res: Res) {
  if (req.method === 'OPTIONS') {
    for (const [k, v] of Object.entries(corsHeaders())) res.setHeader(k, v)
    res.status(204).end()
    return
  }

  if (req.method !== 'POST') {
    for (const [k, v] of Object.entries(corsHeaders())) res.setHeader(k, v)
    res.status(405).json({ error: 'method not allowed' })
    return
  }

  handlePythLatest(req.body)
    .then(payload => {
      for (const [k, v] of Object.entries(corsHeaders())) res.setHeader(k, v)
      res.status(200).json(payload)
    })
    .catch(err => {
      for (const [k, v] of Object.entries(corsHeaders())) res.setHeader(k, v)
      const status = (err as { status?: number }).status ?? 502
      res.status(status).json({ error: err?.message ?? 'upstream error' })
    })
}
