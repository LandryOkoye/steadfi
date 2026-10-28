/**
 * Chunked, cached eth_getLogs for the Arc RPC. Shared by the History page and
 * the admin console.
 *
 * The public Arc RPC rejects ranges above ~10k blocks and rate-limits
 * eth_getLogs (HTTP 429), so scanning the whole pool history on every page load
 * does not scale. This helper:
 *  - filters on the server by event signature and, optionally, an indexed
 *    topic (e.g. the user), instead of downloading every pool event;
 *  - caches decoded logs in localStorage after every chunk, so later loads
 *    (and retries after a failure) only scan blocks not yet covered,
 *    re-checking the last RESCAN_BLOCKS for safety;
 *  - backs off exponentially on errors.
 */
import { encodeEventTopics, formatLog, parseEventLogs, type AbiEvent, type Hex, type PublicClient } from 'viem'

/** Arc's RPC rejects eth_getLogs ranges above ~10k blocks — chunk at 5k. */
const LOG_CHUNK = 5_000n
/**
 * One request at a time: the public RPC answers sequential eth_getLogs
 * reliably (~0.5s each) but returns 429 to parallel bursts.
 */
/** Attempts per chunk before the whole load is reported as failed. */
const CHUNK_ATTEMPTS = 5
/** Re-scan this many blocks below the cached head on every load. */
const RESCAN_BLOCKS = 200n
const CACHE_VERSION = 1

export interface DecodedLog {
  eventName: string
  args: Record<string, unknown>
  transactionHash: Hex
  blockNumber: bigint
  logIndex: number
}

interface Options {
  /** Extra topic filters after topic0, e.g. [userTopic] for an indexed first arg. */
  topics?: (Hex | null)[]
  /** Enables the localStorage cache; must be unique per (events, topics) query. */
  cacheKey?: string
  isCancelled?: () => boolean
  /** Called with 0..1 as chunks complete. */
  onProgress?: (fraction: number) => void
}

// ── bigint-safe (de)serialisation for the cache ──────────────────────────────
const replacer = (_k: string, v: unknown) => (typeof v === 'bigint' ? { __big: v.toString() } : v)
const reviver = (_k: string, v: unknown) =>
  v && typeof v === 'object' && '__big' in (v) ? BigInt((v as { __big: string }).__big) : v

interface CacheEntry { v: number; scannedTo: string; logs: DecodedLog[] }

function readCache(key: string): { scannedTo: bigint; logs: DecodedLog[] } | null {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return null
    const entry = JSON.parse(raw, reviver) as CacheEntry
    if (entry.v !== CACHE_VERSION) return null
    return { scannedTo: BigInt(entry.scannedTo), logs: entry.logs }
  } catch {
    return null
  }
}

function writeCache(key: string, scannedTo: bigint, logs: DecodedLog[]) {
  try {
    const entry: CacheEntry = { v: CACHE_VERSION, scannedTo: scannedTo.toString(), logs }
    localStorage.setItem(key, JSON.stringify(entry, replacer))
  } catch {
    // Storage full or blocked (private mode): the scan still works, just uncached.
  }
}

/**
 * Decoded logs of `events` emitted by `address` from `fromBlock` to the head,
 * oldest first.
 */
export async function getLogsChunked(
  client: PublicClient,
  address: `0x${string}`,
  events: readonly AbiEvent[],
  fromBlock: bigint,
  { topics = [], cacheKey, isCancelled = () => false, onProgress }: Options = {},
): Promise<DecodedLog[]> {
  const topic0 = events.map(e => encodeEventTopics({ abi: [e], eventName: e.name })[0])
  const key = cacheKey ? `steadfi:logs:${cacheKey}:${address.toLowerCase()}:${fromBlock}` : null
  const cached = key ? readCache(key) : null

  let start = fromBlock
  let kept: DecodedLog[] = []
  if (cached) {
    const rescanFrom = cached.scannedTo > RESCAN_BLOCKS ? cached.scannedTo - RESCAN_BLOCKS : fromBlock
    start = rescanFrom > fromBlock ? rescanFrom : fromBlock
    kept = cached.logs.filter(l => l.blockNumber < start)
  }

  async function fetchChunk(from: bigint, to: bigint): Promise<DecodedLog[]> {
    let lastErr: unknown
    for (let attempt = 0; attempt < CHUNK_ATTEMPTS; attempt++) {
      try {
        const raw = await client.request({
          method: 'eth_getLogs',
          params: [{
            address,
            topics: [topic0, ...topics],
            fromBlock: `0x${from.toString(16)}`,
            toBlock: `0x${to.toString(16)}`,
          }],
        })
        const parsed = parseEventLogs({ abi: events, logs: (raw as never[]).map(l => formatLog(l)) })
        return parsed.map(l => ({
          eventName: l.eventName,
          args: l.args as Record<string, unknown>,
          transactionHash: l.transactionHash,
          blockNumber: l.blockNumber,
          logIndex: Number(l.logIndex),
        }))
      } catch (err) {
        lastErr = err
        // 0.75s, 1.5s, 3s, 6s — rides out 429 rate limiting.
        await new Promise(r => setTimeout(r, 750 * 2 ** attempt))
      }
    }
    throw lastErr
  }

  const head = await client.getBlockNumber()
  const chunks: { from: bigint; to: bigint }[] = []
  for (let s = start; s <= head; s += LOG_CHUNK) {
    chunks.push({ from: s, to: s + LOG_CHUNK - 1n > head ? head : s + LOG_CHUNK - 1n })
  }

  const sortLogs = (logs: DecodedLog[]) => logs.sort((a, b) =>
    a.blockNumber === b.blockNumber ? a.logIndex - b.logIndex : a.blockNumber < b.blockNumber ? -1 : 1)

  const all = [...kept]
  for (let i = 0; i < chunks.length; i++) {
    if (isCancelled()) return sortLogs(all)
    all.push(...await fetchChunk(chunks[i].from, chunks[i].to))
    // Checkpoint, so a failure later in the scan doesn't lose this progress.
    if (key) writeCache(key, chunks[i].to, all)
    onProgress?.((i + 1) / chunks.length)
  }

  sortLogs(all)
  if (key) writeCache(key, head, all)
  return all
}
