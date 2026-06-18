# Feature 3 — Suggestion Model (the AI Audit)

The first payoff (Page 3). It reads the creator's past posts, pulls **today's
cached trends** (Feature 1), and returns a structured, readable critique:
**What's Working · What's Missing · Hashtag Audit · Strategic Pivot.**

> Mock-first, exactly like `api/generate.js`. The critique is templated from the
> *real inputs* today — no model call, no secret — so it genuinely reflects the
> creator's posts, voice, and the live niche trends, not a canned demo. The real
> LLM the spec names (a cheap model — Gemini Flash / GPT-4o-mini) slots in behind
> `buildAuditPrompt()`, which already assembles the exact spec system prompt with
> the inputs interpolated. Wiring the model returns the SAME response shape, so
> the client never changes.

## The contract — the audit response

```jsonc
{
  "markdown": "Here's how your recent posts stack up …\n\n## What's Working\n…",
  "sections": {                 // the same four blocks, split for the UI (Page 3)
    "whatsWorking":   "- …",
    "whatsMissing":   "- …",
    "hashtagAudit":   "- **Keep:** … **Retire:** … **Add:** …",
    "strategicPivot": "Make your next post a 20–30s Reel on …"
  },
  "hashtags": {                 // structured data behind the Hashtag Audit
    "current": ["#BuildingInPublic", "#FounderJourney", …],   // mined from posts
    "keep":    ["#FounderJourney"],                           // still trend-backed
    "retire":  ["#ArtificialIntelligence", …],                // absent from trends
    "add":     [{ "tag": "#ecommerce", "momentum": 93 }, …]   // trend-backed, missing
  },
  "meta": {
    "source": "mock",           // provenance of the CRITIQUE (→ "model" when wired)
    "niche": "business", "label": "Business & Entrepreneurship",
    "postCount": 4, "tone": "Professional", "hasInspiration": true,
    "trends": { "source": "mixed", "harvestedAt": "…", "stale": false }  // the TREND slice
  }
}
```

`markdown` is the spec's literal deliverable. `sections` is the same content
split so Page 3 can render four cards without re-parsing Markdown. `hashtags` is
the data behind the audit (the easiest thing to assert on, and what the UI chips
render from).

## Pieces

| File | Role |
|---|---|
| `src/lib/audit.js` | Pure core (browser-safe, node-testable). `generateMockAudit` (the four-section critique), `auditHashtags` (keep/retire/add), `extractHashtags`, `inferNiche`, and `buildAuditPrompt` (the LLM seam — the verbatim spec prompt). Deterministic: same inputs ⇒ same critique. |
| `api/audit.js` | `POST /api/audit`. Resolves the niche, reads today's trends from **our own cache** (Feature 1), runs the audit, returns the contract above. Never calls a live source. |

In dev, `/api/audit` is mounted by the `devApi()` plugin in `vite.config.js`
(same bridge as `/api/generate`), and `src/lib/api.js#requestAudit` is the single
client → endpoint seam (mirrors `generateKit`).

## How the inputs are assembled (the spec's four inputs)

1. **Brand Voice** (Page 1) — `{ tone, samples, source }`. Drives "What's
   Working" and the voice of the Strategic Pivot.
2. **Historical posts** (Feature 2 output) — the **full parsed posts**
   (`detectAndExtract`'s raw extract), *not* the ≤4 `cleanPosts` voice samples.
   `cleanPosts` clamps captions to 600 chars, which cuts the trailing hashtag
   block — exactly the data the Hashtag Audit needs. So the audit takes the full
   captions; the voice-sample cleaner is a separate path for synthesis.
3. **Today's trends** (Feature 1 output) — the per-niche slice from the cache
   (`selectNiche`). Drives "What's Missing", the Hashtag Audit, and the Pivot.
4. **Inspiration** (Page 2, optional) — steers the Strategic Pivot when present;
   omitted, the critique is still complete and coherent.

**Niche resolution.** An explicit Genre Selector pick (Page 2) wins. If Page 2
was skipped, `inferNiche` reads the niche off the posts (scoring the taxonomy's
ids/aliases/labels/tag-stems, splitting camelCase hashtags), so the always-on
Page 3 audit works with Page 1 alone. A weak signal falls back to the generic
niche.

## Zero per-request fees

The audit reads trends from the Feature 1 cache (`readBatch()`), falling back to
a freshly generated mock batch only on a cold instance — never a live source at
query time. So composing the critique costs nothing per request, which is the
whole point of the harvesting engine.

## Configuration

No env vars required — matching the app's zero-config stance. The critique is
deterministic and offline today; the model seam (below) is where a key would
eventually live, server-side only (never `VITE_`-prefixed).

## Testing it on its own

```bash
npm run test:audit
```

Covers the spec's three "test on its own" criteria — (1) mock posts + trends +
voice ⇒ all four sections in valid Markdown; (2) omitting inspiration still
yields a coherent critique; (3) swapping the niche changes the Hashtag Audit —
plus the hashtag partition invariants, `inferNiche`, the `buildAuditPrompt` seam,
and an end-to-end **F2 → F1 → F3** pass on the real fixture (`posts_1.json` →
inferred `business` niche → niche-correct critique). All offline.

End-to-end against a running dev server (`npm run dev`):

```bash
curl -X POST localhost:5173/api/trends-harvest          # seed the trend cache (F1)
curl -X POST localhost:5173/api/audit -H 'Content-Type: application/json' \
  -d '{"brandVoice":{"tone":"playful"},"niche":"skincare",
       "posts":["my 3-step glow routine ✨ #skincare #glowup"]}'
```

## The model seam → wiring a real LLM

`buildAuditPrompt({ brandVoice, posts, trends, inspiration })` returns the exact
spec system prompt with the four inputs filled in. To go live, in `api/audit.js`:

```js
const md = await callModel(buildAuditPrompt({ brandVoice, posts: list, trends, inspiration }))
// …then split `md` into sections (or have the model return them) and respond
// with the SAME { markdown, sections, hashtags, meta } shape.
```

The request/response contract and `buildAuditPrompt` are the seam — the client
(`requestAudit`) and Page 3 don't change when the mock becomes a model call.

## How it connects

This is the engine behind **Page 3 (the Audit)** — the natural end of Audit Mode.
From the critique, the user either stops, or carries it into **Page 4 → Feature 4
(Generation Model)** to create a new post. The Strategic Pivot is written to read
as the bridge into that next step.
