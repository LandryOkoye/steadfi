/**
 * Shared Pyth Pro (Lazer) price proxy — used by api/pyth-latest.ts (Vercel)
 * and by vite dev via vite.config.ts.
 *
 * Keeps PYTH_API_KEY server-side: the browser never sees it.
 *
 * POST only. Accepts { feedIds: number[] } (allowlist: 1, 2, 327). Builds the
 * Lazer request body server-side (fixed properties/formats/channel) and
 * forwards it to https://pyth-lazer.dourolabs.app/v1/latest_price.
 *
 * Returns { evmPayload, prices, fetchedAt } — never the upstream key or raw
 * headers. 2s in-memory cache for identical requests; Cache-Control: no-store.
 */

import { loadEnv } from 'vite'
import { buildPythRequest } from '../src/lib/pythLatest'

const CACHE_TTL_MS = 2_000

type Cached = { value: ResponsePayload; expires: number }
const cache = new Map<string, Cached>()

export interface ResponsePayload {
  evmPayload: string
  prices: { feedId: number; price: string; exponent: number; confidence: string; publishTime: number }[]
  fetchedAt: number
}

interface LazerError extends Error {
  status?: number
}

function isProd() {
  return typeof process !== 'undefined' && process.env.NODE_ENV === 'production'
}

function getApiKey(): string | undefined {
  // Vercel runtime: PYTH_API_KEY is a server env var.
  // Vite dev: loadEnv reads .env (PYTH_API_KEY is NOT VITE_*, so only the
  // dev server process sees it — never shipped to the browser).
  if (typeof process !== 'undefined' && process.env.PYTH_API_KEY) return process.env.PYTH_API_KEY
  try {
    const env = loadEnv(isProd() ? 'production' : 'development', process.cwd(), '')
    if (env.PYTH_API_KEY) return env.PYTH_API_KEY
  } catch {
    // loadEnv may not exist in plain Node; ignore.
  }
  return undefined
}

function makeErr(message: string, status: number): LazerError {
  const err = new Error(message) as LazerError
  err.status = status
  return err
}

export async function handlePythLatest(body: unknown): Promise<ResponsePayload> {
  const parsed = body as { feedIds?: unknown }
  if (!Array.isArray(parsed.feedIds) || parsed.feedIds.length === 0) {
    throw makeErr('feedIds must be a non-empty array', 400)
  }
  const feedIds = parsed.feedIds as number[]
  // buildPythRequest re-validates the allowlist
  buildPythRequest(feedIds)

  const cacheKey = JSON.stringify(feedIds)
  const now = Date.now()
  const hit = cache.get(cacheKey)
  if (hit && hit.expires > now) return hit.value

  const apiKey = getApiKey()
  if (!apiKey) {
    throw makeErr('Pyth Pro API key not configured on server', 502)
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 10_000)
  let res: Response
  try {
    res = await fetch('https://pyth-lazer.dourolabs.app/v1/latest_price', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(buildPythRequest(feedIds)),
      signal: controller.signal,
    })
  } finally {
    clearTimeout(timeout)
  }

  if (!res.ok) {
    throw makeErr(`Pyth Pro upstream returned ${res.status}`, 502)
  }

  const data = await res.json() as { evm?: { data?: unknown } }
  const evm = data.evm?.data
  if (typeof evm !== 'string') {
    throw makeErr('Pyth Pro response had no evm payload', 502)
  }

  const payload: ResponsePayload = {
    evmPayload: evm.startsWith('0x') ? evm : `0x${evm}`,
    prices: [],
    fetchedAt: now,
  }
  cache.set(cacheKey, { value: payload, expires: now + CACHE_TTL_MS })
  return payload
}

export function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Cache-Control': 'no-store',
  }
}
