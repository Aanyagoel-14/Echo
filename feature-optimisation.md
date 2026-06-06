# Feature Optimisation — Post Ingestion for `voice.md` Generation

**Status:** Draft for execution
**Owner:** _(you)_
**Last updated:** 2026-06-06

---

## 1. Context (current state)

The system can generate a `voice.md` file (the user's writing-voice profile) once it has
the content of their posts. Today the only intake path is **manual copy-paste into a box**,
which is slow, error-prone, and produces messy input (UI cruft like `1.2K`, `Show more`,
timestamps, reaction counts) that the generator has to tolerate.

We want a faster, cleaner intake. Two directions were proposed:

1. **Account connect** — let the user pick a platform (Instagram / X / LinkedIn), then pull
   their posts automatically via the platform's API, and map voice features per platform.
2. **Smart paste** — keep a paste box but run the input through an LLM (via OpenRouter) to
   parse/clean it into structured posts before generating `voice.md`.

This doc records the feasibility findings and a recommended architecture that reconciles
both into one pipeline.

---

## 2. Assumptions

These are stated because the repo wasn't available while drafting. Correct any that are wrong.

- There is an existing `voice.md` generator that accepts post text and emits the profile.
- We can introduce an intermediate **structured posts representation** between intake and
  the generator (this is the key enabler).
- We can call OpenRouter server-side (API key held in backend env, never the client).
- Most target users have **personal** (not Business/Creator) social accounts.

---

## 3. Feasibility findings (verified mid-2026)

The "connect account and auto-pull posts" idea works cleanly for **only one** of the three
platforms. This is the single most important finding and it drives the whole design.

### X / Twitter — ✅ Feasible (recommended as the one official auto-pull)
- The API moved to a **pay-per-use** model in early 2026 (no usable free tier for new devs).
- Reading a user's **own** posts ("owned reads") is cheap — on the order of **$0.001 per
  resource** after the April 2026 update.
- Auth is **OAuth 2.0 with PKCE**; the user authorises our app to read their own timeline
  (`tweet.read`, `users.read`, `offline.access`). Endpoint: `GET /2/users/:id/tweets`.
- Rate limits still apply per-app and per-user; pagination needed for full history.
- **Verdict:** Build a real OAuth "Connect X" flow. Low cost, good UX.

### Instagram — ❌ Not feasible for personal accounts via official API
- The **Basic Display API was permanently shut down on 4 Dec 2024.** There is no successor
  that reads **personal** account media.
- All official access now goes through the **Instagram Graph API**, which requires a
  **Business or Creator account linked to a Facebook Page** plus **Meta app review**.
- **Verdict:** Do **not** promise official auto-pull for typical IG users. Use the
  fallbacks in §5 (data-export upload, smart paste). Offer Graph API only as an optional
  path for users who already run a Business/Creator account.

### LinkedIn — ❌ Not feasible without partner approval
- Reading a member's own posts requires the `r_member_social` permission, which LinkedIn
  classifies as **restricted / private** — granted only to select approved partners, with a
  slow, manual, frequently-rejected review.
- The openly available Consumer products (`Sign In with LinkedIn`, `Share on LinkedIn`)
  give basic profile + the ability to **post**, but **not** to read historical posts.
- **Verdict:** Same as Instagram. No official auto-pull baseline. Use data-export upload
  and smart paste.

### Third-party aggregators / scrapers — ⚠️ Possible middle path, real risk
- Services exist that abstract all three (e.g. unofficial X data APIs, IG/LinkedIn
  scrapers, unified creator-data APIs).
- Caveats: they operate against platform ToS to varying degrees (**LinkedIn is especially
  litigious about scraping**; IG has aggressive anti-scraping), coverage/reliability is not
  guaranteed, and they add an external dependency + cost. Treat as **opt-in, clearly
  disclosed**, never the default path.

> **Net:** The "platform selector + connect" vision is only ~1/3 deliverable through
> official channels. So we **decouple platform selection from ingestion method** (next).

---

## 4. Recommended architecture

Two things were conflated in the brief; separating them makes everything click:

1. **Platform selection** drives *voice mapping* (a LinkedIn voice ≠ an X voice ≠ an IG
   voice). This is always useful, cheap, and should ship regardless of how posts are
   ingested.
2. **Ingestion method** is *how posts get in*. This varies per platform per §3.

So the design is a layered pipeline:

```
┌─────────────────┐   ┌──────────────────────┐   ┌──────────────────┐   ┌──────────────┐
│  Input Adapters │ → │  LLM Normaliser      │ → │  posts.json      │ → │  voice.md    │
│  (many)         │   │  (OpenRouter)        │   │ (canonical form) │   │  generator   │
└─────────────────┘   └──────────────────────┘   └──────────────────┘   └──────────────┘
   - X OAuth pull        clean + structure          shared contract        (existing,
   - export-zip upload   into post objects          for the generator       now fed clean
   - smart paste                                                             structured data)
   - (opt) 3rd-party
```

Key idea: **account-connect is just one adapter**, and the **OpenRouter normaliser is the
shared backbone** (it's exactly the user's Option 2, repositioned as the universal cleaner
rather than an alternative to Option 1). Every intake path converges on the same
`posts.json` contract, so the `voice.md` generator only ever sees clean structured data.

### Clarification on "use a model to scrape"
LLMs **don't fetch/scrape** web pages by themselves. They are excellent at **parsing and
structuring** text the user already has (turning messy pasted content or an export file
into clean post objects). If we want fetch-from-URL, that needs a separate scraping layer
(see §3 third-party note, with its risks). The plan uses the LLM for **normalisation**, not
fetching.

---

## 5. Per-platform ingestion strategy

| Platform  | Primary intake                | Fallback(s)                          |
|-----------|-------------------------------|--------------------------------------|
| X/Twitter | OAuth connect → auto-pull      | Smart paste                          |
| Instagram | "Download your data" zip upload | Smart paste; (opt) Business Graph API |
| LinkedIn  | "Download your data" CSV upload | Smart paste; (opt) Share/post via API |
| Other/any | Smart paste                   | File upload                          |

**Data-export upload** is a strong, ToS-clean fallback for IG and LinkedIn: both let a user
download their own data (IG gives a JSON/HTML archive; LinkedIn gives `Shares.csv` etc.).
The user requests it from the platform, uploads the file, and our adapter + normaliser turn
it into `posts.json`. Slightly clunky UX, but fully sanctioned and complete.

---

## 6. The OpenRouter normalisation layer

### Responsibility
Take raw input (pasted text, export-file rows, or API JSON) → emit an array of clean post
objects conforming to the `posts.json` schema (§7). Strip UI noise, de-duplicate, drop
non-authored content (reshares/quotes unless flagged), and preserve real authored text.

### Model choice (keep it swappable)
- This is a **parsing/structuring** task, not deep reasoning — favour a **fast, cheap,
  strong instruction-follower**, not a flagship model. Posts can be long, so cost scales.
- Make the model a backend env var (e.g. `OPENROUTER_NORMALISER_MODEL`) so it can be swapped
  without a deploy. Evaluate 2–3 current low-cost options on OpenRouter against a fixture set
  and pick by cost-per-1k-posts + structure accuracy. **Don't hard-code a "best" model** —
  rankings move monthly.
- Use OpenRouter's OpenAI-compatible endpoint; request **strict JSON output** (JSON mode /
  response_format where the chosen model supports it) and validate against the schema.

### Prompt approach (sketch)
- System prompt: "You are a parser. Given raw social content, return ONLY valid JSON
  matching this schema. Do not invent posts. Exclude reshares unless `include_reshares`."
- Provide the schema inline; instruct no markdown, no preamble.
- Chunk long input (the box may hold hundreds of posts) and merge results; enforce a max
  input size per call to control cost and stay within context.

### Safety / correctness
- Validate every LLM response against the JSON schema; on parse failure, retry once with a
  "return valid JSON only" reminder, then fall back to a deterministic splitter.
- Never trust counts/dates the model infers — only keep what's present in the source.

---

## 7. Canonical `posts.json` schema

```json
{
  "platform": "x | instagram | linkedin | other",
  "handle": "string | null",
  "fetched_at": "ISO-8601",
  "source": "oauth | export_upload | paste | third_party",
  "posts": [
    {
      "id": "string | null",
      "text": "string",            // authored body only, UI noise stripped
      "created_at": "ISO-8601 | null",
      "type": "original | reply | reshare | thread_part",
      "media": ["caption/alt text only, if any"],
      "lang": "string | null"
    }
  ]
}
```

The `voice.md` generator is refactored (small change) to consume this contract instead of a
raw text blob. This is the only change required on the generator side.

---

## 8. Phased execution plan

### Phase 0 — Decoupling groundwork _(small, do first)_
- [ ] Define `posts.json` schema + a validator.
- [ ] Refactor the `voice.md` generator to read `posts.json` instead of raw text.
- [ ] **Acceptance:** existing paste flow works end-to-end through the new contract (paste →
      trivial pass-through adapter → schema → generator → identical `voice.md`).

### Phase 1 — Smart paste via OpenRouter _(highest value / lowest risk — ship this first)_
- [ ] Add backend normaliser service calling OpenRouter (model via env var).
- [ ] Wire paste box → normaliser → `posts.json` → generator.
- [ ] Chunking + JSON validation + retry/fallback.
- [ ] **Acceptance:** messy pasted timeline (with `1.2K`, `Show more`, timestamps) yields a
      clean `posts.json` and a noticeably better `voice.md` than raw paste.

### Phase 2 — Platform selector + voice mapping _(cheap, big UX win)_
- [ ] Add platform selector (X / Instagram / LinkedIn / Other) at the start of the flow.
- [ ] Map per-platform voice features (tone, length norms, formatting conventions) into the
      generator config.
- [ ] **Acceptance:** same posts produce platform-appropriate `voice.md` variants.

### Phase 3 — X OAuth auto-pull _(the one official "connect" that works)_
- [ ] Implement OAuth 2.0 PKCE "Connect X" flow; store refresh token securely.
- [ ] Paginate `GET /2/users/:id/tweets`; feed results through the normaliser.
- [ ] Surface estimated read cost / cap a sane post limit per pull.
- [ ] **Acceptance:** user connects X, posts auto-populate `posts.json`, `voice.md` generates
      with no paste.

### Phase 4 — Export-file upload for IG & LinkedIn _(ToS-clean fallback)_
- [ ] Upload widget accepting IG data archive + LinkedIn `Shares.csv`.
- [ ] Adapters parse each format → normaliser → `posts.json`.
- [ ] In-app guidance: "How to download your data from Instagram / LinkedIn."
- [ ] **Acceptance:** uploading a real export produces a complete `posts.json`.

### Phase 5 (optional) — Third-party data source _(only if Phases 1–4 leave a real gap)_
- [ ] Evaluate a reputable provider; isolate behind one adapter interface.
- [ ] Explicit user consent + clear disclosure that data is fetched via a third party.
- [ ] **Acceptance:** opt-in only; disabled by default; legal sign-off recorded.

---

## 9. Risks & mitigations

- **API policy drift** (esp. Meta/LinkedIn change rules often): isolate each platform behind
  an adapter; never let platform specifics leak into the generator.
- **LinkedIn/IG scraping legal exposure:** do not scrape personal accounts by default;
  prefer export-upload; gate any third-party path behind consent + disclosure.
- **LLM cost + latency on long input:** cheap model, chunk caps, per-request size limits,
  cache normalised output.
- **LLM hallucinating posts:** strict schema validation, "do not invent" instruction,
  deterministic fallback splitter, never synthesise dates/counts.
- **PII / data retention:** store only what's needed for `voice.md`; define a retention
  policy; if using OpenRouter, confirm the routing/retention settings acceptable for user
  content.
- **Token storage (X refresh tokens):** encrypt at rest, scope minimally, support revoke.

---

## 10. Open questions for the team
1. What stack is the generator on, and where does `posts.json` best slot in?
2. Is OpenRouter already wired, or is this its first use here?
3. For "scrape," do we ever need **fetch-from-URL**, or is **parse-what-the-user-has**
   sufficient? (Plan assumes the latter; the former adds the §3 third-party risk.)
4. Do we want to support Business/Creator IG accounts via Graph API as an optional path?

---

## TL;DR
Build **input adapters → OpenRouter normaliser → `posts.json` → existing generator.** Ship
**smart paste (Phase 1)** first — it's the user's Option 2 and the universal backbone. Add a
**platform selector** for voice mapping. Do **X OAuth** (the only official auto-pull that
works). Use **data-export upload** for Instagram and LinkedIn, because their official APIs
**cannot** read a normal user's own posts (IG Basic Display is dead; LinkedIn post-read is
partner-gated).
