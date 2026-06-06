/*
 * POST /api/normalise — Echo's smart-paste normaliser (feature-optimisation §6,
 * Phase 1). The shared backbone of every ingestion path: it turns RAW, messy
 * social content (a pasted timeline full of "1.2K", "Show more", relative
 * timestamps, reaction counts) into a clean posts.json (§7) the voice.md
 * generator can trust.
 *
 * It PARSES/STRUCTURES — it never fetches or invents (§4 clarification: LLMs
 * don't scrape; they structure text the user already has). The model only sees
 * text the user pasted; counts/dates absent from the source are dropped, and
 * reshares are excluded unless asked. Strict JSON out, validated against the
 * shared contract, with a deterministic splitter as the never-fail floor.
 *
 * Its model is a separate env knob — OPENROUTER_NORMALISER_MODEL — because this
 * is a cheap parsing task (§6): favour a fast, cheap, strong instruction-
 * follower, swappable without a deploy, independent of the heavier distill /
 * generate model. Falls back to OPENROUTER_MODEL so it works with zero new
 * config.
 */

import {
  validatePostsJson,
  passThroughPosts,
  SCHEMA_PROMPT,
  PLATFORMS,
} from '../src/lib/posts.js'

// Keep each model call bounded (§6: "enforce a max input size per call to
// control cost and stay within context"). Long pastes are split on blank lines
// so a post is never cut mid-text, then merged back.
const MAX_CHARS_PER_CHUNK = 12000
const MAX_CHUNKS = 6 // hard cap on cost/latency for one paste

function buildSystem(includeReshares) {
  return `You are a strict PARSER, not a writer. You are given RAW social-media content the user copied from their own profile or timeline. Return ONLY valid JSON matching the schema below — no prose, no markdown, no code fences, no preamble.

Rules:
- Extract ONLY the authored post text. Strip every bit of platform UI chrome: like/view/repost/comment counts (e.g. "1.2K", "342 views"), "Show more"/"See more"/"Translate post", relative timestamps ("2h", "3d", "Yesterday"), "Follow"/"Following", reaction/blue-check decorations, and "Reply"/"Repost"/"Share"/"Bookmark" button labels.
- Do NOT invent posts, ids, dates, or counts. Keep a created_at ONLY if a real date is clearly present in the source; otherwise null.
- Preserve the author's REAL wording verbatim — their own emoji, casing, line breaks, and punctuation ARE their voice. Only remove the platform's chrome around the words.
- Merge a single post wrapped across lines into one "text"; keep genuinely distinct posts as separate entries.
- Mark replies as "reply" and thread continuations as "thread_part".
- ${includeReshares ? 'Include reshares/quotes and mark them "reshare".' : 'EXCLUDE reshares/retweets/quotes of OTHER people’s content — keep only what THIS author actually wrote.'}
- If the input contains no real authored posts, return {"posts": []}.

Schema (return EXACTLY this shape):
${SCHEMA_PROMPT}`
}

function buildUser({ chunk, platform, chunkIndex, chunkCount }) {
  const platformLine =
    platform && PLATFORMS.includes(platform) && platform !== 'other'
      ? `Platform: ${platform}.\n`
      : ''
  const partLine =
    chunkCount > 1 ? `This is part ${chunkIndex + 1} of ${chunkCount}.\n` : ''
  return `${platformLine}${partLine}Parse the raw content below into posts.json.

"""
${chunk}
"""`
}

// The model may wrap JSON in prose/fences despite instructions — extract it.
// (Mirrors the helper in voice.js / generate.js.)
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

// Split raw input into <= MAX_CHARS_PER_CHUNK pieces, breaking on blank lines so
// a post is never severed. Oversized single blocks are hard-sliced as a last
// resort. Bounded to MAX_CHUNKS to cap cost.
function chunkRaw(raw) {
  const blocks = raw.split(/\n\s*\n/)
  const chunks = []
  let current = ''
  for (const block of blocks) {
    if (current && current.length + block.length + 2 > MAX_CHARS_PER_CHUNK) {
      chunks.push(current)
      current = ''
    }
    if (block.length > MAX_CHARS_PER_CHUNK) {
      if (current) {
        chunks.push(current)
        current = ''
      }
      for (let i = 0; i < block.length; i += MAX_CHARS_PER_CHUNK) {
        chunks.push(block.slice(i, i + MAX_CHARS_PER_CHUNK))
      }
      continue
    }
    current = current ? `${current}\n\n${block}` : block
  }
  if (current) chunks.push(current)
  return chunks.slice(0, MAX_CHUNKS)
}

// One OpenRouter parse call for one chunk → array of raw post objects. Retries
// once on unusable JSON with a terse "valid JSON only" nudge, then gives up (the
// caller falls back to the deterministic splitter for this chunk).
async function normaliseChunk({ key, model, system, user }) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const messages = [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ]
    if (attempt > 0) {
      messages.push({
        role: 'system',
        content: 'Your previous reply was not valid JSON. Return ONLY the JSON object matching the schema — nothing else.',
      })
    }

    const r = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://echo-one-gamma.vercel.app',
        'X-Title': 'Echo normalise',
      },
      body: JSON.stringify({
        model,
        max_tokens: 4000,
        temperature: 0, // parsing — be deterministic, not creative
        response_format: { type: 'json_object' },
        messages,
      }),
    })

    const data = await r.json()
    if (!r.ok) {
      throw new Error(data?.error?.message || data?.error || `OpenRouter ${r.status}`)
    }

    const parsed = parseModelJson(data?.choices?.[0]?.message?.content)
    if (parsed && Array.isArray(parsed.posts)) return parsed.posts
  }
  return null // signal: fall back to the splitter for this chunk
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  const { raw: rawInput, platform, source, include_reshares } = req.body ?? {}
  const raw = typeof rawInput === 'string' ? rawInput.trim() : ''
  if (raw.length < 20) {
    res.status(400).json({ error: 'Paste a bit more content to clean up.' })
    return
  }

  const meta = { platform, source: source || 'paste' }

  const key = process.env.OPENROUTER_API_KEY
  if (!key) {
    // Not a user-facing error — the client falls back to its own deterministic
    // splitter. 503 mirrors /api/voice's "cloud offline, use the fallback".
    res.status(503).json({ error: 'no_key', fallback: 'pass-through' })
    return
  }

  const model =
    process.env.OPENROUTER_NORMALISER_MODEL ||
    process.env.OPENROUTER_MODEL ||
    'google/gemini-2.5-flash'
  const system = buildSystem(Boolean(include_reshares))
  const chunks = chunkRaw(raw)
  const started = Date.now()

  try {
    const settled = await Promise.all(
      chunks.map(async (chunk, i) => {
        const user = buildUser({
          chunk,
          platform,
          chunkIndex: i,
          chunkCount: chunks.length,
        })
        try {
          const posts = await normaliseChunk({ key, model, system, user })
          // Per-chunk model failure degrades to the splitter for THAT chunk
          // only — one bad chunk never sinks the whole paste.
          return posts ?? passThroughPosts(chunk, meta).posts
        } catch (e) {
          console.error('[normalise] chunk failed, splitting', i, String(e?.message || e))
          return passThroughPosts(chunk, meta).posts
        }
      }),
    )

    const merged = settled.flat()
    // One validation pass over the merged set: coerce, drop empties, de-dupe
    // across chunk seams, stamp the envelope.
    const { value, ok } = validatePostsJson({ posts: merged }, meta)
    const elapsedMs = Date.now() - started

    console.log('[normalise] done', {
      rawChars: raw.length,
      chunks: chunks.length,
      posts: value.posts.length,
      elapsedMs,
    })

    if (!ok) {
      res.status(422).json({ error: 'No authored posts found in the pasted content.' })
      return
    }

    res.status(200).json({ ...value, model, elapsedMs, chunks: chunks.length })
  } catch (e) {
    console.error('[normalise] failed', e)
    res.status(500).json({ error: String(e?.message || e) })
  }
}
