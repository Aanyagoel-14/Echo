/*
 * POST /api/audit — Feature 3, the Suggestion Model (the AI Audit).
 *
 * Compares the creator's past posts against TODAY's trends and returns a
 * structured, readable critique — What's Working / What's Missing / Hashtag
 * Audit / Strategic Pivot — as Markdown (plus the same four blocks split for the
 * UI). The real cheap LLM writes the four prose sections (built from the tested
 * buildAuditPrompt() seam); the structured Hashtag Audit chips are computed
 * server-side in assembleAuditFromSections(), never trusted to the model. The
 * model call and the key stay server-side only (§2). When no key is configured
 * — or the model fails — it falls back to the templated mock of the SAME shape,
 * so the audit always answers and this endpoint's contract never changes.
 *
 * Trends come from OUR OWN cache (Feature 1) via readBatch(), falling back to a
 * freshly generated mock batch on a cold instance — so the audit pays ZERO
 * per-request trend fees, which is the entire point of the harvesting engine.
 * The niche is an explicit pick (Page 2 Genre Selector) when given, otherwise
 * inferred from the posts, so the always-on audit works even if Page 2 is skipped.
 *
 * Request:  { brandVoice, posts: string[], niche?, inspiration? }
 * Response: { markdown, sections, hashtags, meta }
 */

import { generateMockBatch, isStale, selectNiche } from '../src/lib/trends.js'
import { readBatch } from '../src/lib/trendStore.js'
import {
  generateMockAudit,
  inferNiche,
  buildAuditPrompt,
  assembleAuditFromSections,
  countAuditSections,
} from '../src/lib/audit.js'
import { chatCompletions, isModelConfigured } from '../src/lib/llm.js'

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

/*
 * Reuse the tested spec prompt (persona + the four inputs interpolated + the
 * four-section task) and append a JSON-output instruction that overrides its
 * trailing "plain Markdown" line. Asking for a JSON object keeps the four
 * section bodies cleanly separable and the renderer unchanged — same approach
 * /api/generate uses for the content kit.
 */
function buildAuditSystem({ brandVoice, posts, trends, inspiration }) {
  const base = buildAuditPrompt({ brandVoice, posts, trends, inspiration })
  return `${base}

OUTPUT FORMAT (this overrides any earlier mention of plain Markdown): return ONLY a JSON object — no prose, no code fences — with EXACTLY these keys, each a Markdown string body (use "- " bullets and **bold** where helpful; do NOT put headings inside the strings):
{
  "whatsWorking": "…",
  "whatsMissing": "…",
  "hashtagAudit": "…",
  "strategicPivot": "…"
}
Ground every point in the provided posts and trends. Be concrete and specific — no placeholders, no "[insert here]".`
}

// Call the cloud model and assemble the critique. Throws on any failure so the
// handler can fall back to the mock — generation has no on-device model, but the
// audit does (the templated mock), so a model hiccup never breaks the page.
async function runModelAudit({ brandVoice, posts, trends, inspiration }) {
  const model =
    process.env.ECHO_AUDIT_MODEL ||
    process.env.ECHO_MODEL ||
    'google/gemini-2.5-flash'

  const { ok, status, data, error } = await chatCompletions({
    model,
    max_tokens: 1500,
    temperature: 0.7,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: buildAuditSystem({ brandVoice, posts, trends, inspiration }) },
      { role: 'user', content: 'Write the audit now as the specified JSON object.' },
    ],
  })

  if (!ok) {
    throw new Error(error || `Vertex ${status}`)
  }
  const parsed = parseModelJson(data?.choices?.[0]?.message?.content)
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('audit model output was not usable JSON')
  }
  const audit = assembleAuditFromSections({
    brandVoice,
    posts,
    trends,
    inspiration,
    sections: parsed,
    source: 'model',
  })
  // A thin response (model gave us almost nothing) is treated as a failure so we
  // serve the substantive mock instead of a near-empty critique.
  if (countAuditSections(audit.sections) < 3) {
    throw new Error('audit model returned too few usable sections')
  }
  return audit
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  const { brandVoice, posts, niche, inspiration } = req.body ?? {}
  const list = Array.isArray(posts) ? posts.filter((p) => typeof p === 'string' && p.trim()) : []

  // Niche: an explicit Genre Selector pick wins; else infer it from the posts so
  // the audit still works when the optional Page 2 was skipped.
  const explicitNiche = typeof niche === 'string' && niche.trim() ? niche : null
  const nicheInput = explicitNiche || inferNiche(list)

  // Today's trends from our own cache (never a live source at query time). A
  // cold instance with no cache yet falls back to a fresh mock batch — still no
  // network, still no per-request fee — so the endpoint always answers.
  const batch = readBatch() || generateMockBatch({ now: new Date() })
  const trends = selectNiche(batch, nicheInput)

  const useModel = isModelConfigured()

  console.log('[audit] received', {
    posts: list.length,
    niche: trends.niche,
    nicheExplicit: Boolean(explicitNiche),
    tone: brandVoice?.tone ?? null,
    hasInspiration: Boolean(inspiration?.refs || inspiration?.visuals?.length),
    trendsSource: batch.source,
    model: useModel,
  })

  // Real model when Vertex is configured; the templated mock otherwise (or if the
  // model errors / returns thin output). buildAuditPrompt() assembles the exact
  // spec prompt with the inputs interpolated, so this is the live wiring of the
  // seam the mock always stood in for.
  let audit = null
  if (useModel) {
    try {
      audit = await runModelAudit({ brandVoice, posts: list, trends, inspiration })
    } catch (e) {
      console.error('[audit] model failed, falling back to mock:', String(e?.message || e))
    }
  }
  if (!audit) {
    audit = generateMockAudit({ brandVoice, posts: list, trends, inspiration })
  }

  res.status(200).json({
    ...audit,
    meta: {
      ...audit.meta,
      // Provenance of the TREND slice the critique was built against (distinct
      // from meta.source, which is the provenance of the critique itself).
      trends: {
        source: batch.source,
        harvestedAt: batch.harvestedAt,
        stale: isStale(batch, new Date()),
      },
    },
  })
}
