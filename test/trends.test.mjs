/*
 * Feature 1 — Trend Harvesting Engine: standalone checks.
 *
 * Pure node, no test runner (matches the repo's "node-testable lib" style).
 * Run: `node test/trends.test.mjs`  (or `npm run test:trends`).
 *
 * Covers the spec's three "test on its own" criteria plus the supporting units:
 *   1. Harvest produces a fresh batch + timestamp, all niches populated.
 *   2. Re-running after the refresh window updates the data (and is idempotent
 *      within the same day).
 *   3. Querying a sample niche returns a usable list of hashtags/topics.
 * No live scraper or real upload needed — live sources are exercised with an
 * injected fake fetch so the run is offline and deterministic.
 */

import assert from 'node:assert/strict'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { rmSync } from 'node:fs'

import {
  NICHES,
  GENERIC_NICHE,
  generateMockBatch,
  normalizeNiche,
  isStale,
  selectNiche,
  REFRESH_INTERVAL_MS,
} from '../src/lib/trends.js'
import { harvestBatch, fetchGoogleTrends } from '../src/lib/trendSources.js'

// Point the file store at a throwaway path so we never touch the real cache.
const TMP_STORE = join(tmpdir(), `echo-trends.test.${process.pid}.json`)
process.env.ECHO_TRENDS_PATH = TMP_STORE
const { readBatch, writeBatch } = await import('../src/lib/trendStore.js')

let passed = 0
const ok = (label) => {
  passed++
  console.log(`  ✓ ${label}`)
}

const DAY1 = new Date('2026-06-18T00:00:00Z')
const DAY2 = new Date('2026-06-19T00:00:00Z')

// ── Test 1: a fresh batch with a timestamp, every niche populated ──────────
{
  console.log('Test 1 — harvest produces a fresh, timestamped, populated batch')
  const batch = await harvestBatch({ now: DAY1, live: false })

  assert.equal(batch.version, 1)
  assert.equal(batch.source, 'mock')
  assert.equal(batch.dateKey, '2026-06-18')
  assert.equal(batch.harvestedAt, '2026-06-18T00:00:00.000Z')
  assert.ok(!Number.isNaN(Date.parse(batch.harvestedAt)), 'harvestedAt is a real timestamp')

  const ids = Object.keys(batch.niches)
  assert.equal(ids.length, Object.keys(NICHES).length, 'every niche is present')

  for (const [id, slice] of Object.entries(batch.niches)) {
    assert.ok(slice.hashtags.length >= 3, `${id} has hashtags`)
    assert.ok(slice.topics.length >= 1, `${id} has topics`)
    assert.ok(slice.sounds.length >= 1, `${id} has sounds`)
    for (const h of slice.hashtags) {
      assert.ok(h.tag.startsWith('#'), `${id} hashtag is a tag`)
      assert.ok(h.momentum >= 0 && h.momentum <= 100, `${id} momentum in range`)
    }
  }
  ok('fresh batch has a timestamp and all niches populated')
}

// ── Test 2: refresh updates the data; same day is idempotent ───────────────
{
  console.log('Test 2 — re-running updates the batch (and is idempotent same-day)')
  const a = await harvestBatch({ now: DAY1, live: false })
  const b = await harvestBatch({ now: DAY1, live: false })
  assert.deepEqual(a, b, 'same day ⇒ identical batch (no-op refresh)')
  ok('same-day re-run is idempotent')

  const next = await harvestBatch({ now: DAY2, live: false })
  assert.notEqual(next.dateKey, a.dateKey, 'a new day has a new dateKey')
  assert.notEqual(
    JSON.stringify(next.niches.skincare),
    JSON.stringify(a.niches.skincare),
    'a new day rotates the trends (data updated)',
  )
  ok('a later day produces a visibly updated batch')
}

// ── Test 3: querying a sample niche returns usable trends ──────────────────
{
  console.log('Test 3 — query a niche for a usable list of hashtags/topics')
  const batch = await harvestBatch({ now: DAY1, live: false })

  const skin = selectNiche(batch, '#SkinCare ')
  assert.equal(skin.niche, 'skincare', 'fuzzy/hashtag input resolves to skincare')
  assert.equal(skin.label, NICHES.skincare.label)
  assert.ok(skin.hashtags.length >= 3 && skin.topics.length >= 1, 'usable lists returned')
  ok('querying "skincare" returns a usable trend slice')

  // Niche-specific results actually differ between niches.
  const finance = selectNiche(batch, 'investing money')
  assert.equal(finance.niche, 'finance', 'free-text resolves to finance')
  assert.notDeepEqual(finance.hashtags, skin.hashtags, 'different niches → different tags')
  ok('a different niche returns different trends')
}

// ── normalizeNiche: ids, labels, aliases, hashtags, "Other" fallback ───────
{
  console.log('Unit — normalizeNiche resolution')
  assert.equal(normalizeNiche('skincare'), 'skincare', 'exact id')
  assert.equal(normalizeNiche('Education'), 'edtech', 'label word')
  assert.equal(normalizeNiche('#GymTok workout'), 'fitness', 'alias via hashtag/token')
  assert.equal(normalizeNiche('crypto'), 'finance', 'alias')
  assert.equal(normalizeNiche('totally unrelated words'), GENERIC_NICHE, 'no match ⇒ general')
  assert.equal(normalizeNiche(''), GENERIC_NICHE, 'empty ⇒ general')
  assert.equal(normalizeNiche(null), GENERIC_NICHE, 'nullish ⇒ general')
  ok('niche normalization handles ids, labels, aliases, and the "Other" case')
}

// ── isStale: the 24h refresh window ────────────────────────────────────────
{
  console.log('Unit — isStale honours the 24h window')
  const fresh = generateMockBatch({ now: new Date() })
  assert.equal(isStale(fresh, new Date()), false, 'just-harvested ⇒ fresh')

  const old = generateMockBatch({ now: new Date(Date.now() - 2 * REFRESH_INTERVAL_MS) })
  assert.equal(isStale(old, new Date()), true, 'two days old ⇒ stale')
  assert.equal(isStale({}, new Date()), true, 'missing timestamp ⇒ stale')
  ok('staleness tracks the refresh window')
}

// ── Store: write then read round-trips; replaces previous batch ────────────
{
  console.log('Unit — file store round-trips and replaces the previous batch')
  const day1 = generateMockBatch({ now: DAY1 })
  const written = writeBatch(day1)
  assert.equal(written, TMP_STORE)
  assert.deepEqual(readBatch(), day1, 'read returns what was written')

  const day2 = generateMockBatch({ now: DAY2 })
  writeBatch(day2)
  assert.deepEqual(readBatch(), day2, 'a new write replaces the previous batch')
  ok('store persists and replaces batches')
}

// ── Live sources: best-effort merge with an injected fetch (offline) ───────
{
  console.log('Unit — best-effort live merge folds search terms in, never crashes')
  const RSS = `<rss><channel>
    <item><title>Skincare routine for winter</title><ht:approx_traffic>50K+</ht:approx_traffic></item>
    <item><title><![CDATA[Local election results]]></title></item>
    <item><title>New phone launch today</title></item>
  </channel></rss>`
  const fakeFetch = async () => ({ ok: true, status: 200, text: async () => RSS })

  const terms = await fetchGoogleTrends({ fetch: fakeFetch })
  assert.deepEqual(
    terms,
    ['Skincare routine for winter', 'Local election results', 'New phone launch today'],
    'RSS <title>s (incl. CDATA) parse out',
  )

  const merged = await harvestBatch({ now: DAY1, live: true, fetch: fakeFetch })
  assert.equal(merged.source, 'mixed', 'live signals flip source to mixed')
  assert.equal(merged.live.google, 3)
  assert.ok(
    merged.niches.general.topics.includes('Skincare routine for winter'),
    'live terms seed the general niche',
  )
  assert.ok(
    merged.niches.skincare.topics.includes('Skincare routine for winter'),
    'a niche-matching term also lands in that niche',
  )
  ok('live terms merge into the batch as topics')

  // A failing source must not fail the harvest — mock baseline survives.
  const boom = async () => {
    throw new Error('network down')
  }
  const safe = await harvestBatch({ now: DAY1, live: true, fetch: boom })
  assert.equal(safe.source, 'mock', 'live failure falls back to mock')
  assert.match(safe.live.error, /network down/, 'the failure reason is recorded')
  ok('a live-source failure degrades gracefully to mock')
}

rmSync(TMP_STORE, { force: true })
console.log(`\nAll ${passed} trend-engine checks passed.`)
