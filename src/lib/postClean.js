/*
 * Post cleaning + sampling for imported social posts. Introduced in Phase 1 so
 * the mock connector produces realistic voice samples; reused unchanged by the
 * real fetch in Phase 3. Pure functions, no React — node-testable.
 *
 * Turns raw captions/tweets into a few representative voice samples: strip URLs,
 * drop low-signal posts (link-only, pure retweets, @replies, one-word quips),
 * collapse whitespace, dedupe, cap the count and each length. Emoji and hashtags
 * are PRESERVED — they're part of how the creator sounds.
 */

const URL_RE = /https?:\/\/\S+/g
const RETWEET_RE = /^RT\s+@/i
const REPLY_RE = /^@\w/
const MAX_SAMPLES = 4 // §6: 0–4 samples feed synthesis
const MAX_LEN = 600 // clamp a runaway caption
const MIN_LEN = 12 // shorter than this carries no real voice

export function cleanPost(raw) {
  if (typeof raw !== 'string') return ''
  let t = raw.replace(URL_RE, '').replace(/\s+/g, ' ').trim()
  if (t.length > MAX_LEN) t = `${t.slice(0, MAX_LEN).trimEnd()}…`
  return t
}

// Posts we never want to learn voice from.
function isLowSignal(raw) {
  const t = String(raw ?? '').trim()
  if (!t) return true
  if (RETWEET_RE.test(t)) return true // pure retweet
  if (REPLY_RE.test(t)) return true // reply to someone
  // Link-only: nothing meaningful once URLs / handles / tags are removed.
  const bare = t
    .replace(URL_RE, '')
    .replace(/[#@]\w+/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  return bare.length === 0
}

/*
 * Clean a batch of raw posts into ≤ max representative samples, in original
 * order, deduped. Low-signal and too-short posts are dropped.
 */
export function cleanPosts(rawPosts, { max = MAX_SAMPLES } = {}) {
  if (!Array.isArray(rawPosts)) return []
  const seen = new Set()
  const out = []
  for (const raw of rawPosts) {
    if (isLowSignal(raw)) continue
    const p = cleanPost(raw)
    if (p.length < MIN_LEN) continue
    const key = p.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(p)
    if (out.length >= max) break
  }
  return out
}
