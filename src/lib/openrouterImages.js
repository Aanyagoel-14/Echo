/*
 * OpenRouter image generation — model routing + the generate call.
 *
 * "Route to the best image model OpenRouter offers on my key": image-output
 * support varies by account, so we DISCOVER it at runtime (GET /api/v1/models)
 * and keep only models whose `architecture.output_modalities` includes "image".
 * From those actually-available models we pick the best by a curated best-first
 * preference list, falling back to any image-capable model the key exposes. An
 * env override (OPENROUTER_IMAGE_MODEL) always wins, and the result is cached on
 * the (warm) function instance so a 5-slide carousel doesn't list models 5×.
 *
 * Pure & server-shaped per the shared-lib convention: no process.env, no DOM —
 * the key/override are passed in, so api/*.js owns the secret. Imported by the
 * functions with the `.js` extension (Node ESM). Uses global fetch (Node 18+).
 */

// Best-first. Google's image models (a.k.a. "Nano Banana") are the strongest,
// cheapest, fastest image-output models routable through OpenRouter's chat API
// today, and they accept an input image for on-brand conditioning. Intersected
// with what the key can actually see — never assumed present.
export const IMAGE_MODEL_PREFERENCE = [
  'google/gemini-2.5-flash-image',
  'google/gemini-2.5-flash-image-preview',
  'google/gemini-2.0-flash-exp',
]

const MODELS_URL = 'https://openrouter.ai/api/v1/models'
const COMPLETIONS_URL = 'https://openrouter.ai/api/v1/chat/completions'
const REFERER = 'https://echo-one-gamma.vercel.app'

// Warm-instance cache of the resolved model id (discovery is the same for every
// slide in a request, and stable across requests). TTL keeps it eventually fresh
// if the account gains/loses image models.
const CACHE_TTL_MS = 10 * 60 * 1000
let cache = { model: null, at: 0 }

function isImageCapable(m) {
  const out = m?.architecture?.output_modalities
  return Array.isArray(out) && out.includes('image')
}

/*
 * Resolve the best image-generation model available on this key.
 *   override → cache → discover best-first → any image-capable → preference top.
 * Never throws — discovery failure degrades to the top preference so the call
 * still gets a chance (and surfaces a real error if even that isn't available).
 */
export async function resolveImageModel({ key, override, fetchImpl = fetch } = {}) {
  if (override) return override
  if (cache.model && Date.now() - cache.at < CACHE_TTL_MS) return cache.model

  try {
    const r = await fetchImpl(MODELS_URL, {
      headers: { Authorization: `Bearer ${key}` },
    })
    const data = await r.json()
    const models = Array.isArray(data?.data) ? data.data : []
    const available = new Set(models.filter(isImageCapable).map((m) => m.id))

    // Best the key can actually see, then any image model (prefer a Gemini
    // image model), then give up to the top preference as a last attempt.
    const ids = [...available]
    const chosen =
      IMAGE_MODEL_PREFERENCE.find((id) => available.has(id)) ||
      ids.find((id) => /image/i.test(id) && /gemini/i.test(id)) ||
      ids.find((id) => /image/i.test(id)) ||
      ids[0] ||
      null

    if (chosen) cache = { model: chosen, at: Date.now() }
    return chosen || IMAGE_MODEL_PREFERENCE[0]
  } catch {
    return IMAGE_MODEL_PREFERENCE[0]
  }
}

// Image-output models return the picture under message.images (OpenRouter's
// documented shape); a few inline a data URL in content. Try both.
function extractImageUrl(data) {
  const msg = data?.choices?.[0]?.message
  const imgs = msg?.images
  if (Array.isArray(imgs)) {
    for (const im of imgs) {
      const url = im?.image_url?.url ?? im?.url
      if (typeof url === 'string' && url.startsWith('data:image')) return url
    }
  }
  if (typeof msg?.content === 'string') {
    const m = msg.content.match(/data:image\/[a-zA-Z+]+;base64,[A-Za-z0-9+/=]+/)
    if (m) return m[0]
  }
  return null
}

/*
 * One image-generation call. `image` (a data URL) is optional conditioning so
 * generated slides stay on-brand with the product photo. Returns a data URL or
 * throws (the caller treats any failure as "no image for this slide").
 */
export async function generateImage({ key, model, prompt, image, fetchImpl = fetch } = {}) {
  const content = [{ type: 'text', text: prompt }]
  if (image) content.push({ type: 'image_url', image_url: { url: image } })

  const r = await fetchImpl(COMPLETIONS_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': REFERER,
      'X-Title': 'Echo carousel image',
    },
    body: JSON.stringify({
      model,
      // Ask for an image back (image-output models require this to emit pixels).
      modalities: ['image', 'text'],
      messages: [{ role: 'user', content }],
    }),
  })

  const data = await r.json()
  if (!r.ok) {
    throw new Error(data?.error?.message || data?.error || `OpenRouter ${r.status}`)
  }
  const url = extractImageUrl(data)
  if (!url) throw new Error('Model returned no image')
  return url
}
