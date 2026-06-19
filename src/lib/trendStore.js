/*
 * Feature 1 — Trend Harvesting Engine (store).
 *
 * The cache the engine reads at query time so the app pays no per-request fees:
 * the harvest (cron) WRITES a batch here; /api/trends READS it. This is the
 * "store all scraped trends in a database … query your own database, not the
 * source sites" piece of the spec.
 *
 * SERVER-ONLY — touches node:fs/os (and, when configured, Vercel Blob), so it
 * must never be imported by client code (only api/* and node tests import it).
 *
 * Two backing stores, picked at runtime:
 *   - Vercel Blob (DURABLE) — used whenever BLOB_READ_WRITE_TOKEN is present
 *     (auto-injected when a Blob store is linked to the project). A single
 *     fixed-name JSON object, overwritten each harvest and shared across every
 *     serverless instance, so "harvest on one instance → query on another"
 *     works in production. This is the fix for the previously-ephemeral cache.
 *   - Local JSON file (FALLBACK) — used in dev (`vite dev`), in CI/tests, and on
 *     a deploy with no Blob linked. Persists across requests locally; on Vercel
 *     it lives in /tmp (per-instance, ephemeral) — fine as a same-instance warm
 *     cache, not durable on its own.
 *
 * The async readBatchAsync/writeBatchAsync are the durable path (Blob → file);
 * the sync readBatch/writeBatch are the file-only path (used by tests and as the
 * Blob fallback). Either way a missing cache is an expected cold-start state —
 * callers fall back to a freshly generated mock batch. Set ECHO_TRENDS_PATH to
 * relocate the file.
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'

import { TREND_BATCH_VERSION } from './trends.js'

const DEFAULT_PATH = join(tmpdir(), 'echo-trends.json')
// The Blob object name. Fixed (no random suffix) so each harvest overwrites the
// same key and the query path can find it without anywhere to stash a URL.
const BLOB_KEY = 'echo-trends.json'

// Where the file batch lives. Overridable so deploys/tests can point elsewhere.
export function storePath() {
  return process.env.ECHO_TRENDS_PATH || DEFAULT_PATH
}

// Durable Blob store is active only when its token is present — Vercel injects
// BLOB_READ_WRITE_TOKEN once a Blob store is linked to the project.
function blobEnabled() {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN)
}

// Shape + version guard, shared by both stores: a stale schema or non-object is
// treated as "no cache" rather than served as malformed data.
function validBatch(batch) {
  if (!batch || typeof batch !== 'object') return false
  if (batch.version !== TREND_BATCH_VERSION) return false
  if (!batch.niches || typeof batch.niches !== 'object') return false
  return true
}

/*
 * Read the cached batch from the local file, or null if absent/unreadable/
 * incompatible. Never throws. This is the file-only path — tests use it directly
 * and readBatchAsync falls back to it when Blob is off or errors.
 */
export function readBatch() {
  try {
    const raw = readFileSync(storePath(), 'utf8')
    const batch = JSON.parse(raw)
    return validBatch(batch) ? batch : null
  } catch {
    return null
  }
}

/*
 * Persist a batch to the local file, replacing any previous one. Returns the
 * path written. Throws on a real IO failure so the caller can report it.
 */
export function writeBatch(batch) {
  const path = storePath()
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, JSON.stringify(batch), 'utf8')
  return path
}

/*
 * Durable read (query path): the shared Blob object first so every instance sees
 * the latest harvest, then the local file, then null (cold + empty → the caller
 * generates a fresh mock batch). A Blob outage degrades to the file, never an
 * error. The `?ts=` cache-buster + no-store defeat any CDN staleness so a query
 * right after a re-harvest sees the new batch (the spec's refresh test).
 */
export async function readBatchAsync() {
  if (blobEnabled()) {
    try {
      const { list } = await import('@vercel/blob')
      const { blobs } = await list({ prefix: BLOB_KEY, limit: 1 })
      const hit = blobs.find((b) => b.pathname === BLOB_KEY) || blobs[0]
      if (hit?.url) {
        const res = await fetch(`${hit.url}?ts=${Date.now()}`, { cache: 'no-store' })
        if (res.ok) {
          const batch = await res.json()
          if (validBatch(batch)) return batch
        }
      }
      return null
    } catch (err) {
      console.error('[trendStore] blob read failed; falling back to file', err)
    }
  }
  return readBatch()
}

/*
 * Durable write (harvest path): overwrite the shared Blob object so the new batch
 * replaces the old one for every instance. cacheControlMaxAge:0 keeps reads
 * fresh. On any Blob error, fall back to the local file so a harvest never fails
 * outright. With Blob off, this is just the file write. Returns the location.
 */
export async function writeBatchAsync(batch) {
  if (blobEnabled()) {
    try {
      const { put } = await import('@vercel/blob')
      const { url } = await put(BLOB_KEY, JSON.stringify(batch), {
        access: 'public',
        contentType: 'application/json',
        addRandomSuffix: false,
        allowOverwrite: true,
        cacheControlMaxAge: 0,
      })
      return url
    } catch (err) {
      console.error('[trendStore] blob write failed; falling back to file', err)
    }
  }
  return writeBatch(batch)
}
