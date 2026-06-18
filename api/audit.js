/*
 * POST /api/audit — Feature 3, the Suggestion Model (the AI Audit).
 *
 * Compares the creator's past posts against TODAY's trends and returns a
 * structured, readable critique — What's Working / What's Missing / Hashtag
 * Audit / Strategic Pivot — as Markdown (plus the same four blocks split for the
 * UI). Mock-first, exactly like /api/generate: the critique is templated from
 * the real inputs today (no model call, no secret), and the real LLM slots in
 * behind src/lib/audit.js's buildAuditPrompt() returning this SAME shape.
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
import { generateMockAudit, inferNiche } from '../src/lib/audit.js'

export default function handler(req, res) {
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

  console.log('[audit] received', {
    posts: list.length,
    niche: trends.niche,
    nicheExplicit: Boolean(explicitNiche),
    tone: brandVoice?.tone ?? null,
    hasInspiration: Boolean(inspiration?.refs || inspiration?.visuals?.length),
    trendsSource: batch.source,
  })

  // TODO (event): real model synthesis goes here, returning this SAME shape:
  //   import { buildAuditPrompt } from '../src/lib/audit.js'
  //   const md = await callModel(buildAuditPrompt({ brandVoice, posts: list, trends, inspiration }))
  //   …then split `md` into sections (or have the model return them).
  // buildAuditPrompt() already assembles the exact spec system prompt with the
  // inputs interpolated, so wiring a cheap LLM is a localized, client-invisible
  // change. The templating below is the placeholder, not the contract.
  const audit = generateMockAudit({ brandVoice, posts: list, trends, inspiration })

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
