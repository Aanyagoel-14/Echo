/**
 * Voice Profile — the `voice.md`, Echo's spine (CP12, plan §0.1/§5).
 *
 * This is the artifact the whole product turns on: a structured, human-readable,
 * INJECTABLE voice guide distilled from the creator's own posts, stored on the
 * device, and re-injected into every generation. It is the literal "skills.md
 * for you."
 *
 * Two engines produce it behind one seam:
 *   - cloud distiller  → POST /api/voice (OpenRouter, key server-side only)
 *   - on-device engine → analyzeSamples() here — a dependency-free analyzer that
 *     runs entirely in the browser (no network) and is the reliable fallback.
 * The WebLLM on-device upgrade (CP11/CP13) slots in behind this same seam.
 *
 * The existing brandVoice ({ tone, samples }) is demoted to a *scaffold* that
 * feeds this builder; the builder's output is the first-class voiceProfile.
 */

const STORAGE_KEY = 'echo.voiceProfile.v1'
const VERSION = 1

// Human labels for whichever engine produced a profile (shown in the UI).
export const ENGINE_LABEL = {
  'on-device': 'Built on your device · offline',
  'echo-cloud': 'Distilled by Echo',
}

// ---- storage ----------------------------------------------------------------
// The single place that touches localStorage for the profile — screens never
// poke storage directly. A blocked/corrupt store degrades to "no profile", it
// never throws.

export function loadVoiceProfile() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const p = JSON.parse(raw)
    if (!p || typeof p.profileMarkdown !== 'string' || !p.profileMarkdown.trim()) {
      return null
    }
    return p
  } catch {
    return null
  }
}

export function saveVoiceProfile(profile) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(profile))
  } catch {
    // Private mode / quota errors are non-fatal; in-memory state still works.
  }
}

export function clearVoiceProfile() {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    // noop
  }
}

// The boot gate (§0.1): a stored profile sends returning users straight to
// Capture; its absence triggers first-run onboarding.
export function hasVoiceProfile() {
  return loadVoiceProfile() !== null
}

// ---- on-device heuristic engine --------------------------------------------
// Real, measurable signal extracted from the creator's text — emoji habit,
// sentence rhythm, signature vocabulary, hook shapes — all computed locally.

const EMOJI_RE = /\p{Extended_Pictographic}/gu
const STOPWORDS = new Set(
  "the a an and or but if then of to in on for with at by from as is are was were be been being this that these those i you he she it we they my your our their me him her us them so just very really too not no yes do does did done have has had will would can could should may might must im ive its dont get got go going like one out up what when how why who about into over after before than them then there here your you're it's i'm don't"
    .split(/\s+/)
    .filter(Boolean),
)

function djb2(str) {
  let h = 5381
  for (let i = 0; i < str.length; i += 1) h = ((h << 5) + h + str.charCodeAt(i)) | 0
  return (h >>> 0).toString(36)
}

function splitPosts(text) {
  return text
    .split(/\n\s*\n/)
    .map((s) => s.trim())
    .filter(Boolean)
}

function splitSentences(text) {
  return text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter(Boolean)
}

export function analyzeSamples(rawText) {
  const text = (rawText || '').trim()
  const posts = splitPosts(text)
  const sentences = splitSentences(text)
  const words = text.toLowerCase().match(/[a-z][a-z']+/g) || []

  const emojis = text.match(EMOJI_RE) || []
  const emojiPerPost = posts.length ? emojis.length / posts.length : 0

  const sentLens = sentences
    .map((s) => (s.match(/[a-z]+/gi) || []).length)
    .filter(Boolean)
  const avgSentenceLen = sentLens.length
    ? Math.round(sentLens.reduce((a, b) => a + b, 0) / sentLens.length)
    : 0

  const exclaims = (text.match(/!/g) || []).length
  const ellipses = (text.match(/\.\.\.|…/g) || []).length
  const dashes = (text.match(/—|--/g) || []).length
  const allCaps = [
    ...new Set((text.match(/\b[A-Z]{2,}\b/g) || []).filter((w) => w.length <= 12)),
  ].slice(0, 6)
  const hashtags = [...new Set(text.match(/#[\w]+/g) || [])].slice(0, 8)

  const freq = new Map()
  for (const w of words) {
    if (w.length < 3 || STOPWORDS.has(w)) continue
    freq.set(w, (freq.get(w) || 0) + 1)
  }
  // Prefer repeated content words; if the sample is short and nothing repeats,
  // top up with the most distinctive (longer) single-use words so the profile
  // never comes back empty.
  const ranked = [...freq.entries()].sort(
    (a, b) => b[1] - a[1] || b[0].length - a[0].length,
  )
  let vocabulary = ranked
    .filter(([, n]) => n > 1)
    .slice(0, 10)
    .map(([w]) => w)
  if (vocabulary.length < 4) {
    const extra = ranked
      .filter(([w, n]) => n === 1 && w.length >= 5)
      .slice(0, 8 - vocabulary.length)
      .map(([w]) => w)
    vocabulary = [...vocabulary, ...extra]
  }

  const hookPatterns = posts
    .map((p) => p.split('\n')[0].trim())
    .filter(Boolean)
    .map((line) => (line.length > 60 ? `${line.slice(0, 57).trimEnd()}…` : line))
    .slice(0, 4)

  const topics = [
    ...hashtags.map((h) => h.replace(/^#/, '')),
    ...vocabulary.slice(0, 5),
  ].slice(0, 6)

  return {
    postCount: posts.length,
    emojis: [...new Set(emojis)].slice(0, 10),
    emojiPerPost,
    avgSentenceLen,
    exclaimRate: posts.length ? exclaims / posts.length : 0,
    ellipses,
    dashes,
    allCaps,
    hashtags,
    vocabulary,
    hookPatterns,
    topics,
  }
}

function describeEmoji(a) {
  if (a.emojiPerPost >= 2)
    return `Heavy — ~${Math.round(a.emojiPerPost)} per post${a.emojis.length ? ` (${a.emojis.slice(0, 6).join(' ')})` : ''}`
  if (a.emojiPerPost > 0)
    return `Light & intentional${a.emojis.length ? ` (${a.emojis.slice(0, 5).join(' ')})` : ''}`
  return 'None — clean text, no emoji'
}

function describeRhythm(a) {
  if (!a.avgSentenceLen) return 'Unknown — add more sample text'
  if (a.avgSentenceLen <= 8) return `Short & punchy — ~${a.avgSentenceLen} words/sentence`
  if (a.avgSentenceLen <= 16) return `Conversational — ~${a.avgSentenceLen} words/sentence`
  return `Long-form & flowing — ~${a.avgSentenceLen} words/sentence`
}

function describeRegister(a, tone) {
  const bits = []
  if (tone) bits.push(tone)
  if (a.exclaimRate >= 1) bits.push('high-energy')
  if (a.allCaps.length) bits.push('emphatic (uses CAPS)')
  bits.push(a.emojiPerPost > 0 ? 'casual' : 'measured')
  return [...new Set(bits)].join(', ')
}

function oneLiner(a, tone) {
  const rhythm =
    a.avgSentenceLen <= 8
      ? 'punchy, short-sentence'
      : a.avgSentenceLen <= 16
        ? 'conversational'
        : 'long-form'
  const energy = a.exclaimRate >= 1 || a.allCaps.length ? 'high-energy' : 'even-keeled'
  const emoji = a.emojiPerPost >= 1 ? 'emoji-forward' : 'emoji-light'
  const t = tone ? `${tone}, ` : ''
  return `A ${t}${rhythm}, ${energy} voice that's ${emoji}.`
}

function donts(a) {
  const list = []
  if (a.emojiPerPost === 0) list.push("Don't add emoji — this voice runs clean.")
  if (a.avgSentenceLen && a.avgSentenceLen <= 9)
    list.push('Avoid long, winding sentences — keep it tight.')
  list.push('No corporate filler, buzzwords, or hashtag stuffing.')
  list.push("Don't overclaim — stay true to how they actually talk.")
  return list
}

function analysisToTraits(a, tone) {
  return normalizeTraits({
    voiceOneLiner: oneLiner(a, tone),
    register: describeRegister(a, tone),
    vocabulary: a.vocabulary,
    avoid: donts(a),
    emojiHabit: describeEmoji(a),
    sentenceRhythm: describeRhythm(a),
    hookPatterns: a.hookPatterns,
    topics: a.topics,
  })
}

// ---- the injectable voice.md ------------------------------------------------
// Renders structured traits into the markdown that gets injected verbatim into
// every generation prompt. Sections follow the plan's §5 distillation spec.

export function traitsToMarkdown(traits) {
  const t = normalizeTraits(traits)
  const list = (arr, empty = '—') =>
    arr.length ? arr.map((x) => `- ${x}`).join('\n') : empty
  return `# Creator Voice Profile

**Voice in one line:** ${t.voiceOneLiner || '—'}

## Tone & register
${t.register || '—'}

## Signature words & phrases
${t.vocabulary.length ? t.vocabulary.join(', ') : '—'}

## Sentence rhythm
${t.sentenceRhythm || '—'}

## Emoji & punctuation habits
${t.emojiHabit || '—'}

## Hook patterns
${list(t.hookPatterns)}

## Topics & POV
${t.topics.length ? t.topics.join(', ') : '—'}

## Hard don'ts
${list(t.avoid)}
`
}

function normalizeTraits(t = {}) {
  const arr = (x) =>
    Array.isArray(x) ? x.map((v) => String(v).trim()).filter(Boolean) : []
  const str = (x) => (typeof x === 'string' ? x.trim() : '')
  return {
    voiceOneLiner: str(t.voiceOneLiner),
    register: str(t.register),
    vocabulary: arr(t.vocabulary),
    avoid: arr(t.avoid),
    emojiHabit: str(t.emojiHabit),
    sentenceRhythm: str(t.sentenceRhythm),
    hookPatterns: arr(t.hookPatterns),
    topics: arr(t.topics),
  }
}

// ---- artifact assembly ------------------------------------------------------

// Stamp a profile artifact (the localStorage shape) from finished parts. Used by
// both engines: the cloud distiller passes its markdown+traits; the on-device
// builder passes what it computed locally.
export function composeProfile({
  profileMarkdown,
  traits,
  samples = '',
  tone = null,
  platform = null,
  engine = 'on-device',
}) {
  const now = new Date().toISOString()
  return {
    version: VERSION,
    builtAt: now,
    updatedAt: now,
    revisions: 0,
    source: {
      sampleCount: splitPosts(samples).length,
      sampleHash: djb2(samples),
      tone: tone ?? null,
      platform: platform ?? null,
      engine,
    },
    profileMarkdown: profileMarkdown.trim(),
    traits: normalizeTraits(traits),
  }
}

// The on-device path end-to-end: analyze → traits → markdown → artifact.
export function buildLocalProfile({ samples, tone = null, platform = null }) {
  const a = analyzeSamples(samples)
  const traits = analysisToTraits(a, tone)
  const profileMarkdown = traitsToMarkdown(traits)
  return composeProfile({ profileMarkdown, traits, samples, tone, platform, engine: 'on-device' })
}
