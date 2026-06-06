/*
 * POST /api/carousel-image — generate ONE on-brand image for one carousel slide.
 *
 * Called once per slide (in parallel) by the client after the text kit returns,
 * so each response carries a single image and stays well under Vercel's 4.5 MB
 * payload limit — generating all five inside /api/generate would blow past it.
 * The key stays server-side only (§2: "No API keys in client code, ever").
 *
 * Best image model is resolved by openrouterImages.resolveImageModel — the
 * client may pass the `model` /api/generate already chose for this kit (so we
 * don't re-list models per slide); absent that, we resolve it here. Image
 * generation is strictly best-effort: any failure returns an error the client
 * swallows, and the slide simply renders text-only.
 */

import { resolveImageModel, generateImage } from '../src/lib/openrouterImages.js'

const asString = (x) => (typeof x === 'string' ? x.trim() : '')

// Imagery only — image models garble text, and the slide's words are rendered
// by the UI on top. Ask for calm negative space so the overlaid copy stays
// legible, and a cohesive look so the five slides read as one set.
function buildImagePrompt({ title, body, brief }) {
  const topic = brief ? `\nOverall topic / product: ${brief}.` : ''
  const idea = [title, body].filter(Boolean).join(' — ')
  return `Create a single striking visual for one slide of an Instagram carousel (vertical 4:5).${topic}
This slide's idea: ${idea}
Art direction: modern, clean, high-contrast, social-ready, cohesive brand look, with calm negative space for text overlay.
Strictly imagery only — absolutely NO text, letters, numbers, logos, or watermarks in the image.`
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  const { title, body, brief, image, model: requested } = req.body ?? {}
  const t = asString(title)
  const b = asString(body)
  if (!t && !b) {
    res.status(400).json({ error: 'Need slide text to illustrate.' })
    return
  }

  const key = process.env.OPENROUTER_API_KEY
  if (!key) {
    // Mirrors the other endpoints — the client falls back to a text-only slide.
    res.status(503).json({ error: 'no_key' })
    return
  }

  try {
    const model =
      asString(requested) ||
      (await resolveImageModel({ key, override: process.env.OPENROUTER_IMAGE_MODEL }))
    if (!model) {
      res.status(502).json({ error: 'No image model available on this key.' })
      return
    }

    const prompt = buildImagePrompt({ title: t, body: b, brief: asString(brief) })
    const started = Date.now()
    const url = await generateImage({
      key,
      model,
      prompt,
      image: typeof image === 'string' && image.startsWith('data:image') ? image : null,
    })

    res.status(200).json({ image: url, model, elapsedMs: Date.now() - started })
  } catch (e) {
    console.error('[carousel-image] failed', String(e?.message || e))
    res.status(502).json({ error: String(e?.message || e) })
  }
}
