/*
 * The posts.json contract — Echo's canonical intake representation
 * (feature-optimisation §7). EVERY ingestion path (smart paste today; X OAuth
 * pull, IG/LinkedIn export upload, third-party later) converges on THIS shape
 * before the voice.md generator (/api/voice) ever sees it — so the distiller
 * only reads clean, structured posts, never raw platform cruft.
 *
 * Pure, dependency-free, and isomorphic on purpose: the browser imports it for
 * the client-side pass-through adapter, and the serverless functions
 * (/api/voice, /api/normalise) import the very same validator/coercer. One
 * contract, one source of truth, no drift. Keep it free of DOM, Vite, and React
 * so both runtimes can load it.
 */

export const PLATFORMS = ['x', 'instagram', 'linkedin', 'other']
export const POST_TYPES = ['original', 'reply', 'reshare', 'thread_part']
export const SOURCES = ['oauth', 'export_upload', 'paste', 'third_party']

const DEFAULT_PLATFORM = 'other'
const DEFAULT_SOURCE = 'paste'
const DEFAULT_TYPE = 'original'

// The schema, inlined into the normaliser's system prompt (§6: "Provide the
// schema inline; instruct no markdown, no preamble"). Kept beside the validator
// so the prompt and the runtime check can never drift apart.
export const SCHEMA_PROMPT = `{
  "posts": [
    {
      "id": string | null,          // platform id ONLY if present in the source, else null
      "text": string,                // the authored body ONLY — strip every bit of UI chrome
      "created_at": string | null,   // ISO-8601 ONLY if a real date is in the source; else null — never invent
      "type": "original" | "reply" | "reshare" | "thread_part",
      "media": string[],             // caption/alt text only, if any; else []
      "lang": string | null          // BCP-47 if obvious, else null
    }
  ]
}`

const str = (x) => (typeof x === 'string' ? x.trim() : '')
const oneOf = (x, allowed, fallback) => (allowed.includes(x) ? x : fallback)

// Coerce one raw post-ish object into a schema-valid post — or null if it
// carries no authored text. We never keep an empty post.
function coercePost(raw) {
  if (!raw || typeof raw !== 'object') return null
  const text = str(raw.text)
  if (!text) return null
  return {
    id: str(raw.id) || null,
    text,
    created_at: str(raw.created_at) || null,
    type: oneOf(raw.type, POST_TYPES, DEFAULT_TYPE),
    media: Array.isArray(raw.media) ? raw.media.map(str).filter(Boolean) : [],
    lang: str(raw.lang) || null,
  }
}

// A stable de-dupe key: collapse whitespace + lowercase so the normaliser
// emitting the same post twice across chunk boundaries can't double-count it.
const dedupeKey = (text) => text.replace(/\s+/g, ' ').toLowerCase()

/*
 * Validate + coerce anything claiming to be a posts.json into the canonical
 * shape. Never throws — junk in degrades to "no usable posts" (ok:false), the
 * caller decides what to do (retry, fall back to the deterministic splitter).
 * `meta` supplies envelope defaults (platform/source/handle) when the input
 * object omits them — e.g. the adapter knows the platform the model didn't.
 */
export function validatePostsJson(input, meta = {}) {
  const errors = []
  const obj = input && typeof input === 'object' ? input : {}
  if (!Array.isArray(obj.posts)) errors.push('`posts` must be an array')

  const rawPosts = Array.isArray(obj.posts) ? obj.posts : []
  const seen = new Set()
  const posts = []
  for (const p of rawPosts) {
    const post = coercePost(p)
    if (!post) continue
    const key = dedupeKey(post.text)
    if (seen.has(key)) continue
    seen.add(key)
    posts.push(post)
  }

  const value = {
    platform: oneOf(obj.platform ?? meta.platform, PLATFORMS, DEFAULT_PLATFORM),
    handle: str(obj.handle ?? meta.handle) || null,
    fetched_at: str(obj.fetched_at) || str(meta.fetched_at) || new Date().toISOString(),
    source: oneOf(obj.source ?? meta.source, SOURCES, DEFAULT_SOURCE),
    posts,
  }
  return { ok: posts.length > 0, value, errors }
}

/*
 * Flatten clean posts back into the plain-text blob the voice distiller's
 * prompt consumes. This is the seam that lets /api/voice keep its existing
 * prompt while being fed structured data: posts.json → text → distiller.
 * Capped to mirror the distiller's own input budget.
 */
export function postsToText(postsJson, { max = 6000 } = {}) {
  const posts = Array.isArray(postsJson?.posts) ? postsJson.posts : []
  const text = posts
    .map((p) => {
      const media = p.media?.length ? `\n[media: ${p.media.join(' | ')}]` : ''
      return `${p.text}${media}`
    })
    .filter(Boolean)
    .join('\n\n')
  return max ? text.slice(0, max) : text
}

/*
 * The deterministic adapter: split raw pasted text into posts on blank lines.
 * Serves two roles — the Phase-0 trivial pass-through (paste → posts.json with
 * no model) and the Phase-1 never-fail fallback when the OpenRouter normaliser
 * is unavailable. Mirrors the on-device engine's splitPosts() so behaviour is
 * consistent across the app.
 */
export function passThroughPosts(rawText, meta = {}) {
  const raw = String(rawText ?? '')
  const blocks = raw
    .split(/\n\s*\n/)
    .map((s) => s.trim())
    .filter(Boolean)
  // No blank-line breaks → treat the whole paste as a single post rather than
  // returning nothing.
  const chunks = blocks.length ? blocks : [raw.trim()].filter(Boolean)
  const { value } = validatePostsJson(
    { posts: chunks.map((text) => ({ text, type: DEFAULT_TYPE })) },
    { source: DEFAULT_SOURCE, ...meta },
  )
  return value
}
