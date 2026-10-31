/**
 * Pyth Pro (Lazer) price proxy core, shared by api/pyth-latest.ts (Vercel) and
 * the dev-server plugin in vite.config.ts. Files starting with "_" in api/ are
 * not exposed as routes.
 *
 * Keeps PYTH_API_KEY server-side: the browser never sees it. The request body
 * sent upstream is fixed here; callers only choose feeds from an allowlist.
 * No CORS headers, so other sites cannot use this endpoint from a browser.
 */

const LAZER_URL = 'https://pyth-lazer.dourolabs.app/v1/latest_price'
const ALLOWED_FEED_IDS = new Set([1, 2, 327]) // BTC/USD, ETH/USD, EUR/USD
const CACHE_TTL_MS = 2_000
const TIMEOUT_MS = 10_000

export interface PythFeed {
  feedId: number
  price: string
  exponent: number
  /** Unix seconds of the feed's last upstream update. */
  publishTime: number
}

export interface PythLatest {
  /** Signed payload for PythOracleAdapter.updatePrices(bytes). */
  evmPayload: `0x${string}`
  feeds: PythFeed[]
  fetchedAt: number
}

export class ProxyError extends Error {
  constructor(message: string, public status: number) { super(message) }
}

const cache = new Map<string, { value: PythLatest; expires: number }>()

export function parseFeedIds(body: unknown): number[] {
  const ids = (body as { feedIds?: unknown } | null)?.feedIds
  if (!Array.isArray(ids) || ids.length === 0 || ids.length > ALLOWED_FEED_IDS.size) {
    throw new ProxyError('feedIds must be a non-empty array', 400)
  }
  for (const id of ids) {
    if (typeof id !== 'number' || !ALLOWED_FEED_IDS.has(id)) {
      throw new ProxyError(`feedId ${String(id)} not allowed`, 400)
    }
  }
  return [...new Set(ids as number[])].sort((a, b) => a - b)
}

export async function fetchPythLatest(body: unknown, apiKey: string | undefined): Promise<PythLatest> {
  const feedIds = parseFeedIds(body)
  if (!apiKey) throw new ProxyError('Price service not configured (PYTH_API_KEY missing on the server)', 503)

  const cacheKey = feedIds.join(',')
  const hit = cache.get(cacheKey)
  if (hit && hit.expires > Date.now()) return hit.value

  let res: Response
  try {
    res = await fetch(LAZER_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        priceFeedIds: feedIds,
        properties: ['price', 'exponent', 'confidence', 'feedUpdateTimestamp'],
        formats: ['evm'],
        jsonBinaryEncoding: 'hex',
        channel: 'real_time',
        parsed: true,
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
  } catch {
    throw new ProxyError('Price service unreachable', 502)
  }
  if (!res.ok) throw new ProxyError(`Price service returned ${res.status}`, 502)

  const data = await res.json() as {
    evm?: { data?: string }
    parsed?: { priceFeeds?: { priceFeedId: number; price?: string; exponent?: number; feedUpdateTimestamp?: number }[] }
  }
  const evm = data.evm?.data
  if (typeof evm !== 'string' || evm.length === 0) throw new ProxyError('Price service returned no payload', 502)

  const value: PythLatest = {
    evmPayload: (evm.startsWith('0x') ? evm : `0x${evm}`) as `0x${string}`,
    feeds: (data.parsed?.priceFeeds ?? []).map(f => ({
      feedId: f.priceFeedId,
      price: f.price ?? '0',
      exponent: f.exponent ?? 0,
      publishTime: Math.floor((f.feedUpdateTimestamp ?? 0) / 1_000_000),
    })),
    fetchedAt: Date.now(),
  }
  cache.set(cacheKey, { value, expires: Date.now() + CACHE_TTL_MS })
  return value
}
