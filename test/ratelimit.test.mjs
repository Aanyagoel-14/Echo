/*
 * Rate limiter — standalone checks for the throttle on the two PAID model
 * routes (api/audit, api/generate). See src/lib/rateLimit.js.
 *
 * Pure node, no test runner (matches the repo's "node-testable lib" style).
 * Run: `node test/ratelimit.test.mjs`  (or `npm run test:ratelimit`).
 *
 * Covers: the fixed-window counter + its boundary reset, client-IP extraction
 * behind a proxy, the per-IP 429 (with Retry-After / RateLimit-* headers), IP
 * isolation, the shared global circuit breaker, and the disable switch. The
 * clock is injected (`now`) so nothing actually sleeps.
 */

import assert from 'node:assert/strict'

import {
  hitWindow,
  clientIp,
  enforceRateLimit,
  _resetStores,
} from '../src/lib/rateLimit.js'

let passed = 0
const ok = (label) => {
  passed++
  console.log(`  ✓ ${label}`)
}

// A minimal stand-in for the Vercel/Node res — records what the handler wrote.
function mockRes() {
  return {
    statusCode: 200,
    headers: {},
    body: null,
    setHeader(k, v) {
      this.headers[k.toLowerCase()] = v
    },
    status(code) {
      this.statusCode = code
      return this
    },
    json(body) {
      this.body = body
      return this
    },
  }
}
const reqFrom = (ip) => ({ headers: ip ? { 'x-forwarded-for': ip } : {}, socket: {} })

// Restore the env knobs after each block so cases don't bleed into each other.
const ENV_KEYS = ['ECHO_RATELIMIT_PER_MIN', 'ECHO_RATELIMIT_GLOBAL_PER_MIN', 'ECHO_RATELIMIT_DISABLED']
function withEnv(overrides, fn) {
  const saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]))
  for (const k of ENV_KEYS) delete process.env[k]
  Object.assign(process.env, overrides)
  try {
    fn()
  } finally {
    for (const k of ENV_KEYS) {
      if (saved[k] === undefined) delete process.env[k]
      else process.env[k] = saved[k]
    }
  }
}

const NOW = 1_000_000 // arbitrary fixed clock
const WINDOW = 60_000

// ── Test 1: the fixed-window counter and its boundary reset ────────────────
{
  console.log('Test 1 — hitWindow counts within a window and resets at the boundary')
  const store = new Map()
  const opts = { now: NOW, windowMs: WINDOW, max: 2 }

  const first = hitWindow(store, 'k', opts)
  assert.equal(first.allowed, true)
  assert.equal(first.remaining, 1, 'first hit leaves max-1 remaining')
  assert.equal(first.limit, 2)

  const second = hitWindow(store, 'k', opts)
  assert.equal(second.allowed, true)
  assert.equal(second.remaining, 0, 'second hit exhausts the budget')

  const third = hitWindow(store, 'k', opts)
  assert.equal(third.allowed, false, 'third hit in the window is blocked')
  assert.equal(third.remaining, 0)
  assert.equal(third.resetAt, NOW + WINDOW, 'reports when the window resets')

  // A different key has its own independent budget.
  assert.equal(hitWindow(store, 'other', opts).allowed, true, 'a different key is independent')

  // Once the window elapses, the same key is allowed again.
  const next = hitWindow(store, 'k', { ...opts, now: NOW + WINDOW })
  assert.equal(next.allowed, true, 'the key is allowed again in the next window')
  assert.equal(next.remaining, 1)
  ok('fixed-window allow/block/reset math is correct')
}

// ── Test 2: client IP extraction behind the proxy ──────────────────────────
{
  console.log('Test 2 — clientIp prefers x-forwarded-for, then x-real-ip, then socket')
  assert.equal(clientIp(reqFrom('1.2.3.4')), '1.2.3.4', 'single forwarded IP')
  assert.equal(
    clientIp(reqFrom('9.9.9.9, 10.0.0.1, 172.16.0.1')),
    '9.9.9.9',
    'the client is the FIRST x-forwarded-for entry',
  )
  assert.equal(
    clientIp({ headers: { 'x-real-ip': '5.6.7.8' }, socket: {} }),
    '5.6.7.8',
    'falls back to x-real-ip',
  )
  assert.equal(
    clientIp({ headers: {}, socket: { remoteAddress: '127.0.0.1' } }),
    '127.0.0.1',
    'falls back to the socket address',
  )
  assert.equal(clientIp({ headers: {}, socket: {} }), 'unknown', 'collapses to one bucket when unknown')
  ok('clientIp resolves the real caller in each case')
}

// ── Test 3: per-IP throttle returns a well-formed 429 ──────────────────────
withEnv({ ECHO_RATELIMIT_PER_MIN: '2', ECHO_RATELIMIT_GLOBAL_PER_MIN: '1000' }, () => {
  console.log('Test 3 — per-IP limit: two pass, the third is a 429 with Retry-After')
  _resetStores()
  const r1 = enforceRateLimit(reqFrom('2.2.2.2'), mockRes(), { route: 'audit', now: NOW })
  const r2 = enforceRateLimit(reqFrom('2.2.2.2'), mockRes(), { route: 'audit', now: NOW })
  assert.equal(r1, false, 'first request admitted')
  assert.equal(r2, false, 'second request admitted')

  const res = mockRes()
  const blocked = enforceRateLimit(reqFrom('2.2.2.2'), res, { route: 'audit', now: NOW })
  assert.equal(blocked, true, 'third request is rate-limited (handler must return)')
  assert.equal(res.statusCode, 429)
  assert.equal(res.body.error, 'rate_limited')
  assert.equal(res.body.scope, 'ip')
  assert.ok(res.body.retryAfter >= 1, 'tells the client how long to wait')
  assert.ok(res.headers['retry-after'], 'sets a Retry-After header')
  assert.equal(res.headers['ratelimit-limit'], '2', 'advertises the limit')
  assert.equal(res.headers['ratelimit-remaining'], '0')

  // A different IP is unaffected by 2.2.2.2 exhausting its budget.
  const other = enforceRateLimit(reqFrom('3.3.3.3'), mockRes(), { route: 'audit', now: NOW })
  assert.equal(other, false, 'a different IP has its own budget')

  // The same route on a different IP, and the same IP after the window, recover.
  const recovered = enforceRateLimit(reqFrom('2.2.2.2'), mockRes(), { route: 'audit', now: NOW + WINDOW })
  assert.equal(recovered, false, 'the blocked IP is admitted again next window')
  ok('per-IP limit blocks the over-limit caller only, and recovers on schedule')
})

// ── Test 4: routes are independent, but share the global ceiling ───────────
withEnv({ ECHO_RATELIMIT_PER_MIN: '1', ECHO_RATELIMIT_GLOBAL_PER_MIN: '1000' }, () => {
  console.log('Test 4 — the same IP gets a separate budget per route')
  _resetStores()
  // One request each on two routes from the same IP: both pass even at PER_MIN=1,
  // because the buckets are keyed by route.
  const a = enforceRateLimit(reqFrom('4.4.4.4'), mockRes(), { route: 'audit', now: NOW })
  const g = enforceRateLimit(reqFrom('4.4.4.4'), mockRes(), { route: 'generate', now: NOW })
  assert.equal(a, false, 'audit admitted')
  assert.equal(g, false, 'generate admitted on the same IP (separate route bucket)')
  // A second audit from that IP is now over its per-route budget.
  const a2 = enforceRateLimit(reqFrom('4.4.4.4'), mockRes(), { route: 'audit', now: NOW })
  assert.equal(a2, true, 'second audit on the same IP is limited')
  ok('per-IP budgets are tracked separately per route')
})

// ── Test 5: the shared global circuit breaker ──────────────────────────────
withEnv({ ECHO_RATELIMIT_PER_MIN: '1000', ECHO_RATELIMIT_GLOBAL_PER_MIN: '3' }, () => {
  console.log('Test 5 — global ceiling caps total admitted requests across IPs')
  _resetStores()
  // Distinct IPs so the per-IP limit never fires — only the global one can.
  for (const ip of ['10.0.0.1', '10.0.0.2', '10.0.0.3']) {
    const blocked = enforceRateLimit(reqFrom(ip), mockRes(), { route: 'generate', now: NOW })
    assert.equal(blocked, false, `${ip} admitted under the global ceiling`)
  }
  const res = mockRes()
  const blocked = enforceRateLimit(reqFrom('10.0.0.4'), res, { route: 'generate', now: NOW })
  assert.equal(blocked, true, 'the 4th distinct caller trips the global breaker')
  assert.equal(res.statusCode, 429)
  assert.equal(res.body.scope, 'global', 'the 429 is attributed to the global ceiling')
  ok('the global breaker caps spend during a spike even across many IPs')
})

// ── Test 6: the kill switch ────────────────────────────────────────────────
withEnv({ ECHO_RATELIMIT_PER_MIN: '1', ECHO_RATELIMIT_DISABLED: '1' }, () => {
  console.log('Test 6 — ECHO_RATELIMIT_DISABLED bypasses the limiter entirely')
  _resetStores()
  for (let i = 0; i < 5; i++) {
    const blocked = enforceRateLimit(reqFrom('8.8.8.8'), mockRes(), { route: 'audit', now: NOW })
    assert.equal(blocked, false, 'every request passes while disabled')
  }
  ok('the disable switch turns throttling off')
}) //

console.log(`\nAll ${passed} rate-limit checks passed.`)
