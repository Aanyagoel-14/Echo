/*
 * GET|POST /api/trends-harvest — Feature 1 refresh path (the "scraper run").
 *
 * Harvests a fresh batch (mock baseline + best-effort live signals) and writes
 * it to the store, replacing the previous batch. This is the only place that
 * touches live sources. It runs on two triggers:
 *   - Vercel Cron, daily (see vercel.json) — the 24h refresh schedule. Cron
 *     invokes the function via GET.
 *   - Manually (GET in a browser, or POST) — to seed the cache or run the
 *     spec's "run the scraper, confirm a fresh batch + timestamp" test.
 *
 * Live harvesting is on by default and best-effort; set ECHO_TRENDS_LIVE=0 to
 * force the deterministic mock-only path (handy offline / in CI). Failures in a
 * live source never fail the harvest — the mock baseline always persists.
 *
 * Response: { ok, harvestedAt, dateKey, source, niches, live, path }
 */

import { harvestBatch, nicheCount } from '../src/lib/trendSources.js'
import { writeBatch } from '../src/lib/trendStore.js'

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST')
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  const live = process.env.ECHO_TRENDS_LIVE !== '0'

  try {
    const batch = await harvestBatch({ now: new Date(), live })
    const path = writeBatch(batch)
    console.log('[trends-harvest] wrote batch', {
      harvestedAt: batch.harvestedAt,
      source: batch.source,
      niches: nicheCount(batch),
      live: batch.live ?? null,
    })
    res.status(200).json({
      ok: true,
      harvestedAt: batch.harvestedAt,
      dateKey: batch.dateKey,
      source: batch.source,
      niches: nicheCount(batch),
      live: batch.live ?? null,
      path,
    })
  } catch (err) {
    // A write failure (e.g. read-only FS) is the realistic error here; surface
    // it rather than silently dropping the refresh.
    console.error('[trends-harvest] failed', err)
    res.status(500).json({ ok: false, error: String(err && err.message ? err.message : err) })
  }
}
