import { samplesToArray } from './brandVoice'

// Defensive normalize of the optional inspiration payload to a stable shape:
// trimmed reference text + image descriptors (no bytes/urls), capped at a few.
function normalizeInspiration(inspiration) {
  if (!inspiration || typeof inspiration !== 'object') return { refs: '', visuals: [] }
  const refs = typeof inspiration.refs === 'string' ? inspiration.refs.trim() : ''
  const visuals = Array.isArray(inspiration.visuals)
    ? inspiration.visuals
        .slice(0, 6)
        .map((v) => ({ name: v?.name, type: v?.type, size: v?.size }))
    : []
  return { refs, visuals }
}

/*
 * Client → serverless endpoints. The single place that knows how to call Echo's
 * /api functions. Secrets live server-side only (§2) — these just POST JSON.
 */

/*
 * Smart-paste normaliser (feature-optimisation Phase 1). Sends RAW pasted text
 * to POST /api/normalise and gets back a clean posts.json — UI cruft stripped,
 * de-duped, structured. On ANY failure the caller falls back to the client-side
 * deterministic splitter (lib/posts.passThroughPosts), so intake never blocks.
 */
export async function normalisePosts({
  raw,
  platform,
  source = 'paste',
  includeReshares = false,
} = {}) {
  const res = await fetch('/api/normalise', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ raw, platform, source, include_reshares: includeReshares }),
  })

  if (!res.ok) {
    throw new Error(`normalise failed: ${res.status}`)
  }

  const data = await res.json()
  if (!Array.isArray(data?.posts)) {
    throw new Error('normalise: malformed posts.json')
  }
  return data // { platform, handle, fetched_at, source, posts, model, elapsedMs }
}

/*
 * Distill the creator's posts into a Voice Profile (CP12). Hits the cloud
 * engine (POST /api/voice). Prefers the structured posts.json contract
 * (`posts`); a raw `samples` blob still works (the server wraps it). On ANY
 * failure the caller falls back to the on-device engine
 * (lib/voiceProfile.buildLocalProfile) — so the builder always produces a
 * voice.md, key or no key.
 */
export async function distillVoiceProfile({ samples, posts, tone, platform } = {}) {
  const res = await fetch('/api/voice', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(
      posts ? { posts, tone, platform } : { samples, tone, platform },
    ),
  })

  if (!res.ok) {
    throw new Error(`voice distill failed: ${res.status}`)
  }

  const data = await res.json()
  if (!data?.profileMarkdown) {
    throw new Error('voice distill: malformed response')
  }
  return data // { profileMarkdown, traits, model, elapsedMs }
}

/*
 * Synthesis endpoint (§7). POSTs { input, formats, image, inspiration,
 * voiceProfile, audit } and gets back the §6 content kit, voice-injected and
 * built by the cloud model server-side. `voiceProfile` is the creator's
 * distilled voice.md (so the kit sounds like them); `formats` is which of reel/
 * carousel/thread to produce; `image`/`inspiration` carry compact base64 the
 * vision model reads; `audit` is the distilled Page 3 direction ({ pivot, niche,
 * hashtags }) so the new post continues the audit's strategy — optional, null
 * when generating without a prior audit. The returned kit only contains the
 * formats that were requested. When no model key is configured the endpoint
 * returns an input-aware mock of the same shape, so generation always works —
 * this client never changes either way.
 */
export async function generateKit({
  input,
  formats,
  image,
  inspiration,
  voiceProfile,
  audit,
} = {}) {
  const res = await fetch('/api/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ input, formats, image, inspiration, voiceProfile, audit }),
  })

  if (!res.ok) {
    throw new Error(`generate failed: ${res.status}`)
  }

  const kit = await res.json()
  // Guard the shape so a bad response surfaces as the error screen, not a crash.
  // A valid kit has at least one of the requested formats.
  if (!kit?.reel && !kit?.carousel && !kit?.thread) {
    throw new Error('generate: malformed kit')
  }
  return kit
}

/*
 * Generate one on-brand image for a single carousel slide (POST
 * /api/carousel-image). Best-effort and isolated per slide: an abort timeout
 * guards a slow image model, and the caller treats any rejection as "this slide
 * stays text-only". `model` is the image model /api/generate already chose for
 * this kit — passing it lets the endpoint skip re-discovering one per slide.
 */
export async function generateCarouselImage({ title, body, brief, image, model } = {}) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 40000)
  try {
    const res = await fetch('/api/carousel-image', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, body, brief, image, model }),
      signal: controller.signal,
    })
    if (!res.ok) throw new Error(`carousel-image failed: ${res.status}`)
    const data = await res.json()
    if (!data?.image) throw new Error('carousel-image: no image')
    return data // { image, model, elapsedMs }
  } finally {
    clearTimeout(timer)
  }
}

/*
 * Client → audit endpoint (Feature 3). The single place that calls POST
 * /api/audit. Sends the brand voice (samples normalized to the §6 string[]
 * shape, same as generate), the parsed historical posts (Feature 2 output), an
 * optional niche (the Page 2 Genre Selector pick / "Other" text), and any
 * inspiration. The server reads today's trends from its own cache and returns
 * the § Page-3 critique { markdown, sections, hashtags, meta }.
 *
 * Like generateKit, this request shape is the seam: when the real model is wired
 * in server-side, this client code never changes.
 */
export async function requestAudit({ brandVoice, posts, niche, inspiration } = {}) {
  const payload = {
    brandVoice: {
      tone: brandVoice?.tone ?? null,
      samples: samplesToArray(brandVoice?.samples),
      source: brandVoice?.source ?? null,
    },
    posts: Array.isArray(posts) ? posts.filter((p) => typeof p === 'string') : [],
    niche: niche ?? null,
    inspiration: normalizeInspiration(inspiration),
  }
  const res = await fetch('/api/audit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

  if (!res.ok) {
    throw new Error(`audit failed: ${res.status}`)
  }

  const audit = await res.json()
  // Guard the shape so a bad response surfaces cleanly rather than crashing.
  if (!audit?.markdown || !audit?.sections) {
    throw new Error('audit: malformed response')
  }
  return audit
}
