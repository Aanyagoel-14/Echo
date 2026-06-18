/*
 * Feature 3 — Suggestion Model / the AI Audit (core, pure).
 *
 * Compares the creator's past posts against TODAY's trends and returns a
 * structured, readable critique. This is the pure core — no network, no
 * filesystem, browser-safe and node-testable — so it can run in a test, in the
 * client, or behind the /api/audit endpoint unchanged.
 *
 * Mock-first, exactly like api/generate.js: the critique is *templated from the
 * real inputs* today (no model call, no secret), so it genuinely reflects the
 * creator's posts, voice, and the live niche trends — not a canned demo. The
 * real LLM the spec names (a cheap model — Gemini Flash / GPT-4o-mini) slots in
 * behind buildAuditPrompt(): it already assembles the exact spec system prompt
 * with the inputs interpolated, so wiring the model is a localized change that
 * returns the SAME shape this module returns.
 *
 * The deliverable (the contract the endpoint + future Page 3 depend on):
 *   {
 *     markdown: string,            // the full critique — the spec's deliverable
 *     sections: {                  // the same four blocks, split for the UI
 *       whatsWorking, whatsMissing, hashtagAudit, strategicPivot  // markdown
 *     },
 *     hashtags: {                  // the structured data behind the Hashtag Audit
 *       current: string[],         // tags mined from the user's posts
 *       keep:    string[],         // current tags still trend-backed
 *       retire:  string[],         // current tags absent from today's trends
 *       add:     [{ tag, momentum }], // trend-backed tags they're missing
 *     },
 *     meta: { source:'mock', niche, label, postCount, tone, hasInspiration },
 *   }
 *
 * The four sections come straight from the spec's required critique:
 *   What's Working · What's Missing · Hashtag Audit · Strategic Pivot.
 */

import { NICHES, GENERIC_NICHE } from './trends.js'

// ── Small text utilities ───────────────────────────────────────────────────

const HASHTAG_RE = /#[A-Za-z0-9_]+/g
const EMOJI_RE = /\p{Extended_Pictographic}/u
// Low-signal connective words to ignore when matching a trend topic to a post.
const STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'for', 'to', 'in', 'on', 'of', 'with', 'your',
  'my', 'our', 'vs', 'at', 'by', 'is', 'it', 'this', 'that', 'how', 'why',
  'what', 'from', 'into', 'out', 'up', 'no', 'not', 'you', 'are',
])

function tokenize(text) {
  return String(text).toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)
}

// The content words of a phrase — what actually carries its meaning.
function contentWords(phrase) {
  return tokenize(phrase).filter((w) => w.length >= 3 && !STOPWORDS.has(w))
}

function lcFirst(s) {
  return s ? s[0].toLowerCase() + s.slice(1) : s
}

function clampSnippet(s, n = 90) {
  const t = String(s).replace(/\s+/g, ' ').trim()
  return t.length > n ? `${t.slice(0, n - 1).trimEnd()}…` : t
}

// "a", "a and b", "a, b, and c"
function listPhrase(items) {
  if (items.length <= 1) return items[0] || ''
  if (items.length === 2) return `${items[0]} and ${items[1]}`
  return `${items.slice(0, -1).join(', ')}, and ${items[items.length - 1]}`
}

const TONE_LABELS = {
  playful: 'Playful',
  professional: 'Professional',
  bold: 'Bold',
  minimal: 'Minimal',
}

// Map a tone id/label to its display label (or null). Inlined rather than
// imported from brandVoice.js so this stays free of any storage coupling —
// same call api/generate.js makes with its own TONE_STYLE table.
function toneLabel(tone) {
  if (!tone) return null
  return TONE_LABELS[String(tone).toLowerCase()] ?? null
}

function hasInspirationSignal(inspiration) {
  const refs = typeof inspiration?.refs === 'string' && inspiration.refs.trim()
  const visuals = Array.isArray(inspiration?.visuals) && inspiration.visuals.length
  return Boolean(refs || visuals)
}

// ── Hashtags ────────────────────────────────────────────────────────────────

/*
 * Pull the hashtags a creator actually uses out of their post text, deduped
 * (case-insensitively) and in first-seen order, preserving the original casing
 * for display. Cleaned posts keep their tags (postClean preserves '#'), so this
 * works on Feature 2's output directly.
 */
export function extractHashtags(posts) {
  const list = Array.isArray(posts) ? posts : [posts]
  const seen = new Map() // lowercased tag → original display form
  for (const p of list) {
    const matches = typeof p === 'string' ? p.match(HASHTAG_RE) || [] : []
    for (const m of matches) {
      const key = m.toLowerCase()
      if (!seen.has(key)) seen.set(key, m)
    }
  }
  return [...seen.values()]
}

/*
 * The Hashtag Audit, computed against a niche's trend slice (the spec's
 * "outdated tags out, trend-backed tags in"):
 *   - keep:   tags the creator uses that are still in today's trends;
 *   - retire: tags they use that today's trends don't back (outdated / generic);
 *   - add:    the highest-momentum trend tags they're NOT yet using.
 * Because `add`/`keep` derive from the niche's trend tags, this output changes
 * when the niche changes — which is the spec's third "test on its own" check.
 */
export function auditHashtags(posts, trends) {
  const current = extractHashtags(posts)
  const currentKeys = new Set(current.map((t) => t.toLowerCase()))
  const trendTags = Array.isArray(trends?.hashtags) ? trends.hashtags : []
  const trendKeys = new Set(trendTags.map((h) => String(h.tag).toLowerCase()))

  const keep = current.filter((t) => trendKeys.has(t.toLowerCase()))
  const retire = current.filter((t) => !trendKeys.has(t.toLowerCase()))
  const add = trendTags
    .filter((h) => !currentKeys.has(String(h.tag).toLowerCase()))
    .slice() // already momentum-ranked by buildNicheSlice; copy before sort
    .sort((a, b) => b.momentum - a.momentum)
    .slice(0, 5)

  return { current, keep, retire, add }
}

// ── Niche inference (when Page 2's Genre Selector was skipped) ───────────────

// Tokens of a text PLUS the words inside camelCase hashtags (#FounderJourney →
// "founder", "journey"), so concatenated IG tags still match the taxonomy.
function nicheTokens(text) {
  const raw = tokenize(text)
  const spaced = tokenize(String(text).replace(/([a-z0-9])([A-Z])/g, '$1 $2'))
  return new Set([...raw, ...spaced])
}

/*
 * Best-guess the niche from the posts themselves, by scoring each niche's ids,
 * aliases, label words, and tag stems against the post tokens. Used when no
 * explicit niche was chosen, so the always-on audit (Page 3) works even when the
 * optional Page 2 was skipped. Falls back to the generic niche on a weak match.
 */
export function inferNiche(posts) {
  const text = Array.isArray(posts) ? posts.join(' ') : String(posts || '')
  if (!text.trim()) return GENERIC_NICHE
  const tokens = nicheTokens(text)

  let best = GENERIC_NICHE
  let bestScore = 0
  for (const [id, niche] of Object.entries(NICHES)) {
    if (id === GENERIC_NICHE) continue
    let score = 0
    if (tokens.has(id)) score += 3
    for (const a of niche.aliases) if (tokens.has(a)) score += 2
    for (const w of contentWords(niche.label)) if (tokens.has(w)) score += 2
    for (const t of niche.tags) if (tokens.has(t.replace(/^#/, '').toLowerCase())) score += 1
    if (score > bestScore) {
      bestScore = score
      best = id
    }
  }
  // Require a couple of real hits so a single coincidental token can't mislabel.
  return bestScore >= 2 ? best : GENERIC_NICHE
}

// ── Post signals (for "What's Working") ──────────────────────────────────────

// Read a few cleaning-robust signals off the posts: how they sound, not just
// what they say. Line structure doesn't survive cleaning, so we stick to signals
// that do — length, emoji, hashtag discipline, question hooks.
function analyzePosts(list) {
  const count = list.length
  let emoji = 0
  let withTags = 0
  let withQ = 0
  let tagTotal = 0
  let lenTotal = 0
  for (const p of list) {
    if (EMOJI_RE.test(p)) emoji++
    const tags = p.match(HASHTAG_RE) || []
    if (tags.length) withTags++
    tagTotal += tags.length
    if (/\?/.test(p)) withQ++
    lenTotal += p.length
  }
  return {
    count,
    avgLen: count ? Math.round(lenTotal / count) : 0,
    emojiRate: count ? emoji / count : 0,
    hashtagRate: count ? withTags / count : 0,
    avgTags: withTags ? Math.round(tagTotal / withTags) : 0,
    questionRate: count ? withQ / count : 0,
  }
}

// ── Section builders (each returns a Markdown body, no heading) ──────────────

function sectionWorking({ list, signals, toneName }) {
  const b = []
  if (toneName) {
    b.push(`You commit to a **${toneName.toLowerCase()}** voice and hold it across posts — a consistent register is what makes a feed recognizable instead of generic.`)
  } else if (signals.count) {
    b.push(`Your voice stays consistent across these posts — the same point of view carries from one caption to the next.`)
  }
  if (signals.avgLen >= 300) {
    b.push(`Your captions are substantial (≈${signals.avgLen} characters). Value-dense writing like this earns saves and dwell time, not just a quick like.`)
  } else if (signals.avgLen > 0 && signals.avgLen < 120) {
    b.push(`Your captions are tight and skimmable, which suits a fast-moving feed.`)
  }
  if (signals.emojiRate >= 0.5) {
    b.push(`Emoji show up naturally, keeping the tone approachable rather than corporate.`)
  }
  if (signals.questionRate >= 0.5) {
    b.push(`Several posts open by setting up a question or tension — a real scroll-stopper.`)
  }
  if (signals.hashtagRate >= 0.5) {
    b.push(`You already tag consistently (≈${signals.avgTags} per post), so the habit is there — the fixes below are about *which* tags, not whether to use them.`)
  }
  if (list.length) {
    b.push(`Posts like *“${clampSnippet(list[0])}”* show a clear, repeatable angle worth doubling down on.`)
  }
  if (!b.length) {
    b.push(`You've given Echo ${signals.count || 'a few'} posts to learn from — enough to read a baseline voice and build on it.`)
  }
  return b.map((x) => `- ${x}`).join('\n')
}

function sectionMissing({ list, trends }) {
  const postTokens = new Set(list.flatMap((p) => tokenize(p)))
  const topics = Array.isArray(trends?.topics) ? trends.topics : []
  const label = trends?.label || 'your niche'

  // A topic is "tapped" when at least half its content words appear in the posts.
  const untapped = topics.filter((t) => {
    const words = contentWords(t)
    if (!words.length) return true
    const hits = words.filter((w) => postTokens.has(w)).length
    return hits < Math.max(1, Math.ceil(words.length / 2))
  })

  const b = []
  const show = untapped.slice(0, 3)
  if (show.length) {
    b.push(`Today's **${label}** feed is moving toward ${listPhrase(show.map((t) => `**${t}**`))} — none of these show up in your recent posts.`)
  } else if (topics.length) {
    b.push(`You're already touching most of today's **${label}** themes — the gap now is cadence and format, not subject matter.`)
  }
  const sound = Array.isArray(trends?.sounds) ? trends.sounds[0] : null
  if (sound) {
    b.push(`If your archive is mostly static posts and carousels, short-form video is the clearest format gap — e.g. a Reel over *${lcFirst(sound)}*.`)
  }
  b.push(`You're also not riding any one trend long enough to compound — picking a single theme above and posting it three ways would outperform three unrelated posts.`)
  return b.map((x) => `- ${x}`).join('\n')
}

function sectionHashtags({ ht, trends }) {
  const label = trends?.label || 'your niche'
  const b = []

  if (!ht.current.length) {
    const adds = ht.add.slice(0, 5).map((h) => `${h.tag} (${h.momentum})`)
    b.push(`**You're not using hashtags** — that's discovery left on the table. Start with today's trend-backed **${label}** tags: ${adds.join(', ') || '—'} (the number is momentum, 0–100).`)
    return b.map((x) => `- ${x}`).join('\n')
  }
  if (ht.keep.length) {
    b.push(`**Keep:** ${ht.keep.join(', ')} — still trend-aligned for ${label}.`)
  }
  if (ht.retire.length) {
    b.push(`**Retire:** ${ht.retire.slice(0, 6).join(', ')} — absent from today's ${label} trends; they read broad/evergreen and aren't pulling reach.`)
  }
  if (ht.add.length) {
    const adds = ht.add.map((h) => `${h.tag} (${h.momentum})`)
    b.push(`**Add:** ${adds.join(', ')} — trend-backed and on-topic (number = momentum).`)
  }
  if (!b.length) {
    b.push(`Your current tags are fine, but none are standout trend drivers right now — rotate in a couple of higher-momentum ${label} tags next post.`)
  }
  return b.map((x) => `- ${x}`).join('\n')
}

function inspirationNudge(inspiration) {
  const refs = typeof inspiration?.refs === 'string' ? inspiration.refs.trim() : ''
  const visuals = Array.isArray(inspiration?.visuals) ? inspiration.visuals.length : 0
  if (refs) {
    const style = EMOJI_RE.test(refs)
      ? 'the emoji-forward, casual energy'
      : refs.split(/\s+/).length >= 12
        ? 'the long-form, story-driven structure'
        : 'the style'
    return `Echo the references you shared — lean into ${style} you flagged as inspiration.`
  }
  if (visuals) {
    return `Match the visual language of the ${visuals} example${visuals > 1 ? 's' : ''} you uploaded — same framing and color story.`
  }
  return null
}

function sectionPivot({ trends, toneName, ht, inspiration }) {
  const topTopic = (Array.isArray(trends?.topics) ? trends.topics : [])[0]
  const topSound = (Array.isArray(trends?.sounds) ? trends.sounds : [])[0]
  const tagSource = ht.add.length ? ht.add : Array.isArray(trends?.hashtags) ? trends.hashtags : []
  const tags = tagSource.slice(0, 3).map((h) => h.tag)
  const voice = toneName ? `your ${toneName.toLowerCase()} voice` : 'your voice'

  const parts = []
  parts.push(
    topTopic
      ? `Make your next post a 20–30s Reel on **${topTopic}**: open with a question hook in ${voice}, deliver one concrete takeaway, and close on a save-worthy line.`
      : `Make your next post a 20–30s Reel: open with a question hook in ${voice}, deliver one concrete takeaway, and close on a save-worthy line.`,
  )
  if (topSound) parts.push(`Score it with ${lcFirst(topSound)} to ride the format surfacing right now.`)
  if (tags.length) parts.push(`Tag it ${tags.join(' ')}.`)
  const nudge = inspirationNudge(inspiration)
  if (nudge) parts.push(nudge)
  return parts.join(' ')
}

function composeMarkdown({ sections, trends }) {
  const label = trends?.label || 'your niche'
  const lead = `Here's how your recent posts stack up against today's **${label}** trends.`
  return [
    lead,
    `## What's Working\n${sections.whatsWorking}`,
    `## What's Missing\n${sections.whatsMissing}`,
    `## Hashtag Audit\n${sections.hashtagAudit}`,
    `## Strategic Pivot\n${sections.strategicPivot}`,
  ].join('\n\n')
}

/*
 * The audit. Deterministic — same inputs ⇒ same critique (no Math.random) — so
 * it's testable and trustworthy, mirroring api/generate.js. `trends` is the
 * per-niche slice (selectNiche output / the /api/trends response shape); it's an
 * INPUT here so a test can swap niches without a live source.
 */
export function generateMockAudit({ brandVoice = {}, posts = [], trends = {}, inspiration = {} } = {}) {
  const list = (Array.isArray(posts) ? posts : []).filter((p) => typeof p === 'string' && p.trim())
  const signals = analyzePosts(list)
  const toneName = toneLabel(brandVoice?.tone)
  const ht = auditHashtags(list, trends)

  const sections = {
    whatsWorking: sectionWorking({ list, signals, toneName }),
    whatsMissing: sectionMissing({ list, trends }),
    hashtagAudit: sectionHashtags({ ht, trends }),
    strategicPivot: sectionPivot({ trends, toneName, ht, inspiration }),
  }

  return {
    markdown: composeMarkdown({ sections, trends }),
    sections,
    hashtags: ht,
    meta: {
      source: 'mock',
      niche: trends?.niche ?? null,
      label: trends?.label ?? null,
      postCount: list.length,
      tone: toneName,
      hasInspiration: hasInspirationSignal(inspiration),
    },
  }
}

// ── The real-model seam ──────────────────────────────────────────────────────

function describeVoice(brandVoice) {
  const tone = toneLabel(brandVoice?.tone)
  const samples = Array.isArray(brandVoice?.samples)
    ? brandVoice.samples
    : typeof brandVoice?.samples === 'string' && brandVoice.samples.trim()
      ? [brandVoice.samples.trim()]
      : []
  const parts = [tone ? `Tone: ${tone}.` : 'Tone: not specified.']
  if (brandVoice?.source) parts.push(`Samples sourced from ${brandVoice.source}.`)
  if (samples.length) parts.push(`Voice samples:\n${samples.map((s) => `  - ${s}`).join('\n')}`)
  return parts.join(' ')
}

function describeTrends(trends) {
  const tags = (Array.isArray(trends?.hashtags) ? trends.hashtags : [])
    .map((h) => `${h.tag} (${h.momentum})`)
    .join(', ')
  const topics = (Array.isArray(trends?.topics) ? trends.topics : []).join(', ')
  const sounds = (Array.isArray(trends?.sounds) ? trends.sounds : []).join(', ')
  return `Niche: ${trends?.label || 'general'}. Trending hashtags: ${tags || 'n/a'}. Trending topics: ${topics || 'n/a'}. Trending sounds/formats: ${sounds || 'n/a'}.`
}

function describeInspiration(inspiration) {
  if (!hasInspirationSignal(inspiration)) return '(none provided)'
  const refs = typeof inspiration?.refs === 'string' ? inspiration.refs.trim() : ''
  const visuals = Array.isArray(inspiration?.visuals) ? inspiration.visuals.length : 0
  const parts = []
  if (refs) parts.push(`Reference captions the user admires: ${refs}`)
  if (visuals) parts.push(`${visuals} reference image(s) uploaded.`)
  return parts.join(' ')
}

/*
 * Assemble the EXACT system prompt the spec specifies, with the four inputs
 * interpolated. This is the seam for the real LLM (a cheap model — Gemini Flash /
 * GPT-4o-mini): the endpoint would send this prompt and return the model's
 * Markdown in the SAME shape generateMockAudit returns. Kept here, pure and
 * tested, so the mock and the eventual model build from one source of truth.
 */
export function buildAuditPrompt({ brandVoice = {}, posts = [], trends = {}, inspiration = {} } = {}) {
  const list = (Array.isArray(posts) ? posts : []).filter((p) => typeof p === 'string' && p.trim())
  const history = list.length ? list.map((p, i) => `${i + 1}. ${p}`).join('\n') : '(none provided)'

  return `You are an expert Social Media Strategist. Your job is to audit the user's past Instagram content and compare it to today's market trends.

**Inputs Provided:**
1. User's Brand Voice: ${describeVoice(brandVoice)}
2. User's Historical Posts:
${history}
3. Today's Market Trends: ${describeTrends(trends)}
4. User's Inspiration (Optional): ${describeInspiration(inspiration)}

**Your Task:** Analyze the historical posts. Provide a concise, structured critique detailing:
- **What's Working:** acknowledge where they align with their brand voice.
- **What's Missing:** identify gaps based on Today's Market Trends.
- **Hashtag Audit:** point out outdated tags and suggest new ones based on the trend data.
- **Strategic Pivot:** one actionable piece of advice on how to structure their next post to match the Inspiration and Trends.

Output the response in clean, easy-to-read Markdown format.`
}
