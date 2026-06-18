/*
 * POST /api/generate — Echo's synthesis endpoint (§7).
 *
 * Accepts { input, formats, image, inspiration, voiceProfile } and returns the
 * §6 content kit — REAL, voice-injected content from the cloud model. The model
 * call and the key stay server-side only (§2: "No API keys in client code,
 * ever").
 *
 * The spine: the creator's distilled voice.md (`voiceProfile.profileMarkdown`)
 * is injected as a system block — "write strictly in this voice" — then the
 * model reads the product photo (vision) + brief + optional style references and
 * writes only the requested formats. `inspiration` images are mirrored for
 * tone/pacing, never copied. This step is also the Tier-2 join point (§0.2/§11):
 * cloud retrieves *suggestions* here while the personal voice.md stays the sole
 * source of *voice*.
 */

import { resolveImageModel } from '../src/lib/openrouterImages.js'
import { chatCompletions, isModelConfigured } from '../src/lib/llm.js'

const ALL_FORMATS = ['reel', 'carousel', 'thread']

// Per-format JSON schema the model must return (only requested ones are asked
// for, and only these keys are accepted back).
const FORMAT_SCHEMA = {
  reel: `"reel": {
    "hook": "string — a scroll-stopping first line, in the creator's voice",
    "script": "string — the spoken/voiceover script for a 12–20s Reel",
    "shotList": ["exactly 5 strings, each 'M:SS description' of one shot"]
  }`,
  carousel: `"carousel": {
    "slides": [ { "title": "string", "body": "string" } ]  // exactly 5 slides, slide 1 is the hook, last is the CTA
  }`,
  thread: `"thread": {
    "tweets": ["5–6 strings, each one post; tweet 1 is the hook, last has the CTA"]
  }`,
}

// Fold the distilled Page 3 audit ({ pivot, niche, hashtags }) into a short
// creative-direction block, so the new post continues the audit's strategy and
// the two read as one story (§F4). Returns '' when there's no audit, so the
// prompt is byte-for-byte the pre-audit prompt in the audit-free path.
function buildAuditBlock(audit) {
  if (!audit) return ''
  const lines = []
  if (audit.pivot) lines.push(`- Strategic direction: ${audit.pivot}`)
  if (audit.niche) lines.push(`- Niche: ${audit.niche}`)
  if (audit.hashtags?.length) {
    lines.push(
      `- Trend-backed hashtags to weave in where the format allows (Instagram caption: 3–5; X/threads: none): ${audit.hashtags.join(' ')}`,
    )
  }
  if (!lines.length) return ''
  return `

This post continues an ongoing content strategy. Honor this creative direction from the creator's most recent content audit so the audit and this new post read as one continuous strategy — never name the audit or sound like a report:
${lines.join('\n')}`
}

function buildSystem(formats, voiceMd, audit) {
  const voiceBlock = voiceMd
    ? `The creator's voice profile (their voice.md) follows. Write STRICTLY in this voice — match its rhythm, signature words, emoji/punctuation habits, energy, and hook shapes. Never sound generic or corporate.

"""
${voiceMd.trim().slice(0, 4000)}
"""`
    : `Write in an authentic, specific, human creator voice — punchy and concrete, never generic or corporate.`

  const schema = formats.map((f) => FORMAT_SCHEMA[f]).join(',\n  ')

  return `You are Echo, a short-form content engine for one creator. You turn a product or topic into ready-to-post content that sounds EXACTLY like the creator.

${voiceBlock}${buildAuditBlock(audit)}

Rules:
- Ground every line in the provided product photo and/or brief. If a photo is given, work from what is actually in it (don't invent a different product).
- Style-reference images, if any, are for tone/pacing inspiration ONLY — mirror their vibe, never copy their words.
- Be concrete and specific. No placeholder text, no lorem, no "[insert here]".
- Return ONLY a JSON object — no prose, no markdown, no code fences — with EXACTLY these top-level keys: ${formats.join(', ')}.

Shape:
{
  ${schema}
}`
}

function buildUserContent({ input, image, inspiration, formats }) {
  const content = []
  const lines = [`Create the content kit. Formats to produce: ${formats.join(', ')}.`]
  if (input) lines.push(`Brief: ${input}`)
  lines.push(
    image?.dataUrl
      ? 'The product photo is attached — base the kit on it.'
      : 'No photo provided — work from the brief.',
  )
  content.push({ type: 'text', text: lines.join('\n') })

  if (image?.dataUrl) {
    content.push({ type: 'image_url', image_url: { url: image.dataUrl } })
  }

  const refs = Array.isArray(inspiration)
    ? inspiration.filter((i) => i?.dataUrl).slice(0, 4)
    : []
  if (refs.length) {
    content.push({
      type: 'text',
      text: `${refs.length} style-reference image(s) follow — mirror their tone/pacing only.`,
    })
    for (const ref of refs) {
      content.push({ type: 'image_url', image_url: { url: ref.dataUrl } })
    }
  }

  return content
}

// The model may wrap JSON in prose/fences despite instructions — extract it.
function parseModelJson(content) {
  if (typeof content !== 'string') return null
  try {
    return JSON.parse(content)
  } catch {
    const start = content.indexOf('{')
    const end = content.lastIndexOf('}')
    if (start === -1 || end <= start) return null
    try {
      return JSON.parse(content.slice(start, end + 1))
    } catch {
      return null
    }
  }
}

const asString = (x) => (typeof x === 'string' ? x.trim() : '')
const asStringArray = (x) =>
  Array.isArray(x) ? x.map(asString).filter(Boolean) : []

// Coerce + validate each format; return null if the model didn't give us
// something renderable, so we can drop it rather than ship a broken card.
function coerceReel(r) {
  if (!r || typeof r !== 'object') return null
  const hook = asString(r.hook)
  const script = asString(r.script)
  const shotList = asStringArray(r.shotList)
  if (!hook || !script || !shotList.length) return null
  return { hook, script, shotList }
}

function coerceCarousel(c) {
  if (!c || typeof c !== 'object') return null
  const slides = (Array.isArray(c.slides) ? c.slides : [])
    .map((s) => ({ title: asString(s?.title), body: asString(s?.body) }))
    .filter((s) => s.title || s.body)
  if (!slides.length) return null
  return { slides }
}

function coerceThread(t) {
  if (!t || typeof t !== 'object') return null
  const tweets = asStringArray(t.tweets)
  if (!tweets.length) return null
  return { tweets }
}

const COERCE = { reel: coerceReel, carousel: coerceCarousel, thread: coerceThread }

// Coerce the client-supplied audit direction to a trusted compact shape, or
// null. The client sends summarizeAuditForGeneration()'s output, but this is the
// trust boundary — re-validate types and cap the tag list defensively.
function normalizeAudit(a) {
  if (!a || typeof a !== 'object') return null
  const pivot = asString(a.pivot)
  const niche = asString(a.niche)
  const hashtags = asStringArray(a.hashtags).slice(0, 8)
  if (!pivot && !niche && !hashtags.length) return null
  return { pivot, niche, hashtags }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  const { input: rawInput, formats: rawFormats, image, inspiration, voiceProfile, audit: rawAudit } =
    req.body ?? {}
  const input = asString(rawInput)
  const audit = normalizeAudit(rawAudit)

  // Normalize requested formats; default to all three if unspecified.
  let formats = Array.isArray(rawFormats)
    ? ALL_FORMATS.filter((f) => rawFormats.includes(f))
    : []
  if (!formats.length) formats = [...ALL_FORMATS]

  // Need something to work from.
  if (!input && !image?.dataUrl) {
    res.status(400).json({ error: 'Add a brief or a photo to generate.' })
    return
  }

  if (!isModelConfigured()) {
    // Generation has no on-device fallback yet — make the missing config
    // explicit rather than silently shipping mock content.
    res.status(503).json({ error: 'no_key' })
    return
  }

  const voiceMd = asString(voiceProfile?.profileMarkdown)
  const model =
    process.env.ECHO_GENERATE_MODEL ||
    process.env.ECHO_MODEL ||
    'google/gemini-2.5-flash'
  const started = Date.now()

  console.log('[generate] request', {
    formats,
    hasInput: Boolean(input),
    hasImage: Boolean(image?.dataUrl),
    inspirationCount: Array.isArray(inspiration) ? inspiration.length : 0,
    voiceChars: voiceMd.length,
    voiceEngine: voiceProfile?.source?.engine ?? null,
    hasAudit: Boolean(audit),
  })

  try {
    const { ok, status, data, error } = await chatCompletions({
      model,
      max_tokens: 2000,
      temperature: 0.8,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: buildSystem(formats, voiceMd, audit) },
        {
          role: 'user',
          content: buildUserContent({ input, image, inspiration, formats }),
        },
      ],
    })

    const elapsedMs = Date.now() - started

    if (!ok) {
      console.error('[generate] vertex error', status, error)
      res.status(502).json({
        error: error || 'Vertex returned an error',
        elapsedMs,
      })
      return
    }

    const parsed = parseModelJson(data?.choices?.[0]?.message?.content)
    if (!parsed || typeof parsed !== 'object') {
      res.status(502).json({ error: 'Model output was not usable JSON.' })
      return
    }

    // Keep only the requested, renderable formats.
    const kit = {}
    for (const f of formats) {
      const value = COERCE[f](parsed[f])
      if (value) kit[f] = value
    }

    if (!Object.keys(kit).length) {
      res.status(502).json({ error: 'Model returned no usable content.' })
      return
    }

    // Carousel slide images still come from OpenRouter (a separate concern from
    // the Vertex text path). Pick the best image model that key exposes, once,
    // so the client can illustrate each slide (POST /api/carousel-image) without
    // re-discovering the model per slide. Best-effort — never blocks the text
    // kit; no OpenRouter key (or an error) just means null and no AI slide art.
    if (kit.carousel) {
      const orKey = process.env.OPENROUTER_API_KEY
      if (orKey) {
        try {
          kit.imageModel = await resolveImageModel({
            key: orKey,
            override: process.env.OPENROUTER_IMAGE_MODEL,
          })
        } catch {
          kit.imageModel = null
        }
      } else {
        kit.imageModel = null
      }
    }

    console.log('[generate] done', { elapsedMs, produced: Object.keys(kit) })
    res.status(200).json(kit)
  } catch (e) {
    console.error('[generate] failed', e)
    res.status(500).json({ error: String(e?.message || e) })
  }
}
