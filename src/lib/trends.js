/*
 * Feature 1 — Trend Harvesting Engine (core, pure).
 *
 * The app keeps a self-updating store of current content trends so that at
 * query time it pays ZERO per-request API fees: the audit (Feature 3) reads
 * *our own* cached batch, never a live source. This module is the pure core of
 * that engine — no network, no filesystem, browser-safe — so it's node-testable
 * and reusable by the client (the future Page 2 Genre Selector reads NICHES
 * from here, the single source of truth for the niche taxonomy).
 *
 * Three responsibilities, all pure:
 *   1. NICHES + normalizeNiche — the canonical niche list and free-text → id
 *      resolution (handles the Page 2 "Other" field).
 *   2. generateMockBatch — a deterministic, date-seeded batch of trends. Same
 *      day ⇒ same trends (idempotent refresh); a new day ⇒ a visibly updated
 *      batch. This is the mock-first stand-in until live harvesting is wired in
 *      (see trendSources.js); both produce the SAME TrendBatch shape, so the
 *      store and the query path never change when the real sources land.
 *   3. isStale + selectNiche — the 24h refresh window check and the per-niche
 *      query a consumer runs against a stored batch.
 *
 * TrendBatch shape (the contract the rest of the system depends on):
 *   {
 *     version: 1,
 *     harvestedAt: ISO string,            // the timestamp the spec's test checks
 *     dateKey: 'YYYY-MM-DD',              // the day the batch represents
 *     source: 'mock' | 'live' | 'mixed', // provenance (see trendSources.js)
 *     niches: {
 *       [id]: {
 *         hashtags: [{ tag: '#…', momentum: 0–100 }],  // trend-backed tags
 *         topics:   [string],                          // trending themes
 *         sounds:   [string],                          // trending audio (Reels)
 *       }
 *     }
 *   }
 */

export const TREND_BATCH_VERSION = 1

// Refresh window: the aggregator refreshes on a 24h schedule (Vercel Cron hits
// /api/trends-harvest daily). A batch older than this reads as stale.
export const REFRESH_INTERVAL_MS = 24 * 60 * 60 * 1000

export const GENERIC_NICHE = 'general'

/*
 * The canonical niche taxonomy. Each niche carries:
 *   - label:   human name (the Genre Selector option text).
 *   - aliases: extra words that should resolve to this id (normalizeNiche).
 *   - tags:    a pool of candidate hashtags the daily mock samples + ranks.
 *   - topics:  a pool of candidate trending themes.
 * `sounds` are audio trends, which aren't niche-bound, so they're shared
 * (SHARED_SOUNDS) and sampled per niche for variety.
 *
 * Pools are intentionally larger than what a batch surfaces so the date-seeded
 * sampler can rotate them day to day (that's what makes a refresh "update").
 */
export const NICHES = {
  skincare: {
    label: 'Skincare & Beauty',
    aliases: ['beauty', 'skin', 'makeup', 'cosmetics', 'glowup', 'glow'],
    tags: ['#skincare', '#skintok', '#glowup', '#skincareroutine', '#beautytok', '#glassskin', '#cleangirl', '#retinol', '#spf', '#derm', '#nichefragrance', '#barrierrepair'],
    topics: ['Barrier-repair routines', 'Slugging before bed', 'Mineral vs chemical SPF', 'Skin-cycling schedules', 'Korean 10-step, simplified', 'Fragrance-free everything', 'Morning shed routine', 'LED mask reviews'],
  },
  fitness: {
    label: 'Fitness & Wellness',
    aliases: ['gym', 'workout', 'wellness', 'health', 'training', 'lifting'],
    tags: ['#fitness', '#gymtok', '#fittok', '#workout', '#progressivetension', '#hyrox', '#75hard', '#mobility', '#zone2', '#recovery', '#fyp', '#strengthtraining'],
    topics: ['Zone 2 cardio explainers', 'HYROX prep', 'Cozy cardio', '75 Hard check-ins', 'Mobility before mileage', 'Protein-per-meal math', 'Deload weeks', 'Walking pad desks'],
  },
  food: {
    label: 'Food & Recipes',
    aliases: ['recipe', 'recipes', 'cooking', 'baking', 'foodie', 'kitchen', 'meal'],
    tags: ['#foodtok', '#recipe', '#easyrecipes', '#mealprep', '#whatieatinaday', '#highprotein', '#cottagecheese', '#girldinner', '#5ingredients', '#airfryer', '#foodie', '#viralrecipe'],
    topics: ['Cottage-cheese everything', 'High-protein swaps', '5-ingredient dinners', 'Air-fryer hacks', 'Girl dinner boards', 'Dense bean salads', 'Freezer-prep Sundays', 'Viral dupe recipes'],
  },
  fashion: {
    label: 'Fashion & Style',
    aliases: ['style', 'outfit', 'ootd', 'clothing', 'apparel', 'streetwear'],
    tags: ['#fashiontok', '#ootd', '#styletok', '#capsulewardrobe', '#quietluxury', '#mobwife', '#oldmoney', '#thrifted', '#getreadywithme', '#outfitinspo', '#stylingtips', '#hauls'],
    topics: ['Quiet-luxury staples', 'Capsule-wardrobe builds', 'Mob-wife aesthetic', 'Thrift-flip transformations', 'GRWM voiceovers', 'Color-analysis edits', 'One-item-three-ways', 'Investment-piece math'],
  },
  travel: {
    label: 'Travel',
    aliases: ['trip', 'vacation', 'wanderlust', 'tourism', 'flights', 'nomad'],
    tags: ['#traveltok', '#travelhacks', '#hiddengems', '#solotravel', '#budgettravel', '#vanlife', '#digitalnomad', '#packwithme', '#bucketlist', '#offthebeatenpath', '#traveltips', '#layover'],
    topics: ['Hidden-gem city guides', 'Budget long-haul hacks', 'Solo-travel safety', 'Pack-with-me carry-on', 'Layover day trips', 'Shoulder-season picks', 'Points-and-miles starters', 'Slow-travel itineraries'],
  },
  tech: {
    label: 'Tech & Gadgets',
    aliases: ['technology', 'gadgets', 'ai', 'software', 'devices', 'apps'],
    tags: ['#techtok', '#gadgets', '#ai', '#edctech', '#smarthome', '#productivityapps', '#unboxing', '#techreview', '#promptengineering', '#everydaycarry', '#newtech', '#opensource'],
    topics: ['AI tools that actually stick', 'Smart-home starter kits', 'EDC tech loadouts', 'Productivity-app stacks', 'On-device AI', 'Cheap-vs-flagship tests', 'Prompt-engineering basics', 'E-ink everything'],
  },
  edtech: {
    label: 'Education & EdTech',
    aliases: ['education', 'learning', 'teaching', 'study', 'school', 'edu', 'students', 'courses'],
    tags: ['#edutok', '#studytok', '#edtech', '#learnontiktok', '#studytips', '#teachersoftiktok', '#activerecall', '#examprep', '#productivitystudent', '#notetaking', '#onlinelearning', '#scholarship'],
    topics: ['Active-recall workflows', 'AI study buddies', 'Note-taking systems', 'Exam-prep sprints', 'Day-in-the-life student', 'Spaced-repetition apps', 'Teacher classroom hacks', 'Scholarship how-tos'],
  },
  finance: {
    label: 'Personal Finance',
    aliases: ['money', 'investing', 'budgeting', 'fintech', 'crypto', 'wealth', 'savings', 'fire'],
    tags: ['#fintok', '#moneytok', '#personalfinance', '#investing', '#budgeting', '#financialfreedom', '#sidehustle', '#hysa', '#fire', '#cashstuffing', '#paycheckroutine', '#networth'],
    topics: ['Cash-stuffing envelopes', 'HYSA vs brokerage', 'No-buy-year resets', 'Paycheck-routine breakdowns', 'Side-hustle math', 'FIRE number explainers', 'Sinking funds', 'First-100k milestones'],
  },
  gaming: {
    label: 'Gaming',
    aliases: ['games', 'gamer', 'esports', 'streaming', 'twitch', 'console', 'pc'],
    tags: ['#gamingtok', '#gamer', '#gamingsetup', '#cozygaming', '#speedrun', '#indiegames', '#pcbuild', '#retrogaming', '#clutch', '#gamingnews', '#streamer', '#patchnotes'],
    topics: ['Cozy-gaming corners', 'Budget PC builds', 'Indie hidden gems', 'Speedrun breakdowns', 'Patch-note reactions', 'Handheld vs console', 'Backlog clears', 'Setup tours'],
  },
  home: {
    label: 'Home & Interior',
    aliases: ['interior', 'decor', 'homedecor', 'diy', 'organization', 'cleaning', 'reno'],
    tags: ['#hometok', '#interiordesign', '#homedecor', '#cleantok', '#diyhome', '#organization', '#rentalfriendly', '#cozyhome', '#beforeandafter', '#smallspaces', '#restock', '#homereno'],
    topics: ['Rental-friendly upgrades', 'Restock-with-me routines', 'Small-space hacks', 'Before-and-afters', 'Warm-minimalism rooms', 'Peel-and-stick wins', 'Cleaning-motivation resets', 'Thrifted decor flips'],
  },
  parenting: {
    label: 'Parenting',
    aliases: ['parent', 'mom', 'dad', 'kids', 'baby', 'toddler', 'family', 'momtok'],
    tags: ['#momtok', '#parentingtips', '#toddlermom', '#gentleparenting', '#momsoftiktok', '#dadtok', '#newmom', '#momlife', '#kidsactivities', '#parenthacks', '#postpartum', '#familyroutine'],
    topics: ['Gentle-parenting scripts', 'Toddler-activity setups', 'Realistic morning routines', 'Postpartum honesty', 'Screen-time boundaries', 'Lunchbox ideas', 'Sleep-regression survival', 'Dad-POV humor'],
  },
  pets: {
    label: 'Pets',
    aliases: ['pet', 'dog', 'cat', 'puppy', 'kitten', 'doglife', 'animals'],
    tags: ['#pettok', '#dogtok', '#cattok', '#puppytok', '#petsoftiktok', '#dogtraining', '#adoptdontshop', '#petcare', '#dogmom', '#enrichment', '#rescuedog', '#vettips'],
    topics: ['Dog-enrichment ideas', 'Reactive-dog training', 'Adopt-don\'t-shop stories', 'Cat-room makeovers', 'Vet-cost transparency', 'Day-in-the-life pet', 'Homemade pet treats', 'Senior-pet care'],
  },
  business: {
    label: 'Business & Entrepreneurship',
    aliases: ['entrepreneur', 'startup', 'smallbusiness', 'marketing', 'founder', 'ecommerce', 'saas'],
    tags: ['#businesstok', '#entrepreneur', '#smallbusiness', '#startuptok', '#marketingtips', '#ecommerce', '#solopreneur', '#buildinpublic', '#founderjourney', '#shopify', '#brandstrategy', '#b2b'],
    topics: ['Build-in-public updates', 'Day-in-the-life founder', 'Packing-orders ASMR', 'Marketing that converts', 'Pricing-page teardowns', 'First-customer stories', 'Solopreneur stacks', 'Brand-voice basics'],
  },
  art: {
    label: 'Art & Design',
    aliases: ['design', 'illustration', 'drawing', 'painting', 'creative', 'graphic', 'artist'],
    tags: ['#arttok', '#artistsoftiktok', '#procreate', '#illustration', '#digitalart', '#sketchbook', '#designtok', '#typography', '#commission', '#artprocess', '#colorpalette', '#studywithme'],
    topics: ['Sketchbook tours', 'Procreate time-lapses', 'Commission pricing', 'Color-palette breakdowns', 'Art-block resets', 'Studio-vlog cuts', 'Typography teardowns', 'Beginner-to-now edits'],
  },
  music: {
    label: 'Music',
    aliases: ['musician', 'producer', 'singer', 'songwriter', 'band', 'beats', 'studio'],
    tags: ['#musictok', '#newmusic', '#producertok', '#songwriting', '#bedroompop', '#coversong', '#musicproduction', '#unsignedartist', '#studiolife', '#vocals', '#beatmaker', '#viralsong'],
    topics: ['Make-a-beat-with-me', 'Songwriting from a prompt', 'Bedroom-pop mixing', 'Cover-to-original pipelines', 'Studio-day vlogs', 'Sample-flip breakdowns', 'Unsigned-artist promo', 'Hook-writing tips'],
  },
  [GENERIC_NICHE]: {
    label: 'General / Everyday',
    aliases: ['lifestyle', 'daily', 'creator', 'content', 'viral', 'misc', 'other'],
    tags: ['#fyp', '#foryou', '#viral', '#trending', '#contentcreator', '#storytime', '#dayinmylife', '#pov', '#relatable', '#tutorial', '#aesthetic', '#vlog'],
    topics: ['POV storytelling', 'Day-in-my-life cuts', 'Storytime hooks', 'Relatable-humor skits', 'Get-ready-with-me talks', 'Tutorial-in-60-seconds', 'Aesthetic b-roll', 'Trend-format remixes'],
  },
}

// Audio trends aren't niche-specific, so they live in one shared pool and the
// daily sampler picks a few per niche. Described generically (named sounds date
// fast) — the format is the signal a creator can act on.
const SHARED_SOUNDS = [
  "Sped-up nostalgic pop remix",
  'Calm lo-fi piano under a voiceover',
  "Punchy 'wait for it' build-and-drop",
  'Trending voiceover format: "POV: …"',
  'Soft acoustic cover, intimate vocals',
  'Upbeat phonk for fast-cut montages',
  'ASMR-leaning ambient with no music',
  'Dramatic orchestral swell for reveals',
  'Spoken-word trend audio (storytime)',
  'Y2K dance-pop throwback',
]

// ── Deterministic randomness ──────────────────────────────────────────────
// A batch must be reproducible for a given day (idempotent refresh) yet differ
// across days (a refresh "updates"). So we derive all sampling from a seed
// hashed off the date + niche, never Math.random.

// FNV-1a 32-bit string hash → a stable numeric seed.
function hashString(str) {
  let h = 0x811c9dc5
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

// mulberry32: tiny, fast, well-distributed seeded PRNG → floats in [0, 1).
function mulberry32(seed) {
  let a = seed >>> 0
  return function next() {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// Seeded Fisher-Yates: return the first `count` items of a shuffled copy. Pure
// in `pool` — never mutates the source array.
function seededSample(pool, count, seed) {
  const arr = pool.slice()
  const rand = mulberry32(seed)
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr.slice(0, Math.min(count, arr.length))
}

// Surface counts per niche per batch — small, actionable lists, not the pools.
const COUNTS = { hashtags: 6, topics: 4, sounds: 3 }

// Turn a niche's pools into a ranked daily slice. Hashtags carry a `momentum`
// score (a believable 60–98, descending with rank + a little seeded jitter) so
// the audit can say which tags are hot, not just which exist.
function buildNicheSlice(id, niche, dateKey) {
  const tagSeed = hashString(`${dateKey}:${id}:tags`)
  const picked = seededSample(niche.tags, COUNTS.hashtags, tagSeed)
  const jitter = mulberry32(tagSeed ^ 0x9e3779b9)
  const hashtags = picked.map((tag, i) => {
    const base = 96 - i * 7 // rank decay
    const wobble = Math.round(jitter() * 6) - 3
    return { tag, momentum: Math.max(55, Math.min(99, base + wobble)) }
  })

  return {
    hashtags,
    topics: seededSample(niche.topics, COUNTS.topics, hashString(`${dateKey}:${id}:topics`)),
    sounds: seededSample(SHARED_SOUNDS, COUNTS.sounds, hashString(`${dateKey}:${id}:sounds`)),
  }
}

// Local YYYY-MM-DD from a Date — the day a batch represents.
function toDateKey(date) {
  return date.toISOString().slice(0, 10)
}

/*
 * Build a full mock TrendBatch for `now`. Deterministic by day: re-running on
 * the same date returns identical trends (a no-op refresh), while a new date
 * yields a visibly different batch — which is exactly the spec's "re-run after
 * the refresh window and confirm the data updates" check, with no live source
 * needed. trendSources.harvestBatch() starts from this and folds in any live
 * signals it manages to pull.
 */
export function generateMockBatch({ now = new Date() } = {}) {
  const dateKey = toDateKey(now)
  const niches = {}
  for (const [id, niche] of Object.entries(NICHES)) {
    niches[id] = buildNicheSlice(id, niche, dateKey)
  }
  return {
    version: TREND_BATCH_VERSION,
    harvestedAt: now.toISOString(),
    dateKey,
    source: 'mock',
    niches,
  }
}

/*
 * Resolve free-text (a Genre Selector pick, an "Other" entry, a raw hashtag,
 * or a brand voice's stated niche) to a known niche id. Matching, in order:
 *   1. exact id;
 *   2. any token of the input equals an id, label word, or alias.
 * No confident match ⇒ the generic niche, so callers always get usable trends.
 */
export function normalizeNiche(input) {
  if (!input || typeof input !== 'string') return GENERIC_NICHE
  const cleaned = input.toLowerCase().replace(/[#@]/g, ' ').trim()
  if (!cleaned) return GENERIC_NICHE
  if (NICHES[cleaned]) return cleaned

  const tokens = new Set(cleaned.split(/[^a-z0-9]+/).filter(Boolean))
  for (const [id, niche] of Object.entries(NICHES)) {
    if (id === GENERIC_NICHE) continue
    if (tokens.has(id)) return id
    const labelWords = niche.label.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)
    if (labelWords.some((w) => tokens.has(w))) return id
    if (niche.aliases.some((a) => tokens.has(a))) return id
  }
  return GENERIC_NICHE
}

// Has this batch aged past the 24h refresh window (or is it missing/invalid)?
export function isStale(batch, now = new Date()) {
  const ts = batch?.harvestedAt ? Date.parse(batch.harvestedAt) : NaN
  if (Number.isNaN(ts)) return true
  return now.getTime() - ts > REFRESH_INTERVAL_MS
}

/*
 * Query a stored batch for one niche — the read path Feature 3 (the audit)
 * uses. Resolves the niche, falls back to the generic slice if the requested
 * one is absent, and always returns a usable, well-shaped result.
 */
export function selectNiche(batch, nicheInput) {
  const id = normalizeNiche(nicheInput)
  const slice = batch?.niches?.[id] || batch?.niches?.[GENERIC_NICHE] || {}
  return {
    niche: id,
    label: (NICHES[id] || NICHES[GENERIC_NICHE]).label,
    hashtags: Array.isArray(slice.hashtags) ? slice.hashtags : [],
    topics: Array.isArray(slice.topics) ? slice.topics : [],
    sounds: Array.isArray(slice.sounds) ? slice.sounds : [],
  }
}

// The Genre Selector's option list (Page 2 / future Feature 5). Generic niche
// last — it's the catch-all behind the "Other" free-text field.
export function nicheOptions() {
  return Object.entries(NICHES).map(([id, n]) => ({ id, label: n.label }))
}
