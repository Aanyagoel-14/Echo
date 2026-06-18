/*
 * Feature 1 — Trend Harvesting Engine (sources / the "scraper").
 *
 * harvestBatch() produces a fresh TrendBatch to persist. It is mock-first, like
 * api/generate.js: it ALWAYS returns a complete, well-shaped batch with zero
 * dependencies, and folds in live signals only on a best-effort basis. This is
 * the seam where the spec's free/open sources plug in — every source returns
 * the same TrendBatch shape (see trends.js), so the store, the cron, and the
 * query path never change as real sources are added or removed.
 *
 * Sources, by status:
 *   - Mock (always):     generateMockBatch() — the deterministic baseline.
 *   - Google Trends:     LIVE, best-effort. The public Daily Trends RSS feed is
 *                        free and keyless; we fetch it behind a short timeout
 *                        and fold the trending search terms in as topics. Any
 *                        failure (offline, rate-limit, markup change) falls back
 *                        silently to mock — the carousel-image "best-effort"
 *                        pattern: enrich when we can, never block, never crash.
 *   - TikTok Creative Center / Instaloader: SEAMS (not implemented). Both need
 *                        a headless browser or a rate-limited logged-in session,
 *                        which don't fit a serverless function; they belong in a
 *                        separate scheduled worker. Stubbed below with the same
 *                        signature so wiring them in later is additive.
 *
 * Network impurity is isolated to THIS module so trends.js stays pure and
 * node-testable. `fetch` is injectable so tests run offline and deterministic.
 */

import { generateMockBatch, normalizeNiche, GENERIC_NICHE, NICHES } from './trends.js'

// Best-effort live fetch should never hold up a daily cron; bail fast.
const LIVE_TIMEOUT_MS = 2500
// Google Trends Daily Trends — public RSS, no API key. geo is an ISO country.
const GOOGLE_TRENDS_RSS = (geo) => `https://trends.google.com/trending/rss?geo=${encodeURIComponent(geo)}`

/*
 * Fetch today's trending searches from Google Trends' public RSS feed.
 * Returns a capped list of plain search terms, or throws (caller falls back to
 * mock). We parse <title> out of each <item> with a regex rather than pulling
 * in an XML dependency — the feed is small and the shape is stable.
 */
export async function fetchGoogleTrends({ fetch = globalThis.fetch, geo = 'US', timeoutMs = LIVE_TIMEOUT_MS } = {}) {
  if (typeof fetch !== 'function') throw new Error('no fetch available')
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(GOOGLE_TRENDS_RSS(geo), {
      signal: controller.signal,
      headers: { 'user-agent': 'EchoTrendHarvester/1.0 (+https://github.com)' },
    })
    if (!res || !res.ok) throw new Error(`google trends ${res ? res.status : 'no response'}`)
    const xml = await res.text()
    const terms = []
    // <item>…<title>Term</title>…</item> — take the first <title> per <item>.
    for (const m of xml.matchAll(/<item\b[\s\S]*?<\/item>/g)) {
      const t = m[0].match(/<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/)
      const term = t && t[1] && t[1].trim()
      if (term) terms.push(term)
      if (terms.length >= 20) break
    }
    if (!terms.length) throw new Error('google trends: no items parsed')
    return terms
  } finally {
    clearTimeout(timer)
  }
}

// SEAM: TikTok Creative Center (trending hashtags/sounds). Needs a headless
// browser to render the Trend Discovery page — run it from a separate worker,
// not this function. Wire it in here when that worker exists.
export async function fetchTikTokTrends() {
  throw new Error('not implemented: TikTok Creative Center needs a headless-browser worker')
}

// SEAM: Instaloader co-occurring hashtags on top niche posts. Instagram rate-
// limits this hard, so it must run slowly (≈once/day) with rotating proxies —
// again, a separate worker, not a request-time function.
export async function fetchInstagramCooccurrence() {
  throw new Error('not implemented: Instaloader needs a rate-limited proxied worker')
}

/*
 * Fold live trending search terms into a mock batch. Each term seeds a topic on
 * the generic niche (so "what's trending broadly" always lands somewhere) and,
 * when a term keyword-matches a specific niche, is added there too. The result
 * is deduped and length-capped so a query slice stays small and actionable.
 */
function mergeLiveTerms(batch, terms) {
  const touched = new Set()
  const addTopic = (id, topic) => {
    const slice = batch.niches[id]
    if (!slice) return
    if (!slice.topics.some((t) => t.toLowerCase() === topic.toLowerCase())) {
      // Live signals lead — they're today's reality, not yesterday's pool.
      slice.topics = [topic, ...slice.topics].slice(0, 6)
      touched.add(id)
    }
  }

  for (const term of terms) {
    addTopic(GENERIC_NICHE, term)
    const id = normalizeNiche(term)
    if (id !== GENERIC_NICHE) addTopic(id, term)
  }
  return touched
}

/*
 * Harvest a fresh batch. Always starts from the deterministic mock baseline,
 * then best-effort enriches it with live signals. `source` reflects what made
 * it in: 'mock' (live skipped or failed) or 'mixed' (mock + live).
 *
 * Options:
 *   now       Date the batch represents (defaults to current time).
 *   live      Attempt live sources (default true). Failures never throw.
 *   fetch     Injected fetch impl — pass a stub in tests for offline runs.
 *   geo       Google Trends region (default 'US').
 */
export async function harvestBatch({ now = new Date(), live = true, fetch = globalThis.fetch, geo = 'US' } = {}) {
  const batch = generateMockBatch({ now })
  if (!live) return batch

  try {
    const terms = await fetchGoogleTrends({ fetch, geo })
    const touched = mergeLiveTerms(batch, terms)
    batch.source = touched.size ? 'mixed' : batch.source
    batch.live = { google: terms.length }
  } catch (err) {
    // Best-effort: keep the mock baseline, record why live was skipped.
    batch.live = { error: String(err && err.message ? err.message : err) }
  }
  return batch
}

// Count of niches in a batch — small helper for the harvest endpoint's summary.
export function nicheCount(batch) {
  return batch && batch.niches ? Object.keys(batch.niches).length : 0
}

// Re-export so a consumer can pull the taxonomy from one import if convenient.
export { NICHES }
