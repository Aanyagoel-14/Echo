/*
 * Feature 1 — Trend Harvesting Engine (store).
 *
 * The cache the engine reads at query time so the app pays no per-request fees:
 * the harvest (cron) WRITES a batch here; /api/trends READS it. This is the
 * "store all scraped trends in a database … query your own database, not the
 * source sites" piece of the spec.
 *
 * SERVER-ONLY — touches node:fs/os, so it must never be imported by client
 * code (only api/* and node tests import it). The implementation is a single
 * JSON file, which is deliberate for a mock-first MVP:
 *   - locally (`vite dev`) the file persists across requests, so the spec's
 *     "harvest → query → re-harvest → query" manual test works end to end;
 *   - on Vercel it lives in /tmp, which is per-instance and ephemeral. That's
 *     fine for the demo (the query path also falls back to a freshly generated
 *     mock batch on a cold instance), but it is NOT durable across instances.
 *
 * SEAM → production durability: swap readBatch/writeBatch for a shared store —
 * Vercel Blob (a daily JSON object), Edge Config (read-optimized), or a
 * Marketplace Postgres/Redis. The TrendBatch shape and these two function
 * signatures are the contract; callers (api/*) don't change when the backing
 * store does. Set ECHO_TRENDS_PATH to relocate the file in the meantime.
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'

import { TREND_BATCH_VERSION } from './trends.js'

const DEFAULT_PATH = join(tmpdir(), 'echo-trends.json')

// Where the batch lives. Overridable so deploys/tests can point elsewhere.
export function storePath() {
  return process.env.ECHO_TRENDS_PATH || DEFAULT_PATH
}

/*
 * Read the cached batch, or null if absent/unreadable/incompatible. Never
 * throws — a missing or corrupt cache is an expected cold-start state, and the
 * caller falls back to a freshly generated mock batch.
 */
export function readBatch() {
  try {
    const raw = readFileSync(storePath(), 'utf8')
    const batch = JSON.parse(raw)
    // Guard the shape + version so a stale schema is treated as "no cache"
    // rather than served as malformed data.
    if (!batch || typeof batch !== 'object') return null
    if (batch.version !== TREND_BATCH_VERSION) return null
    if (!batch.niches || typeof batch.niches !== 'object') return null
    return batch
  } catch {
    return null
  }
}

/*
 * Persist a batch, replacing any previous one (the spec's "old batch replaced"
 * refresh semantics — a new harvest overwrites the file). Returns the path
 * written. Throws on a real IO failure so the harvest endpoint can report it.
 */
export function writeBatch(batch) {
  const path = storePath()
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, JSON.stringify(batch), 'utf8')
  return path
}
