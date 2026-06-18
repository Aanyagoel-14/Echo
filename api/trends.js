/*
 * GET /api/trends?niche=<id|free-text> — Feature 1 query path.
 *
 * Reads TODAY's cached trends for a niche and returns them. It NEVER scrapes:
 * the whole point of the engine is that query time hits our own cache, not the
 * source sites, so the app pays zero per-request fees. The harvest/cron
 * (/api/trends-harvest) is the only thing that touches live sources.
 *
 * If the cache is empty (cold serverless instance, before the first harvest),
 * we fall back to a freshly generated mock batch so the endpoint always returns
 * usable data — the same "always return a sensible result" guarantee as
 * api/generate.js. `stale` tells the caller whether a refresh is overdue.
 *
 * Response: { niche, label, hashtags:[{tag,momentum}], topics:[], sounds:[],
 *             harvestedAt, source, stale }
 */

import { generateMockBatch, isStale, selectNiche, GENERIC_NICHE } from '../src/lib/trends.js'
import { readBatch } from '../src/lib/trendStore.js'

export default function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  const niche = (req.query && req.query.niche) || GENERIC_NICHE

  // Prefer the cached harvest; fall back to a fresh mock so a cold instance
  // (no cache yet) still answers. The fallback is local generation — still no
  // network, still no per-request fee.
  const batch = readBatch() || generateMockBatch({ now: new Date() })
  const result = selectNiche(batch, niche)

  res.status(200).json({
    ...result,
    harvestedAt: batch.harvestedAt,
    source: batch.source,
    stale: isStale(batch, new Date()),
  })
}
