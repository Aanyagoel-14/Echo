# ECHO

Echo is an AI content engine for Instagram. It learns a brand's voice from its own post history, measures that history against live market trends, and then either audits what past posts were missing or generates a brand-new, trend-optimized post on demand.

The product runs in two modes:

- **Audit Mode (default):** critiques the user's past posts against current trends.
- **Creation Mode (optional):** generates a new post when the user supplies a product brief.

---

## UI/UX Flow

The app is a short, linear flow of five pages. Only Page 1 is required: Page 2 enriches the audit, Page 3 is the always-on audit payoff, and Pages 4–5 are the optional Creation Mode.

### Page 1 — Brand Foundation *(required)*

Establishes the baseline the AI learns from.

- **Import Posts:** upload previous Instagram posts as **JSON** (the historical dataset).
- **Brand Voice:** define the core personality of the brand.
- **Tone Selection:** pick the emotional tone of the output (playful, educational, professional, etc.).

### Page 2 — Inspiration *(optional)*

Feeds the AI stylistic examples and a target genre so its caption suggestions match both what the user admires and the current trend.

- **Text / Images:** paste captions or upload images of posts the user admires, to steer caption style.
- **Genre Selector:** choose from a preset list of genres/niches, with an **"Other"** free-text field for anything not listed.

### Page 3 — Output Engine *(the Audit)*

The first payoff, shown automatically. The engine reads the Page 1 JSON, pulls today's cached trends, and runs the **Suggestion Model** to return a structured critique:

- **What's Working** — where the past posts hold to the brand voice.
- **What's Missing** — gaps against today's trends.
- **Hashtag Audit** — outdated tags out, trend-backed tags in.
- **Strategic Pivot** — one concrete move for the next post.

This is the natural end of **Audit Mode**. From here the user either stops, or taps **"Create a new post"** to carry the critique forward into the Prompt.

### Page 4 — The Prompt *(optional)*

Gathers the data needed to create a *new* post. If skipped, Echo stays strictly in Audit Mode and ends at Page 3.

- **Product Snap:** image of the specific product.
- **One-Line Brief:** what the post must achieve (e.g., "Launch of our new summer tote bag").
- **Format:** the headline format — Reel concept, Carousel structure, or Thread.
- **Text:** starter captions / trending hashtags.

### Page 5 — Generation Result

Where the new post is displayed. The **Generation Model** takes the Page 3 critique plus brand voice, inspiration, and the Page 4 brief, and returns a ready-to-post **multi-platform content kit** — the same `{ reel, carousel, thread }` shape the current `/api/generate` already produces:

- **Reel** — hook, script, and a shot-by-shot call sheet (`time · shot+camera · in-frame · on-screen text`).
- **Carousel** — swipeable slides, plus a caption and 3–5 hashtags.
- **Thread** — stacked X posts, no hashtags (X convention).

Each variant carries a tone chip when a brand voice was declared; the Format chosen on Page 4 is the headline. Shown after the Page 3 critique, so the audit and the new post read as one story.

---

## Feature-Wise Plans

Each feature below is **independently buildable and independently testable**. Where a feature would normally consume another feature's output, it can be tested with mock or sample inputs, so no feature blocks the others. After one iteration of implementation, every feature has a clear standalone pass/fail check.

### Feature 1 — Trend Harvesting Engine

**Goal.** Maintain a self-updating store of current content trends so the app pays zero per-request API fees at query time. Official Instagram APIs are restricted and premium scrapers charge per call, so this uses free/open-source sources plus a local cache.

**Build.**

- **Google Trends (`pytrends`):** pull daily trending searches related to the user's niche.
- **TikTok Creative Center:** scrape the public HTML of the Trend Discovery page (Playwright or BeautifulSoup) for trending hashtags and sounds. What trends on TikTok today tends to trend on Instagram Reels next.
- **Instaloader (optional, rate-limited):** check a list of baseline niche hashtags (e.g., `#skincare`, `#edtech`) and read the co-occurring hashtags on recent top posts. Instagram rate-limits this heavily, so run it slowly (e.g., once a day) and rotate a few proxy IPs.
- **Aggregator:** store all scraped trends in a database (Firebase or PostgreSQL) and refresh on a 24-hour schedule. At request time the app queries *your own* database, not the source sites.

**Test on its own.**

- Run the scraper manually and confirm the database is populated with a fresh batch of trends plus a timestamp.
- Re-run after the refresh window and confirm the data updates (old batch replaced or versioned).
- Query the database directly for a sample niche and confirm it returns a usable list of trending hashtags/topics. No other feature is needed to verify this.

### Feature 2 — Historical Data Parser (JSON Ingestion)

**Goal.** Turn the user's raw Instagram JSON export into a compact structure that is cheap to feed an LLM (minimizing token cost).

**Build.**

- Backend route accepts the JSON uploaded on Page 1.
- Strip away useless metadata and keep only:
  - **Caption** — to analyze copywriting style.
  - **Hashtags** — to see what they currently use.
  - **Post Type** — Image, Carousel, or Reel.
  - **Engagement Metrics** — Likes/Comments, if present in the JSON.
- Return the **top 10 most recent posts** (count configurable) as a clean, normalized object.

**Test on its own.**

- Feed a sample Instagram JSON export and confirm the output contains only the four fields, correctly mapped.
- Feed a JSON missing engagement metrics and confirm it degrades gracefully (no crash; field omitted or null).
- Feed a large export and confirm exactly the top N most-recent posts are returned. No trend data or LLM call is required to verify this.

### Feature 3 — Suggestion Model (AI Audit)

**Goal.** Compare the user's past content against current trends and return a structured, readable critique.

**Build.**

- Use a capable but cheap LLM (e.g., Gemini 1.5 Flash or GPT-4o-mini) to keep token costs low.
- Assemble the inputs:
  1. Brand Voice (Page 1)
  2. Parsed historical posts (Feature 2 output)
  3. Today's market trends (Feature 1 output)
  4. Inspiration summary (Page 2, optional)
- Send the following system prompt:

> You are an expert Social Media Strategist. Your job is to audit the user's past Instagram content and compare it to today's market trends.
>
> **Inputs Provided:**
> 1. User's Brand Voice: [Insert Page 1 Brand Voice]
> 2. User's Historical Posts: [Insert Parsed JSON]
> 3. Today's Market Trends: [Insert your scraped daily trends]
> 4. User's Inspiration (Optional): [Insert Page 2 Text/Image summary]
>
> **Your Task:** Analyze the historical posts. Provide a concise, structured critique detailing:
> - **What's Working:** acknowledge where they align with their brand voice.
> - **What's Missing:** identify gaps based on Today's Market Trends.
> - **Hashtag Audit:** point out outdated tags and suggest new ones based on the trend data.
> - **Strategic Pivot:** one actionable piece of advice on how to structure their next post to match the Inspiration and Trends.
>
> Output the response in clean, easy-to-read Markdown format.

**Test on its own.**

- Feed mock parsed posts, a mock trend list, and a brand voice; confirm the output contains all four critique sections in valid Markdown.
- Omit the optional inspiration and confirm it still produces a coherent critique.
- Swap in a different niche's trends and confirm the Hashtag Audit changes accordingly. This can be run entirely on stubbed inputs — no live scraper or real upload needed.

### Feature 4 — Generation Model (Creation Mode)

**Goal.** When the user completes the Prompt page, produce a brand-new, optimized post.

**Build.**

- Triggered only if Page 4 (The Prompt) was filled.
- Assemble the inputs:
  - The critique / trend analysis (Feature 3 output)
  - Brand Voice (Page 1)
  - Inspiration (Page 2)
  - Product snap, one-line brief, and chosen format — Reel concept / Carousel structure / Thread (Page 4)
- Run a second LLM prompt that writes the new post: caption plus trending hashtags, structured to the chosen format.
- Return a ready-to-post draft as the `{ reel, carousel, thread }` kit, rendered on Page 5.

**Test on its own.**

- Provide a mock critique, brand voice, brief, and format = Carousel; confirm a carousel-structured post is returned with caption and hashtags.
- Switch the format to Reel and confirm the output structure changes to a reel concept.
- Provide no prompt and confirm the app correctly stays in Audit Mode only (ends at Page 3). Testable on a stubbed critique; does not require Features 1–3 to be live.

### Feature 5 — Frontend Pages & Conditional Flow

**Goal.** Render the five pages and wire the audit-versus-generate branching.

**Build.**

- Implement Pages 1–5 per the **UI/UX Flow** section above (JSON upload + voice + tone; inspiration + genre picker; audit renderer; prompt + format selector; generation renderer).
- Render the Markdown critique cleanly on Page 3 (Output Engine).
- Conditional logic: Page 3 always shows the audit. If the user taps "Create a new post" and fills Page 4, run Feature 4 and display the generated post on Page 5; otherwise the flow ends at Page 3 in Audit Mode.

**Test on its own.**

- Load each page in isolation and confirm inputs render and capture values.
- Skip Pages 2 and 4 and confirm the app still reaches the Page 3 audit in Audit Mode.
- Fill Page 4, click Generate, and confirm Page 5 shows the generated post following the Page 3 critique. Can be tested against mocked backend responses, independent of the real engine.

---

## How the Features Connect (Data Flow, Not a Schedule)

This is the runtime wiring once all features exist — not an implementation order. Each feature above can still be built and tested on its own.

```
Page 1 JSON ─▶ [F2] Parser ─┐
                            ├─▶ [F3] Suggestion Model ─▶ Critique ─▶ Page 3 (Output Engine)
[F1] Trend Engine (cached) ─┘                              │
                                                           ▼
Page 4 Prompt (optional) ──────────────▶ [F4] Generation Model ─▶ New-post kit ─▶ Page 5 (Generation Result)
```

- **Audit Mode:** F2 + F1 → F3 → Page 3 (end of flow).
- **Creation Mode:** the F3 critique plus the Page 4 prompt → F4 → Page 5 (shown after the critique).
