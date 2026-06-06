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
 * voiceProfile } and gets back the §6 content kit, voice-injected and built by
 * the cloud model server-side. `voiceProfile` is the creator's distilled
 * voice.md (so the kit sounds like them); `formats` is which of reel/carousel/
 * thread to produce; `image`/`inspiration` carry compact base64 the vision model
 * reads. The returned kit only contains the formats that were requested.
 */
export async function generateKit({
  input,
  formats,
  image,
  inspiration,
  voiceProfile,
} = {}) {
  const res = await fetch('/api/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ input, formats, image, inspiration, voiceProfile }),
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
