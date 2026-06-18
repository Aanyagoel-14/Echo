/*
 * Feature 3 — Suggestion Model / AI Audit: standalone checks.
 *
 * Pure node, no test runner (matches the repo's "node-testable lib" style).
 * Run: `node test/audit.test.mjs`  (or `npm run test:audit`).
 *
 * Covers the spec's three "test on its own" criteria plus the supporting units:
 *   1. Mock posts + mock trends + a brand voice ⇒ all four critique sections in
 *      valid Markdown.
 *   2. Omitting the optional inspiration still yields a coherent critique.
 *   3. Swapping in a different niche's trends changes the Hashtag Audit.
 * Everything runs on stubbed inputs — no live scraper or real upload needed. The
 * last block wires Feature 2 (parser) → Feature 1 (trends) → Feature 3 (audit)
 * with the real fixture to prove the full path.
 */

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

import {
  generateMockAudit,
  buildAuditPrompt,
  inferNiche,
  extractHashtags,
  auditHashtags,
} from '../src/lib/audit.js'
import { generateMockBatch, selectNiche, NICHES, GENERIC_NICHE } from '../src/lib/trends.js'
import { detectAndExtract } from '../src/lib/importAdapters.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

let passed = 0
const ok = (label) => {
  passed++
  console.log(`  ✓ ${label}`)
}

const SECTIONS = ["## What's Working", "## What's Missing", '## Hashtag Audit', '## Strategic Pivot']
const hasAllSections = (md) => SECTIONS.every((h) => md.includes(h))

const DAY = new Date('2026-06-18T00:00:00Z')
const BATCH = generateMockBatch({ now: DAY })

// Mock historical posts: a skincare creator with a few stale-ish tags.
const SKIN_POSTS = [
  'my 3-step morning routine for glowy skin ✨ #skincare #glowup #beauty',
  "the one serum I won't travel without — gentle enough for sensitive skin #skincareroutine",
  'unpopular opinion: you do NOT need a 10-step routine. here is what actually works 👇 #skintok',
]
const VOICE = { tone: 'playful', samples: ['glow tips daily ✨'], source: 'instagram' }

// ── Test 1: all four critique sections, in valid Markdown ──────────────────
{
  console.log('Test 1 — mock posts + trends + voice ⇒ four sections in Markdown')
  const trends = selectNiche(BATCH, 'skincare')
  const audit = generateMockAudit({ brandVoice: VOICE, posts: SKIN_POSTS, trends })

  assert.ok(audit.markdown && typeof audit.markdown === 'string', 'returns a markdown string')
  assert.ok(hasAllSections(audit.markdown), 'markdown contains all four critique sections')
  for (const key of ['whatsWorking', 'whatsMissing', 'hashtagAudit', 'strategicPivot']) {
    assert.ok(audit.sections[key] && audit.sections[key].trim(), `sections.${key} is non-empty`)
  }
  assert.equal(audit.meta.niche, 'skincare', 'meta carries the resolved niche')
  assert.equal(audit.meta.tone, 'Playful', 'meta carries the resolved tone label')
  assert.equal(audit.meta.postCount, 3)
  ok('a full critique has all four sections in valid Markdown')
}

// ── Test 2: coherent with AND without the optional inspiration ─────────────
{
  console.log('Test 2 — optional inspiration: present vs omitted both stay coherent')
  const trends = selectNiche(BATCH, 'skincare')

  const without = generateMockAudit({ brandVoice: VOICE, posts: SKIN_POSTS, trends })
  assert.ok(hasAllSections(without.markdown), 'still four sections with no inspiration')
  assert.equal(without.meta.hasInspiration, false)

  const withInsp = generateMockAudit({
    brandVoice: VOICE,
    posts: SKIN_POSTS,
    trends,
    inspiration: { refs: 'love how @glowdiary tells a slow, story-driven before/after over several lines', visuals: [] },
  })
  assert.ok(hasAllSections(withInsp.markdown), 'still four sections with inspiration')
  assert.equal(withInsp.meta.hasInspiration, true)
  // The inspiration must actually steer the pivot (and only when provided).
  assert.notEqual(
    withInsp.sections.strategicPivot,
    without.sections.strategicPivot,
    'inspiration changes the Strategic Pivot',
  )
  assert.match(withInsp.sections.strategicPivot, /inspiration/i, 'pivot references the inspiration')
  ok('the audit is coherent with the inspiration omitted and richer when present')
}

// ── Test 3: a different niche changes the Hashtag Audit ────────────────────
{
  console.log('Test 3 — swapping the niche changes the Hashtag Audit')
  const skin = generateMockAudit({ brandVoice: VOICE, posts: SKIN_POSTS, trends: selectNiche(BATCH, 'skincare') })
  const fin = generateMockAudit({ brandVoice: VOICE, posts: SKIN_POSTS, trends: selectNiche(BATCH, 'finance') })

  assert.notEqual(skin.sections.hashtagAudit, fin.sections.hashtagAudit, 'audit text differs by niche')
  const skinAdds = skin.hashtags.add.map((h) => h.tag).sort()
  const finAdds = fin.hashtags.add.map((h) => h.tag).sort()
  assert.notDeepEqual(skinAdds, finAdds, 'suggested tags differ by niche')

  // Every suggested tag is genuinely from that niche's trend slice.
  const finTags = new Set(selectNiche(BATCH, 'finance').hashtags.map((h) => h.tag.toLowerCase()))
  assert.ok(fin.hashtags.add.every((h) => finTags.has(h.tag.toLowerCase())), 'finance adds come from finance trends')
  ok('the Hashtag Audit is niche-aware (different trends → different tags)')
}

// ── Hashtag audit invariants: keep / retire / add are always well-formed ───
{
  console.log('Unit — hashtag audit keep/retire/add invariants hold')
  const trends = selectNiche(BATCH, 'skincare')
  // Seed a post with a tag we KNOW is in today's slice (which 6 of the 12 tags
  // surface is date-dependent) so "keep" is guaranteed non-empty here.
  const onTrendTag = trends.hashtags[0].tag
  const posts = [...SKIN_POSTS, `routine refresh this week ${onTrendTag}`]
  const ht = auditHashtags(posts, trends)
  const trendKeys = new Set(trends.hashtags.map((h) => h.tag.toLowerCase()))
  const currentKeys = new Set(extractHashtags(posts).map((t) => t.toLowerCase()))

  assert.ok(ht.keep.every((t) => trendKeys.has(t.toLowerCase())), 'keep ⊆ trend-backed')
  assert.ok(ht.keep.every((t) => currentKeys.has(t.toLowerCase())), 'keep ⊆ used')
  assert.ok(ht.retire.every((t) => !trendKeys.has(t.toLowerCase())), 'retire are not trend-backed')
  assert.ok(ht.retire.every((t) => currentKeys.has(t.toLowerCase())), 'retire ⊆ used')
  assert.ok(ht.add.every((h) => trendKeys.has(h.tag.toLowerCase())), 'add ⊆ trend-backed')
  assert.ok(ht.add.every((h) => !currentKeys.has(h.tag.toLowerCase())), 'add are not already used')
  // A used tag that's in today's slice must be kept, not retired or re-added.
  assert.ok(ht.keep.some((t) => t.toLowerCase() === onTrendTag.toLowerCase()), 'an on-trend used tag is kept')
  assert.ok(!ht.add.some((h) => h.tag.toLowerCase() === onTrendTag.toLowerCase()), 'a used tag is never in "add"')
  ok('keep/retire/add partition the tags correctly')
}

// ── extractHashtags: dedupe, case-insensitive, preserves first display form ─
{
  console.log('Unit — extractHashtags dedupes case-insensitively')
  const tags = extractHashtags(['#Glow up now #glow', 'again #GLOW and #spf'])
  assert.deepEqual(tags, ['#Glow', '#spf'], 'first-seen casing kept, dupes dropped')
  assert.deepEqual(extractHashtags(['no tags here']), [], 'no tags ⇒ empty')
  ok('hashtag extraction dedupes and preserves display casing')
}

// ── inferNiche: posts → niche when Page 2 was skipped ──────────────────────
{
  console.log('Unit — inferNiche reads the niche off the posts')
  assert.equal(inferNiche(SKIN_POSTS), 'skincare', 'skincare posts ⇒ skincare')
  assert.equal(inferNiche(['squat PRs and zone 2 cardio #gymtok #workout']), 'fitness', 'fitness posts ⇒ fitness')
  assert.equal(inferNiche([]), GENERIC_NICHE, 'no posts ⇒ general')
  assert.equal(inferNiche(['just a normal day, nothing special']), GENERIC_NICHE, 'weak signal ⇒ general')
  ok('niche inference works for the always-on (Page-2-skipped) audit')
}

// ── buildAuditPrompt: the LLM seam carries the exact spec prompt + inputs ───
{
  console.log('Unit — buildAuditPrompt assembles the spec system prompt')
  const trends = selectNiche(BATCH, 'skincare')
  const prompt = buildAuditPrompt({ brandVoice: VOICE, posts: SKIN_POSTS, trends })

  assert.match(prompt, /expert Social Media Strategist/, 'opens with the spec persona')
  for (const label of ["What's Working", "What's Missing", 'Hashtag Audit', 'Strategic Pivot']) {
    assert.ok(prompt.includes(label), `task lists "${label}"`)
  }
  assert.match(prompt, /clean, easy-to-read Markdown/, 'asks for Markdown output')
  assert.ok(prompt.includes(SKIN_POSTS[0]), 'interpolates the historical posts')
  assert.ok(prompt.includes('#skincare'), 'interpolates the trend hashtags')
  assert.match(prompt, /Playful/, 'interpolates the brand voice tone')

  const noInsp = buildAuditPrompt({ brandVoice: VOICE, posts: SKIN_POSTS, trends })
  assert.match(noInsp, /Inspiration \(Optional\): \(none provided\)/, 'omitted inspiration reads "(none provided)"')
  ok('the model seam carries the verbatim spec prompt with inputs filled in')
}

// ── End-to-end: real export → parse (F2) → trends (F1) → audit (F3) ────────
{
  console.log('Test E2E — Instagram export → parsed posts → cached trends → audit')
  const fixture = readFileSync(join(__dirname, 'fixtures', 'posts_1.json'), 'utf8')
  const { platform, raw } = detectAndExtract('posts_1.json', fixture, 'instagram')
  assert.equal(platform, 'instagram')

  // The audit consumes the FULL parsed posts (detectAndExtract's raw extract),
  // not cleanPosts' ≤4 voice samples: those clamp captions to 600 chars, which
  // cuts the trailing hashtag block — exactly the data the Hashtag Audit needs.
  const posts = raw
  assert.ok(posts.length >= 1, 'parser yields posts')
  assert.ok(extractHashtags(posts).length >= 1, 'full posts retain their hashtags')

  // No explicit niche: infer it (these are build-in-public founder posts).
  const niche = inferNiche(posts)
  assert.equal(niche, 'business', 'a build-in-public founder ⇒ business niche')

  const trends = selectNiche(BATCH, niche)
  const audit = generateMockAudit({
    brandVoice: { tone: 'professional', samples: posts, source: 'instagram' },
    posts,
    trends,
  })
  assert.ok(hasAllSections(audit.markdown), 'real-data audit has all four sections')
  const bizTags = new Set(trends.hashtags.map((h) => h.tag.toLowerCase()))
  assert.ok(audit.hashtags.add.length >= 1, 'suggests at least one trend-backed tag')
  assert.ok(audit.hashtags.add.every((h) => bizTags.has(h.tag.toLowerCase())), 'suggested tags are business trends')
  assert.ok(audit.markdown.length > 400, 'critique is substantive, not a stub')
  ok('the full F2→F1→F3 path produces a real, niche-correct critique')
}

console.log(`\nAll ${passed} audit checks passed.`)
