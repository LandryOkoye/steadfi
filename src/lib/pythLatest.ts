/**
 * Shared Pyth Pro (Lazer) price request builder — used by api/_pyth.ts (server)
 * and vite dev proxy.
 *
 * Builds the fixed Lazer request body (properties/formats/channel) and
 * validates the allowlist of feed IDs. Does NOT read PYTH_API_KEY — that stays
 * server-side in api/_pyth.ts.
 */

const LAZER_URL = 'https://pyth-lazer.dourolabs.app/v1/latest_price'
const ALLOWED_FEED_IDS = new Set([1, 2, 327]) // BTC/USD, ETH/USD, EUR/USD

export interface PythPriceRequest {
  priceFeedIds: number[]
  properties: string[]
  formats: string[]
  jsonBinaryEncoding: string
  channel: string
}

export function buildPythRequest(feedIds: number[]): PythPriceRequest {
  if (!Array.isArray(feedIds) || feedIds.length === 0) {
    throw new Error('feedIds must be a non-empty array')
  }
  for (const id of feedIds) {
    if (typeof id !== 'number' || !Number.isInteger(id) || !ALLOWED_FEED_IDS.has(id)) {
      throw new Error(`feedId ${String(id)} not allowed`)
    }
  }
  return {
    priceFeedIds: feedIds,
    properties: ['price', 'exponent', 'confidence', 'feedUpdateTimestamp'],
    formats: ['evm'],
    jsonBinaryEncoding: 'hex',
    channel: 'real_time',
  }
}

export { LAZER_URL }
