/*
 * Rate limiter for the two PAID model routes — api/audit.js and
 * api/generate.js. Echo is intentionally public + no-auth (the deploy brief),
 * and both routes now bill a real Google account per request, so without a
 * throttle a single visitor (or a script) can run up the bill. We can't gate on
 * identity, so we throttle two ways:
 *   - per IP, per route — stops one visitor from hammering an endpoint;
 *   - a shared global ceiling — a per-instance circuit breaker that caps total
 *     spend during a traffic spike / distributed abuse, across both routes.
 * §2 ("No API keys in client code, ever") keeps the key server-side; this keeps
 * the server-side cost bounded.
 *
 * SERVER-ONLY — reads process.env and keeps counters in module memory, so it
 * must only be imported by api/* (never client code). On Vercel Fluid Compute
 * instances are reused across requests, so a warm instance enforces these limits
 * across the bursts that matter (a scripted abuser keeps hitting the same warm
 * instance). It is NOT a globally-consistent counter across all concurrent
 * instances — fixed-window, best-effort, fail-open.
 *
 * SEAM → durable: for a hard, fleet-wide cap, back hitWindow() with a shared
 * store (a Marketplace Upstash Redis: INCR + EXPIRE, or @upstash/ratelimit).
 * The (key, max, windowMs) → decision contract is the seam — callers (api/*)
 * don't change when the backing store does. Same file→DB seam idea as
 * trendStore.js. Tune via the env knobs below; set ECHO_RATELIMIT_DISABLED=1 to
 * turn it off entirely.
 */

const WINDOW_MS = 60_000 // a "per minute" fixed window — intuitive to reason about and tune.

// Stop the per-IP map from growing without bound on a long-lived instance: once
// past this many tracked keys we sweep expired entries, and if it's STILL over
// we clear the map (fail-open — abuse protection must never leak memory).
const MAX_TRACKED_KEYS = 50_000

// Per-IP-per-route buckets and the single shared global bucket. Module-level, so
// they persist for the life of a warm instance.
const ipStore = new Map()
const globalStore = new Map()

function intEnv(name, fallback) {
  const n = Number.parseInt(process.env[name] ?? '', 10)
  return Number.isFinite(n) && n > 0 ? n : fallback
}

// Tunables (per instance). Defaults are generous for a real session — a creator
// runs one audit then iterates a few generations — but tight enough to stop a
// script doing hundreds a minute.
function perRouteMax() {
  return intEnv('ECHO_RATELIMIT_PER_MIN', 10) // per IP, per route, per minute
}
function globalMax() {
  return intEnv('ECHO_RATELIMIT_GLOBAL_PER_MIN', 120) // admitted requests across both routes, per minute
}
function isDisabled() {
  const v = process.env.ECHO_RATELIMIT_DISABLED
  return v === '1' || v === 'true'
}

/*
 * Pure fixed-window counter over an injected store + clock — the testable core.
 * Records one hit against `key` and reports whether it's within `max` for the
 * current window. A blocked hit still "counts" (a hammering caller stays
 * blocked), which is the behaviour we want for abuse. Returns the shape the
 * caller turns into headers: { allowed, remaining, resetAt, limit }.
 */
export function hitWindow(store, key, { now, windowMs, max }) {
  const entry = store.get(key)
  if (!entry || now >= entry.resetAt) {
    const resetAt = now + windowMs
    store.set(key, { count: 1, resetAt })
    return { allowed: true, remaining: max - 1, resetAt, limit: max }
  }
  if (entry.count >= max) {
    return { allowed: false, remaining: 0, resetAt: entry.resetAt, limit: max }
  }
  entry.count += 1
  return { allowed: true, remaining: max - entry.count, resetAt: entry.resetAt, limit: max }
}

// Drop expired entries; if the map is still oversized, clear it outright rather
// than leak memory (fail-open — worst case a few callers get a fresh window).
function sweep(store, now) {
  for (const [k, v] of store) {
    if (now >= v.resetAt) store.delete(k)
  }
  if (store.size > MAX_TRACKED_KEYS) store.clear()
}

/*
 * Best-effort client IP. Behind Vercel's proxy the real client is the FIRST
 * entry of x-forwarded-for; x-real-ip and the socket address are fallbacks. A
 * missing IP collapses to a single 'unknown' bucket — which just means those
 * requests share one budget, never that they bypass the limit.
 */
export function clientIp(req) {
  const xff = req?.headers?.['x-forwarded-for']
  if (typeof xff === 'string' && xff.length) return xff.split(',')[0].trim()
  const real = req?.headers?.['x-real-ip']
  if (typeof real === 'string' && real.length) return real.trim()
  return req?.socket?.remoteAddress || 'unknown'
}

// Standard-ish draft RateLimit-* headers, so a client can self-pace.
function setRateHeaders(res, d, now) {
  res.setHeader('RateLimit-Limit', String(d.limit))
  res.setHeader('RateLimit-Remaining', String(Math.max(0, d.remaining)))
  res.setHeader('RateLimit-Reset', String(Math.max(0, Math.ceil((d.resetAt - now) / 1000))))
}

function reject(res, decision, now, scope) {
  const retryAfter = Math.max(1, Math.ceil((decision.resetAt - now) / 1000))
  setRateHeaders(res, decision, now)
  res.setHeader('Retry-After', String(retryAfter))
  res.status(429).json({
    error: 'rate_limited',
    scope, // 'ip' (you're going too fast) | 'global' (the instance is saturated)
    message:
      scope === 'global'
        ? 'Echo is handling a lot of requests right now — try again in a moment.'
        : "You're going a bit fast — give it a minute and try again.",
    retryAfter,
  })
  return true
}

/*
 * Gate one request. Returns true if it was rate-limited (the response is fully
 * written — the handler must `return` immediately); false if it may proceed
 * (informational RateLimit-* headers are set either way).
 *
 * Order matters: the per-IP check runs FIRST and a blocked IP never touches the
 * global counter, so one abuser can't burn the shared budget and starve
 * everyone — only admitted requests count toward the global ceiling.
 */
export function enforceRateLimit(req, res, { route, now = Date.now() } = {}) {
  if (isDisabled()) return false

  if (ipStore.size > MAX_TRACKED_KEYS) sweep(ipStore, now)

  const ip = clientIp(req)
  const perIp = hitWindow(ipStore, `${route}:${ip}`, { now, windowMs: WINDOW_MS, max: perRouteMax() })
  if (!perIp.allowed) return reject(res, perIp, now, 'ip')

  const global = hitWindow(globalStore, '__global__', { now, windowMs: WINDOW_MS, max: globalMax() })
  if (!global.allowed) return reject(res, global, now, 'global')

  // Admitted — surface the per-IP budget so a well-behaved client can pace.
  setRateHeaders(res, perIp, now)
  return false
}

// Test-only: clear module counters between cases so tests are deterministic.
export function _resetStores() {
  ipStore.clear()
  globalStore.clear()
}
