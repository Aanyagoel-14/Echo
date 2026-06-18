# ECHO

Echo is an AI content engine for Instagram. It learns a brand's voice from its own post history, measures that history against live market trends, and then either audits what past posts were missing or generates a brand-new, trend-optimized post on demand.

The product runs in two modes:

- **Audit Mode (default):** critiques the user's past posts against current trends.
- **Creation Mode (optional):** generates a new post when the user supplies a product brief.

---


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