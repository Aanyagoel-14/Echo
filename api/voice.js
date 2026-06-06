/*
 * POST /api/voice — Echo's Voice Profile distiller (CP12, plan §5).
 *
 * Takes the creator's pasted posts and distills them into the injectable
 * `voice.md` (profileMarkdown) + a structured traits mirror. The model call and
 * the key stay server-side — never in the client (§2: "No API keys in client
 * code, ever").
 *
 * This is the cloud engine. It is intentionally optional: if the key is missing
 * or the call fails, the client falls back to the on-device heuristic engine in
 * lib/voiceProfile.js, so the feature works on prod either way. (This is also
 * the CP9 NO-GO fallback: cloud builds voice.md once, cached locally, still
 * injected.) The WebLLM on-device upgrade later replaces this as the primary.
 *
 * Intake (feature-optimisation Phase 0): this generator now reads the canonical
 * posts.json contract instead of a raw text blob. A raw `samples` string is
 * still accepted for back-compat — the trivial pass-through adapter turns it
 * into the same contract — so the existing paste flow distills identically.
 */

import { validatePostsJson, passThroughPosts, postsToText } from '../src/lib/posts.js'

const SECTIONS = [
  'Voice in one line',
  'Tone & register',
  'Signature words & phrases',
  'Sentence rhythm',
  'Emoji & punctuation habits',
  'Hook patterns',
  'Topics & POV',
  "Hard don'ts",
]

const SYSTEM = `You are a voice analyst for short-form creators. Given a creator's own posts, distill HOW they write into a compact, strict, reusable guide they can paste into any tool. Be specific and grounded ONLY in the samples — never invent traits. Capture rhythm, signature words, emoji/punctuation habits, and hook shapes. Keep it tight and human-readable.

Return ONLY a JSON object (no prose, no code fences) with exactly these keys:
{
  "profileMarkdown": "<a markdown voice guide titled '# Creator Voice Profile' with these ## sections in order: ${SECTIONS.join(', ')}>",
  "traits": {
    "voiceOneLiner": "<one sentence>",
    "register": "<short phrase>",
    "vocabulary": ["<signature word/phrase>", ...],
    "avoid": ["<hard don't>", ...],
    "emojiHabit": "<short phrase>",
    "sentenceRhythm": "<short phrase>",
    "hookPatterns": ["<observed opening pattern>", ...],
    "topics": ["<topic>", ...]
  }
}`

// Per-platform interpretation hints (feature-optimisation Phase 2). The same
// creator writes differently per platform; telling the distiller WHERE these
// posts came from lets it read the voice in context — without overriding the
// samples, which stay the source of truth.
const PLATFORM_HINTS = {
  x: 'These posts are from X (Twitter): expect terse, punchy lines, lowercase, threads, and hot takes.',
  instagram: 'These posts are Instagram captions: expect storytelling, line breaks, emoji, and hashtags.',
  linkedin: 'These posts are from LinkedIn: expect professional framing, insight-led hooks, and longer structured posts.',
}

function buildUserMessage(samples, tone, platform) {
  const toneLine = tone
    ? `\n\nThe creator also selected a "${tone}" tone as a cold-start hint — let it nudge, but the samples are the source of truth.`
    : ''
  const platformLine = PLATFORM_HINTS[platform]
    ? `\n\n${PLATFORM_HINTS[platform]} Account for how they adapt to that platform, but never invent traits the samples don't show.`
    : ''
  return `Here are the creator's posts. Distill their voice.${toneLine}${platformLine}\n\n"""\n${samples.trim().slice(0, 6000)}\n"""`
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

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  const { posts, samples, platform, tone } = req.body ?? {}

  // Resolve the input to the canonical contract. Prefer structured posts (an
  // array, or a full posts.json envelope); fall back to wrapping a raw blob via
  // the pass-through adapter so the legacy paste flow is unchanged.
  const postsArray = Array.isArray(posts)
    ? posts
    : Array.isArray(posts?.posts)
      ? posts.posts
      : null
  const postsJson = postsArray
    ? validatePostsJson({ posts: postsArray, platform }, { platform }).value
    : passThroughPosts(typeof samples === 'string' ? samples : '', { platform })

  // The distiller works on text; flatten the clean posts into its input blob.
  const samplesText = postsToText(postsJson, { max: 6000 })
  if (samplesText.trim().length < 20) {
    res.status(400).json({ error: 'Need a few sample posts to distill a voice.' })
    return
  }

  const key = process.env.OPENROUTER_API_KEY
  if (!key) {
    // Not an error the user should see — the client silently falls back to the
    // on-device engine. 503 signals "cloud offline, use the fallback."
    res.status(503).json({ error: 'no_key', fallback: 'on-device' })
    return
  }

  const model = process.env.OPENROUTER_MODEL || 'google/gemini-2.5-flash'
  const started = Date.now()

  try {
    const r = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://echo-one-gamma.vercel.app',
        'X-Title': 'Echo voice distill',
      },
      body: JSON.stringify({
        model,
        max_tokens: 1100,
        temperature: 0.4,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: SYSTEM },
          { role: 'user', content: buildUserMessage(samplesText, tone, platform) },
        ],
      }),
    })

    const elapsedMs = Date.now() - started
    const data = await r.json()

    if (!r.ok) {
      res.status(502).json({
        error: data?.error?.message || data?.error || 'OpenRouter returned an error',
        elapsedMs,
      })
      return
    }

    const parsed = parseModelJson(data?.choices?.[0]?.message?.content)
    if (!parsed?.profileMarkdown || typeof parsed.profileMarkdown !== 'string') {
      res.status(502).json({ error: 'Model output was not usable JSON.' })
      return
    }

    res.status(200).json({
      profileMarkdown: parsed.profileMarkdown,
      traits: parsed.traits ?? {},
      model,
      elapsedMs,
    })
  } catch (e) {
    res.status(500).json({ error: String(e?.message || e) })
  }
}
