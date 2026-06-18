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
 *   - TikTok Creative Center: LIVE, best-effort. Its public Creative Radar JSON
 *                        API returns trending hashtags over plain HTTP (no
 *                        headless browser needed), so we fetch it behind a short
 *                        timeout and fold the tags into the matching niches. Any
 *                        anti-bot / region block falls back silently to mock, the
 *                        same contract as Google — enrich when we can, never block.
 *   - Instaloader: SEAM (not implemented). Instagram rate-limits this hard and
 *                        needs a logged-in, proxied, slow session — a separate
 *                        scheduled worker, not a request-time function. Stubbed
 *                        below with the same signature so wiring it in is additive.
 *
 * Network impurity is isolated to THIS module so trends.js stays pure and
 * node-testable. `fetch` is injectable so tests run offline and deterministic.
 */

import { generateMockBatch, normalizeNiche, GENERIC_NICHE, NICHES } from './trends.js'

// Best-effort live fetch should never hold up a daily cron; bail fast.
const LIVE_TIMEOUT_MS = 2500
// Google Trends Daily Trends — public RSS, no API key. geo is an ISO country.
const GOOGLE_TRENDS_RSS = (geo) => `https://trends.google.com/trending/rss?geo=${encodeURIComponent(geo)}`
// TikTok Creative Center — public Creative Radar JSON, no API key. Trending
// hashtags for the last 7 days in a country; returns { data: { list: [...] } }.
const TIKTOK_TRENDS_API = (geo) =>
  `https://ads.tiktok.com/creative_radar_api/v1/popular_trend/hashtag/list?period=7&page=1&limit=20&country_code=${encodeURIComponent(geo)}`

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

/*
 * Fetch today's trending hashtags from TikTok's public Creative Center (Creative
 * Radar) JSON API. Returns a capped list of '#tag' strings, or throws (caller
 * falls back to mock). Plain HTTP + JSON — no headless browser. Same best-effort
 * contract as Google: short timeout, and any block / shape change just throws so
 * the harvest keeps the mock baseline.
 */
export async function fetchTikTokTrends({ fetch = globalThis.fetch, geo = 'US', timeoutMs = LIVE_TIMEOUT_MS } = {}) {
  if (typeof fetch !== 'function') throw new Error('no fetch available')
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(TIKTOK_TRENDS_API(geo), {
      signal: controller.signal,
      headers: {
        'user-agent': 'EchoTrendHarvester/1.0 (+https://github.com)',
        accept: 'application/json',
      },
    })
    if (!res || !res.ok) throw new Error(`tiktok creative center ${res ? res.status : 'no response'}`)
    const data = await res.json()
    const list = data && data.data && Array.isArray(data.data.list) ? data.data.list : null
    if (!list || !list.length) throw new Error('tiktok: no hashtags in response')
    const seen = new Set()
    const tags = []
    for (const item of list) {
      const name = item && (item.hashtag_name || item.hashtagName)
      const clean = typeof name === 'string' ? name.trim().replace(/^#/, '') : ''
      if (clean && !seen.has(clean.toLowerCase())) {
        seen.add(clean.toLowerCase())
        tags.push(`#${clean}`)
      }
      if (tags.length >= 20) break
    }
    if (!tags.length) throw new Error('tiktok: no hashtags parsed')
    return tags
  } finally {
    clearTimeout(timer)
  }
}

// SEAM: Instaloader co-occurring hashtags on top niche posts. Instagram rate-
// limits this hard, so it must run slowly (≈once/day) with rotating proxies —
// a separate worker, not a request-time function. Stubbed with the live
// fetchers' signature so wiring it in later is purely additive.
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
 * Fold live trending hashtags (TikTok) into a mock batch. Each tag is added to
 * the generic niche and, when it keyword-matches a specific niche, to that niche
 * too — at the top with max momentum (100), because it's trending *today*, ahead
 * of the date-seeded pool. Deduped against existing tags and length-capped so a
 * query slice stays small. Returns the set of niches it touched.
 */
function mergeLiveHashtags(batch, tags) {
  const touched = new Set()
  const addTag = (id, tag) => {
    const slice = batch.niches[id]
    if (!slice) return
    if (!slice.hashtags.some((h) => h.tag.toLowerCase() === tag.toLowerCase())) {
      slice.hashtags = [{ tag, momentum: 100 }, ...slice.hashtags].slice(0, 8)
      touched.add(id)
    }
  }

  for (const raw of tags) {
    const tag = String(raw).trim()
    if (!tag) continue
    addTag(GENERIC_NICHE, tag)
    const id = normalizeNiche(tag)
    if (id !== GENERIC_NICHE) addTag(id, tag)
  }
  return touched
}

/*
 * Harvest a fresh batch. Always starts from the deterministic mock baseline,
 * then best-effort enriches it with live signals from each source independently
 * — one source failing never affects the other or the mock baseline. `source`
 * reflects what made it in: 'mock' (all live skipped or failed) or 'mixed' (mock
 * + at least one live source). `live` records per-source outcome:
 *   { google?: number, error?: string, tiktok?: number, tiktokError?: string }
 * (`google`/`error` keep their original names so existing consumers/tests hold.)
 *
 * Options:
 *   now       Date the batch represents (defaults to current time).
 *   live      Attempt live sources (default true). Failures never throw.
 *   fetch     Injected fetch impl — pass a stub in tests for offline runs.
 *   geo       Region for both sources (default 'US').
 */
export async function harvestBatch({ now = new Date(), live = true, fetch = globalThis.fetch, geo = 'US' } = {}) {
  const batch = generateMockBatch({ now })
  if (!live) return batch

  const report = {}
  let touchedAny = false

  // Google Trends → trending search terms folded in as topics.
  try {
    const terms = await fetchGoogleTrends({ fetch, geo })
    if (mergeLiveTerms(batch, terms).size) touchedAny = true
    report.google = terms.length
  } catch (err) {
    report.error = String(err && err.message ? err.message : err)
  }

  // TikTok Creative Center → trending hashtags folded into the niche tag pools.
  try {
    const tags = await fetchTikTokTrends({ fetch, geo })
    if (mergeLiveHashtags(batch, tags).size) touchedAny = true
    report.tiktok = tags.length
  } catch (err) {
    report.tiktokError = String(err && err.message ? err.message : err)
  }

  batch.source = touchedAny ? 'mixed' : batch.source
  batch.live = report
  return batch
}

// Count of niches in a batch — small helper for the harvest endpoint's summary.
export function nicheCount(batch) {
  return batch && batch.niches ? Object.keys(batch.niches).length : 0
}

// Re-export so a consumer can pull the taxonomy from one import if convenient.
export { NICHES }
