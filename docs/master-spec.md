# Echo — Master Build Brief

> **Read me first.** This is the single source of truth for building and refining **Echo**, a brand-voiced multi-format content engine for the iQOO Hackathon 2026. It merges the two feature specs (Reel, X Thread), adds the missing Carousel spec, consolidates the product's "brain" (pitch, architecture, design system, build plan), and ends with slots for Notion-only visual content (mockups/inspiration/themes) to be inserted.
>
> **One-liner:** *One capture. Every platform. Your voice.*
> **What Echo does:** one input (a photo or a one-line brief) → three platform-native, voice-matched outputs: a **Reel script + shot list**, an **Instagram carousel**, and an **X thread** — generated on the phone, in the creator's own voice.

---

## 0. Working agreement for Claude Code (read before writing code)

These are hard guardrails. They come from the hackathon's real constraints and from what makes this demo win.

- **Stack is a React PWA — NOT native, NOT React Native.** Reason: during the phone-only "Red Light" build window you cannot run a native build toolchain. Everything must be editable in a browser IDE against a live URL.
- **Cloud-first. Deploy early, iterate against the live deployment.** React + Vite + Tailwind, `vite-plugin-pwa` (installable, fullscreen, mobile-portrait), hosted on Vercel/Replit, serverless `/api` functions for LLM calls.
- **LLM/API keys live ONLY server-side** (serverless function / Replit Secrets). Never in client code.
- **`localStorage` is fine in this real app** for brand-voice persistence. (The "no browser storage" rule only applies to Claude.ai artifacts — it does **not** apply here.)
- **All three outputs come from ONE synthesis call** that returns strict JSON matching the `SynthesisResult` contract (§6). **Parse defensively** with per-field fallbacks so a malformed field never crashes the Results screen.
- **The polish of the rendered output IS the demo.** Carousel = real swipeable slides; thread = stacked tweet cards; reel = script block + call-sheet shot list. **Never render raw JSON.**
- **Mobile portrait first.** Everything thumb-reachable. Dark theme, electric-blue accent. Smooth 150–200ms transitions, a polished loading animation.
- **Generated-content safety (non-negotiable):** never fabricate specs/stats/prices not in the brief; never name a specific copyrighted song (suggest "trending audio" generically); hashtag policy **differs per platform** (IG carousel: 3–5 OK; X thread: 0 by default).
- **Brand voice (RAG-lite) flows into every generation** — inject the user's saved samples + tone into all three pipelines. No vector DB.
- **Definition of done = the per-feature build checklist** at the end of each feature spec (§8/§9/§10).

**Status snapshot for the agent:**
- ✅ Specced & ready to build: Reel (§8), X Thread (§10).
- ✅ Specced here (drafted to complete the trio, expand as needed): Carousel (§9).
- ⬜ To insert: Notion visual content — UI/UX mockups, inspiration, finalized themes (§14).

---

## 1. Product overview

**Problem.** Solo creators and small brands have ideas constantly but lose hours turning one idea into platform-shaped content — a Reel needs a script and shot list, Instagram needs a carousel, X needs a thread, and all of it has to sound like *them*. The reformatting tax kills momentum at the exact moment of inspiration.

**Solution.** Echo is a brand-voiced content engine — the creator's digital twin. One input (a product photo snapped on the iQOO, or a one-line brief) instantly becomes a full multi-platform kit: a Reel script with shot list, a ready-to-post Instagram carousel, and an X thread, all in the creator's own voice learned from a few samples. It runs as a PWA on the phone; cloud models do the heavy synthesis while a small on-device model handles the always-on, private layer.

**Why it's different.** Schedulers (Buffer, Hootsuite) post but don't create. Generic AI writers give you one text blob you still reformat yourself. Echo produces **three platform-native, voice-matched deliverables from a single capture** — and the input comes from the iQOO itself, showcasing the phone as creator *compute*, not just a screen. The twin sharpens over time as it learns from what the creator approves and edits.

**Judge pitch (the hook).**
> *"Echo turns the iQOO into a one-person content studio. Point the camera at anything, and in seconds Echo writes a Reel script, an Instagram carousel, and an X thread — all in your own voice, with the private layer running on the phone itself. The reformatting tax that costs every creator hours, gone, at the moment of inspiration."*

---

## 2. Target user & scope

**Who it's for:** solo creators and small brands who are their own marketing team.

**In scope (the non-negotiables — build only these until they work end-to-end):**
1. **Single-input capture** — a photo (iQOO camera) **and** a one-line text brief (the reliable fallback if vision misbehaves on stage).
2. **Multi-format synthesis (THE hero)** — one input → three branded outputs via RAG-lite brand voice.
3. **Platform-shaped rendering** — outputs must *look* like the real thing.
4. **Quick brand-voice setup** — paste a few samples or pick a tone, in ~30 seconds.

**Out of scope (cut or fake gracefully):**
- Live trend monitoring → use a small curated "trending now" list you control.
- Live social-listening / posting APIs → show one *scripted* auto-reply with an "escalate to human" flag.
- Scheduling, analytics dashboards, multi-user, login.

---

## 3. Tech stack & architecture

**Stack:** React + Vite + Tailwind · PWA via `vite-plugin-pwa` (manifest + service worker, Add to Home Screen, fullscreen) · Vercel/Replit hosting + serverless `/api` · `localStorage` for brand-voice persistence (no backend DB) · Cloud LLM (vision + text) via serverless · **optional** WebLLM/WebGPU for an on-device edge.

**Architecture (two zones):**
- **On-device (iQOO):** the React PWA (Camera / Voice / Text inputs), an optional on-device LLM (WebLLM via WebGPU) for the always-on private layer (social-listener triage / instant offline draft), and the output renderer (Reel / Carousel / Thread).
- **Cloud:** an orchestrator ("Twin Engine") that receives one input and fans it into three parallel generation pipelines; a Brand Voice Context store (RAG-lite — samples injected into prompts); the Cloud LLM API (text synthesis for all three formats); an Image Generation API (carousel visuals).
- **Data flow:** PWA inputs → Orchestrator → pulls Brand Voice Context → calls Cloud LLM + Image Gen in parallel → returns to the on-device renderer. Approvals/edits feed back into the Brand Voice Context (closed loop).

> **On-device note:** validate WebGPU in the actual iQOO browser before relying on it. Build cloud-first with the on-device layer as a genuine but fallback-protected component — never let on-device ambition sink the core demo.

---

## 4. Design system

Dark, premium, electric-blue (nods to iQOO). The look is part of the score.

**Tokens**

| Token | Value | Use |
|---|---|---|
| `bg` | `#0B0B0F` | app background (near-black) |
| `surface` | `#15151C` | cards |
| `border` | `#23232E` | subtle card borders |
| `accent` | `#2F6BFF` | primary buttons, active tabs, highlights |
| `accent-hover` | `#1E54E6` | hover/active |
| `text-primary` | `#F4F4F6` | body/headings |
| `text-secondary` | `#9A9AA6` | secondary text |

**Type:** Inter (or system sans). Headings bold/tight; body comfortable.
**Shape & motion:** `rounded-2xl` cards, generous padding, soft shadows, 150–200ms transitions, a polished loading animation. Mobile portrait first.

**Tailwind config (`theme.extend`)**
```js
colors: {
  bg: '#0B0B0F',
  surface: '#15151C',
  border: '#23232E',
  accent: { DEFAULT: '#2F6BFF', hover: '#1E54E6' },
  text: { primary: '#F4F4F6', secondary: '#9A9AA6' },
},
borderRadius: { '2xl': '1rem' },
fontFamily: { sans: ['Inter', 'system-ui', 'sans-serif'] },
```

---

## 5. Information architecture (screens + flow)

State-based navigation, no router needed. Four screens:

1. **Brand Voice Setup** — paste 2–4 sample posts OR pick a tone preset (Playful / Professional / Bold / Minimal). Save to `localStorage`. → Capture.
2. **Capture** — a camera button (`<input type="file" accept="image/*" capture="environment">`) and a text-brief input. Either triggers generation → Loading.
3. **Loading** — branded animation (~1.5s).
4. **Results** — three tabs/sections, each rendering from the JSON: **Reel**, **Carousel**, **X Thread**. Copy-to-clipboard on each. A "New" button returns to Capture.

**Flow:** Setup (once) → Capture → Loading → Results → (Approve/Edit feeds the voice store) → New.

---

## 6. The unified data contract

One synthesis call returns this. **This is the render contract — keep it stable** so all three renderers stay coupled to one shape.

```ts
type Tone = "Playful" | "Professional" | "Bold" | "Minimal";

interface BrandVoice {
  samples: string[];   // 0–4 of the user's real posts (RAG-lite)
  tone: Tone;          // preset; seasons / fallback when samples are sparse
}

interface ReelOutput {
  hook: string;        // on-screen hook text
  script: string;      // scene-by-scene narrative incl. spoken hook + VO
  shotList: string[];  // "0:00–0:02 | shot + camera | in-frame | text: '...'"
}

interface CarouselSlide { title: string; body: string; }
interface CarouselOutput {
  slides: CarouselSlide[];  // 5–8; slide 1 = cover/hook, last = CTA
}

interface ThreadOutput {
  tweets: string[];    // 5–7; tweet 1 = hook, last = CTA; each ≤ 280 chars
  tone?: Tone;
}

interface SynthesisResult {
  reel: ReelOutput;
  carousel: CarouselOutput;
  thread: ThreadOutput;
}
```

**Reference mock** (hardcode this so the Results screen looks finished before the LLM is wired):
```json
{
  "reel": {
    "hook": "i bullied this water bottle for 30 days 😅",
    "script": "Open on a mock-serious close-up holding the bottle; quick montage of abuse; reveals: no leak, still cold, the colors; end defeated-impressed.",
    "shotList": [
      "0:00–0:02 | CU talking head, push-in | mock-serious face | text: 'i bullied this bottle for 30 days 😅'",
      "0:02–0:05 | jump-cut montage | bottle thrown in bag, dropped | text: 'the bag test 💼'",
      "0:05–0:09 | shake bottle at camera | nothing spills | text: 'ZERO leaks 💧'",
      "0:09–0:13 | pour into glass, ice intact, sip | shocked face | text: 'still cold at hour 24?? ✨'",
      "0:13–0:17 | top-down whip-pan across 6 colors | text: 'and the colors 🎨'",
      "0:17–0:22 | hug the bottle, defeated-impressed | text: 'fine. you win 🤝 link in bio 👇'"
    ]
  },
  "carousel": {
    "slides": [
      { "title": "Meet your last water bottle.", "body": "Seriously. Here's why. Swipe →" },
      { "title": "1. Cold for 24 hours", "body": "Double-wall vacuum steel." },
      { "title": "2. Leak-proof, for real", "body": "Toss it in your bag. Trust." },
      { "title": "3. Looks good doing it", "body": "Six matte colorways." },
      { "title": "Get yours", "body": "Save this 🔖 · Link in bio →" }
    ]
  },
  "thread": {
    "tweets": [
      "Your water bottle is leaking in your bag right now. You just don't know it yet. We fixed that. 🧵",
      "24 hours. That's how long it keeps your water cold. Not '12 if you're lucky.' A full day. ⚡️",
      "Leak-proof isn't a marketing word here. Throw it in your bag upside down. Nothing moves. Nothing spills. 🔒",
      "One-hand cap. Cup-holder fit. Zero rattle. The boring details everyone else gets wrong — we got right.",
      "Stop replacing cheap bottles every 3 months. Buy once. Link below. 👇"
    ],
    "tone": "Bold"
  }
}
```

---

## 7. Brand Voice & Tone System (shared by all three outputs)

This section is factored out so the three feature specs don't repeat it.

### 7.1 RAG-lite mechanism
Brand voice = the user's saved `samples[]` (0–4 real posts) + a `tone` preset, both injected straight into every generation prompt. No vector DB. The Brand Voice Setup screen persists this to `localStorage` and it's loaded on launch.

### 7.2 Voice priority rule (the core logic — identical across outputs)
> **If brand samples exist, match the samples first. Tone preset only fills the gaps.**

| Situation | What drives the voice |
|---|---|
| Samples pasted + tone picked | Samples win (vocab, rhythm, emoji habits, formality). Tone seasons the gaps. |
| No samples, tone picked | Tone preset fully drives the voice. |
| Samples pasted, no tone | Samples drive everything; default tone = Professional. |

This is what makes "in *your* voice" real instead of four canned presets.

### 7.3 The 4 core tone personalities
Defined once here; each feature spec gives the **medium-specific expression**.

- **Playful** — *fun, casual, emoji-friendly.* The excited, slightly-chaotic friend. Self-aware, never trying too hard. Conversational, contractions, relatable confessions.
- **Professional** — *polished, clear, trustworthy.* The credible operator. Confident without hype; earns trust by being specific. Full sentences, proper grammar, demonstrates rather than declares.
- **Bold** — *punchy, confident, high-energy.* The challenger. Takes a stance and backs it up. Short declarative lines, hammer rhythm, contrarian hooks.
- **Minimal** — *clean, concise, no fluff.* The designer's restraint. Says the most with the least; whitespace is the design. Ultra-short, parallel structure, nothing optional.

---

## 8. FEATURE 1 — Reel Script + Shot List

**What it does:** one input + tone → a shoot-ready Reel: a scroll-stopping hook, a scene-by-scene script (what's said + what's shown), and a numbered, timestamped shot list with camera direction and on-screen text. Output renders as a script card (hook highlighted) + a shot-list table, with copy buttons and an estimated duration. Contract: `reel: { hook, script, shotList[] }`.

### 8.1 Tone expression (Reel)
- **Playful:** fast jump cuts, expressive reactions, comedic timing; casual VO; emoji-friendly overlays (1–2 each); trending/upbeat audio.
- **Professional:** clean steady shots, premium B-roll, calm pacing; clear VO that demonstrates; minimal functional text; understated audio bed.
- **Bold:** hard fast cuts, big bold text, dramatic hook, strong music sync; short declarative VO; occasional ALL-CAPS punch; beat drop on the hook.
- **Minimal:** few deliberate shots, negative space, single-product focus, ASMR-adjacent; little/no VO; one or two words per overlay; ambient audio.

### 8.2 Reel-native rules (always on)
- **First 2 seconds are everything** — the hook must work as a **visual + on-screen text + (optional) spoken** at once.
- **Assume muted viewing** — every key message needs a text overlay, not just VO.
- **Target 15–30s** (go to ~60s only for genuine value content). Loop-friendly.
- **Vertical 9:16, safe zones** — keep text out of the top ~15% and bottom ~20%.
- **Cut often** — new shot every 2–4s; use pattern interrupts.
- **Pay it off + loop it** — last frame flows back into the hook.
- **One CTA in the final 2–3s** (save / follow / link in bio), tone-matched. (Saves & shares are the strongest IG signals.)
- **Suggest trending audio generically — never name a specific song.**
- **Never fabricate** specs/stats.
- **Every shot must be filmable:** `time | shot + camera | what's in frame | on-screen text`.

### 8.3 Reel anatomy
```
0:00–0:02  HOOK        visual + text overlay + (optional) spoken hook
0:02–0:05  SETUP       the promise / problem / first beat
0:05–0:??  VALUE beats demonstrate each point, one per shot (fast cuts)
   …       PAYOFF      the reveal / verdict
last 2–3s  CTA + LOOP  save/follow/link in bio; ending loops to the hook
```

### 8.4 Hook library (visual + verbal)
| Pattern | Text overlay | Spoken (VO) |
|---|---|---|
| Result + timeframe | "i bullied this for 30 days 😅" | "I tried to destroy this and… it won." |
| Problem-in-face | "your bottle is leaking RIGHT NOW" | "Your bottle is leaking in your bag right now." |
| Contrarian | "your routine is built wrong" | "Your morning routine isn't failing because you're lazy." |
| Curiosity gap | "we changed 1 thing. complaints stopped." | "We fixed the one thing everyone complains about." |
| POV / relatable | "POV: your last water bottle" | "POV: you found the only bottle you'll ever need." |
| Crisp count (Minimal) | "one bottle. three things." | *(none — text + ambient)* |

### 8.5 Shot & camera vocabulary
**Framing:** ECU, CU, medium, wide, top-down/flat-lay, POV, over-the-shoulder. **Movement:** static/tripod, handheld, push-in/pull-out, whip pan, slow pan, tilt, dolly. **Edit:** jump cut, hard cut, match cut, rack focus, slow-mo, time-lapse, speed ramp. **Talent:** talking head, hands-in-frame demo, faceless/product-only, green screen, reaction shot.

### 8.6 CTA library (by tone)
| Tone | CTA |
|---|---|
| Playful | "ok go get one, link in bio 👇 (and follow, i make these for fun)" |
| Professional | "Built to be your last one. Link in bio." / "Save this for when you're shopping." |
| Bold | "Stop wasting money on cheap ones. Buy once. Link in bio. 👇" |
| Minimal | "Link in bio." |

### 8.7 Worked example — one brief, all 4 tones
**Brief:** *"Launching our stainless steel water bottle — keeps drinks cold 24 hours, completely leak-proof, comes in 6 matte colors."*

**Playful**
```
HOOK (text): "i bullied this water bottle for 30 days 😅"
HOOK (VO): "ok so I tried to destroy this thing… and it won."
0:00–0:02 | CU talking head, mock-serious, push-in | text: "i bullied this bottle for 30 days 😅"
0:02–0:05 | jump-cut montage: thrown in bag, dropped, shoved in cupholder | text: "the bag test 💼"
0:05–0:09 | pull from bag, shake hard — nothing spills | text: "ZERO leaks 💧"
0:09–0:13 | pour into glass, ice intact, sip + shocked | text: "still cold at hour 24?? ✨"
0:13–0:17 | top-down whip-pan across all 6 colors | text: "and the colors 🎨"
0:17–0:22 | hug bottle, defeated-impressed | text: "fine. you win 🤝 link in bio 👇"
audio: trending upbeat / comedic
```

**Professional**
```
HOOK (text): "3 fixes. 1 bottle."
HOOK (VO): "Every bottle fails at one of three things. So we fixed all three."
0:00–0:03 | push-in on bottle, minimal desk, soft daylight | text: "3 fixes. 1 bottle."
0:03–0:08 | pour → cut to ice still intact, "24H" graphic | text: "Cold for 24 hours"
0:08–0:13 | bottle upside down in a bag, lift, reveal dry interior | text: "Leak-proof, verified"
0:13–0:17 | one-hand cap open while holding a laptop | text: "One-hand cap"
0:17–0:21 | slow top-down pan across 6 matte finishes | text: "Six finishes"
0:21–0:25 | bottle hero shot, logo | text: "Built to be your last bottle. Link in bio."
audio: clean, understated bed
```

**Bold**
```
HOOK (text): "LEAKING. RIGHT NOW."
HOOK (VO): "Your water bottle is leaking in your bag right now — and you have no idea."
0:00–0:02 | ECU, water dripping from a generic bottle in a bag | text: "LEAKING. RIGHT NOW."
0:02–0:04 | hard cut: our bottle slammed on table | text: "we fixed it."
0:04–0:08 | flip upside down, shake hard — nothing | text: "100% LEAK-PROOF 🔒"
0:08–0:12 | pour, ice solid, whip to "24H" | text: "COLD FOR 24 HOURS ⚡️"
0:12–0:16 | rapid cuts: one-hand cap, cupholder drop, no rattle | text: "details? nailed."
0:16–0:20 | all 6 colors slam in, beat-synced | text: "6 COLORS 🔥"
0:20–0:24 | bottle hero shot | text: "buy once. link in bio. 👇"
audio: high-energy, beat drop on the hook
```

**Minimal**
```
HOOK (text): "one bottle."
HOOK (VO): (none — text + ambient)
0:00–0:03 | static, centered bottle, plain background, soft light | text: "one bottle."
0:03–0:07 | slow pour, condensation ECU | text: "cold 24h."
0:07–0:11 | place in bag, lift, reveal dry | text: "no leaks."
0:11–0:15 | slow pan across 6 colors | text: "six colors."
0:15–0:18 | static hero shot, slow fade | text: "link in bio."
audio: ambient / minimal beat, no VO
```

### 8.8 Non-product example (proves it's not product-only)
**Brief:** *"Why most morning routines fail."*
```
Bold — HOOK (text): "your routine is built wrong."
0:00–0:02 | talking head, fast push-in | text: "your routine isn't failing. it's built wrong."
0:02–0:06 | alarm/snooze B-roll + text punch | text: "rule 1: can't do it tired? not a routine."
0:06–0:10 | habit-stack visual (coffee → journal) | text: "rule 2: stack onto what you already do"
0:10–0:14 | 5-min timer on screen | text: "rule 3: win in under 5 minutes"
0:14–0:17 | talking head CTA | text: "save this for 6am 🔖 + follow"
```

### 8.9 Render notes (Reel)
Two parts: **Script card** (hook highlighted at top, then scene-by-scene; show estimated duration + tone chips) and **Shot list** (numbered timestamped table/stepper — *Time · Shot/Camera · In frame · On-screen text* — looks like a real call sheet). Optional faux 9:16 phone-frame preview. Copy buttons: copy script / copy shot list / copy all. **Never raw JSON.**

### 8.10 Build checklist (Definition of Done)
- [ ] Tone presets wired to §8.1 expression blocks.
- [ ] Brand-voice samples from `localStorage` injected into the prompt.
- [ ] `/api/generate` reel branch returns strict JSON (§6); defensive parse with "whole text → script" fallback.
- [ ] Hook present and works as on-screen text (sound-off framing).
- [ ] No fabricated specs; no named songs.
- [ ] Script card + shot-list table renderer with copy buttons + duration chip.
- [ ] All 4 tones differ in script wording AND edit energy.
- [ ] Sample mode mimics pasted voice over the preset.
- [ ] Demo dry-run renders < 2s and looks shoot-ready.

---

## 9. FEATURE 2 — Instagram Carousel  *(drafted to complete the trio — expand to match §8/§10 depth as time allows)*

**What it does:** one input + tone → a swipeable Instagram carousel: a scroll-stopping **cover slide** (the hook), 3–5 one-idea value slides, and a CTA slide. Output renders as **actual swipeable slides** (horizontal snap-scroll, IG-styled), with copy and an optional caption. Contract: `carousel: { slides: [{ title, body }] }`.

### 9.1 Tone expression (Carousel)
- **Playful:** punchy casual titles, emoji-friendly bodies, conversational; bright/energetic template feel.
- **Professional:** clear benefit titles, specific bodies, calm and credible; clean grid template.
- **Bold:** big confident title statements, short declarative bodies; high-contrast template, occasional ALL-CAPS.
- **Minimal:** two-to-four-word titles, one-line bodies, lots of negative space; mono/clean template.

### 9.2 Carousel-native rules (always on)
- **Slide 1 is the cover/hook** — must stop the scroll in-feed and promise clear value. Add a swipe cue ("Swipe →") to lift completion.
- **5–8 slides; sweet spot 6.** One idea per slide. Strong text hierarchy: a big **title** + a short **body**.
- **Design for saves & shares** — carousels are save-magnets, and saves rank highly on IG. End on a save/follow CTA.
- **Consistent visual template** across slides (brand colors, font) so it reads as one set.
- **Last slide = CTA + recap** (save / follow / link in bio).
- **Ratio:** 4:5 portrait (1080×1350) maximizes feed real estate.
- **Hashtags differ from X:** IG still benefits from **3–5 relevant** hashtags in the caption (not 30) — *this is the opposite of the X thread's 0-hashtag rule.*
- **Never fabricate** specs/stats.

### 9.3 Carousel anatomy
```
Slide 1  COVER / HOOK   big title + value promise + "Swipe →"
Slide 2  SETUP          why this matters / the frame
Slides 3–6  VALUE       one point each (title + short body)
Last     CTA + RECAP    save 🔖 / follow / link in bio
```

### 9.4 Hook & CTA libraries
**Cover hooks:** "Meet your last water bottle." · "3 things every other bottle gets wrong." · "Stop buying a new bottle every 3 months." · "One bottle. Three problems solved." (Minimal).
**CTAs (by tone):** Playful "save this for later 🔖 link in bio →" · Professional "Save for reference. Link in bio." · Bold "Buy once. Link in bio. 🔖" · Minimal "Link in bio.".

### 9.5 Worked example — one brief, all 4 tones
**Brief:** *"Launching our stainless steel water bottle — keeps drinks cold 24 hours, completely leak-proof, comes in 6 matte colors."*

**Playful**
```
1 (cover) "meet your last water bottle 💧" / "no really. swipe to see why →"
2 "the bag test 💼" / "threw it in with my laptop. zero leaks."
3 "cold at hour 24?? ✨" / "forgot it in my car. still cold. witchcraft."
4 "6 colors 🎨" / "and yes i want all of them."
5 (CTA) "go get one 🔖" / "save this · link in bio →"
```

**Professional**
```
1 (cover) "The last water bottle you'll buy" / "Three fixes, one bottle. Swipe →"
2 "1. Cold for 24 hours" / "Double-wall vacuum insulation, verified in real conditions."
3 "2. Leak-proof, verified" / "Pressure-tested. Place it any way, in any bag."
4 "3. Built for daily use" / "One-hand cap. Fits standard cup holders."
5 (CTA) "Available now" / "Six matte finishes. Save this · link in bio."
```

**Bold**
```
1 (cover) "Your bottle is failing you." / "Here's the one that won't. Swipe →"
2 "COLD FOR 24 HOURS ⚡️" / "Not 12 if you're lucky. A full day."
3 "100% LEAK-PROOF 🔒" / "Upside down in your bag. Nothing spills."
4 "6 COLORS 🔥" / "Every one of them hits."
5 (CTA) "Buy once." / "Save 🔖 · link in bio →"
```

**Minimal**
```
1 (cover) "One bottle." / "Three problems solved. →"
2 "Cold 24h." / "Vacuum steel."
3 "No leaks." / "Any bag, any way."
4 "Six colors." / "Matte."
5 (CTA) "Link in bio." / ""
```

### 9.6 System prompt (injection slots)
```
You are Echo, a brand-voice content engine. Write a swipeable Instagram carousel.
INPUT — Brief: {INPUT} · Tone: {TONE} · Brand samples (RAG-lite): {BRAND_SAMPLES}
VOICE PRIORITY — samples first; tone fills the gaps (see §7.2).
TONE — {TONE_RULES from §9.1}
CAROUSEL RULES — Slide 1 = cover hook with a value promise + "Swipe →". 5–8 slides, one idea each,
  title + short body. End with a save/follow CTA slide. Consistent set. 3–5 caption hashtags OK (NOT 0).
  Never fabricate specs/stats.
OUTPUT — strict JSON only:
{ "carousel": { "slides": [ { "title": "...", "body": "..." } ] } }
```

### 9.7 Render notes (Carousel)
**Actual swipeable slides** — horizontal snap-scroll, IG-styled cards in 4:5, dot/progress indicator, consistent template, brand colors + Inter. Tone chip. Copy-all + (optional) per-slide copy + a caption block with 3–5 suggested hashtags. **Never raw JSON.**

### 9.8 Build checklist (Definition of Done)
- [ ] Cover slide reads as a scroll-stopping hook with a swipe cue.
- [ ] 5–8 slides, one idea each, clean title/body hierarchy.
- [ ] Swipeable snap-scroll component styled like IG (4:5), progress dots.
- [ ] CTA slide (save/follow/link in bio) + caption with 3–5 hashtags.
- [ ] All 4 tones differ; sample mode mimics pasted voice.
- [ ] Strict JSON (§6), defensive parse; no fabricated specs.

---

## 10. FEATURE 3 — X Thread

**What it does:** one input + tone → a native, high-performing X thread: a scroll-stopping hook, 3–5 value tweets, one CTA. Renders as **stacked tweet cards** with per-tweet copy + copy-all. Contract: `thread: { tweets: [] }`.

### 10.1 Tone expression (X Thread)
- **Playful:** short conversational tweets, fragments OK, 1–3 expressive emoji each, casual caps, relatable confession hooks.
- **Professional:** full well-formed tweets, one clean idea each, 0–1 functional emoji, sentence case, concrete-promise hooks.
- **Bold:** short declarative punches, 0–2 high-energy emoji, occasional ALL-CAPS, contrarian/problem hooks.
- **Minimal:** ultra-short single-line tweets, ~no emoji, parallel structure, crisp-count hooks; whitespace does the work.

### 10.2 X-native rules (always on)
- **The hook is ~80% of the job** — tweet 1 must stop the scroll and earn tweet 2. End it with the 🧵 cue.
- **5–7 tweets.** One idea each; each stands alone but opens a loop to the next.
- **≤ 280 characters per tweet.** Use line breaks; short lines beat walls of text.
- **No hashtag spam — 0 by default**, at most 1 if clearly branded. *(Opposite of IG carousel.)*
- **One clear CTA, last tweet only**, tone-matched (bookmark is a strong native signal).
- **Never fabricate** specs/stats/prices.
- **Write like a human on the timeline** — no "Introducing", no corporate filler.
- **Numbering styles:** `1/ 2/` (open) · `1/7` (fixed, improves completion) · or none for short Minimal threads.

### 10.3 Thread anatomy
```
Tweet 1  HOOK             stop the scroll + 🧵
Tweet 2  CONTEXT / setup
Tweets 3–5  VALUE          one idea each
Tweet 6  PAYOFF / verdict  (optional; merges with CTA when short)
Tweet 7  CTA               bookmark / follow / link below
```

### 10.4 Hook & CTA libraries
**Hooks:** result+timeframe ("I tested 7 bottles for 30 days. Only one survived. 🧵") · contrarian ("Your morning routine isn't failing because you're lazy. It's built wrong. 🧵") · problem-in-face ("Your water bottle is leaking in your bag right now. 🧵") · curiosity gap · listicle promise · POV · crisp count (Minimal).
**CTAs (by tone):** Playful "bookmark it for when your current one betrays you 🔖 link below 👇" · Professional "Full specs at the link below. 📌 / Save this. 🔖" · Bold "Buy once. Link below. 👇" · Minimal "Link below.". Rotate: "Follow @handle for more", "RT the first tweet", "Bookmark this 🔖".

### 10.5 Worked example — one brief, all 4 tones
**Brief:** *"Launching our stainless steel water bottle — keeps drinks cold 24 hours, completely leak-proof, comes in 6 matte colors."*

**Playful**
```
1/ i tested this water bottle by being the messiest human alive for 30 days 😅 it refused to die. a thread 🧵
2/ first, the bag test. threw it in with my laptop, keys, and half a sandwich. zero leaks. not one drop 💧
3/ cold water at hour 24?? forgot it in my car overnight and it was STILL cold the next morning. witchcraft ✨
4/ one-hand cap is elite btw. i can open it while holding my coffee, my phone, AND my entire personality 📱
5/ also 6 matte colors and yes i want all of them. no i will not be taking questions 🎨
6/ ok that's the thread. bookmark it for when your current bottle inevitably betrays you 🔖 link below 👇
```

**Professional**
```
1/ We spent 18 months engineering a bottle around the three complaints people have about every other one. Here's what we changed. 🧵
2/ Temperature first. Double-wall vacuum insulation holds cold for a full 24 hours — verified in real-world testing, not lab-ideal conditions.
3/ Then leaks. A re-engineered seal lets you place it in any bag, in any orientation, with no spill. Every unit is pressure-tested before it ships.
4/ And daily use: a one-hand cap, a balanced grip, and a base sized to fit standard cup holders.
5/ Available now in six matte finishes. Designed to be the last bottle you buy.
6/ Full specs and availability at the link below. 📌
```

**Bold**
```
1/ Your water bottle is leaking in your bag right now. You just don't know it yet. We fixed that. 🧵
2/ 24 hours. That's how long it keeps your water cold. Not "12 if you're lucky." A full day. ⚡️
3/ Leak-proof isn't a marketing word here. Throw it in your bag upside down. Nothing moves. Nothing spills. 🔒
4/ One-hand cap. Cup-holder fit. Zero rattle. The boring details everyone else gets wrong — we got right.
5/ 6 matte colors. Every single one hits. 🔥
6/ Stop replacing cheap bottles every 3 months. Buy once. Link below. 👇
```

**Minimal**
```
1/ One water bottle. Three problems solved. 🧵
2/ Cold for 24 hours.
3/ Leak-proof in any bag.
4/ One-hand cap. Fits cup holders.
5/ Six matte colors.
6/ Link below.
```

### 10.6 Non-product example
**Brief:** *"Why most morning routines fail."*
```
Bold —
1/ Your morning routine isn't failing because you're lazy. It's failing because it's built wrong. 🧵
2/ Rule 1: a routine you can't do tired is not a routine. It's a wishlist. ⚡️
3/ Rule 2: stack the new habit onto something you already do. New + existing beats new + nothing.
4/ Rule 3: win in under 5 minutes. Momentum compounds. Perfection doesn't.
5/ Steal these. Bookmark for tomorrow at 6am. 🔖
```

### 10.7 System prompt (injection slots)
```
You are Echo, a brand-voice content engine. Write a native, high-performing X (Twitter) thread.
INPUT — Brief: {INPUT} · Tone: {TONE} · Brand samples (RAG-lite): {BRAND_SAMPLES}
VOICE PRIORITY — samples first; tone fills the gaps (see §7.2).
TONE — {TONE_RULES from §10.1}
X RULES — Tweet 1 = scroll-stopping hook ending in 🧵. 5–7 tweets, one idea each, ≤280 chars,
  line breaks for whitespace. 0 hashtags by default (max 1 branded). One CTA, last tweet only.
  Never fabricate specs/stats. Write like a human, not an ad.
OUTPUT — strict JSON only:
{ "thread": { "tweets": ["...", "..."], "tone": "{TONE}" } }
```

### 10.8 Render notes (X Thread)
**Stacked tweet cards** connected by a thin vertical thread line — avatar (brand initial/logo), name + @handle, tweet text with preserved line breaks. Per-tweet copy + copy-all. Char-count chip per tweet (amber near 280) to signal "publish-ready". Tone chip. Dark theme, electric-blue accent. **Never raw JSON.**

### 10.9 Build checklist (Definition of Done)
- [ ] Tone presets wired to §10.1 expression blocks.
- [ ] Brand-voice samples injected from `localStorage`.
- [ ] `/api/generate` thread branch returns strict JSON (§6); defensive parse with newline-split fallback.
- [ ] Char-limit guard (warn/clip > 280).
- [ ] No fabricated specs.
- [ ] Stacked tweet-card renderer with thread line, per-tweet copy, copy-all, char chips.
- [ ] All 4 tones clearly differ; sample mode mimics pasted voice.
- [ ] Demo dry-run renders < 2s and looks postable.

---

## 11. The synthesis endpoint (consolidated)

`/api/generate` accepts `{ input, image?, brandVoice }`, calls the cloud LLM (vision when an image is present), and returns **strict JSON matching `SynthesisResult` (§6) with no prose outside JSON.** The system prompt:
- injects `brandVoice.samples` + `brandVoice.tone` (RAG-lite) and applies the **voice priority rule** (§7.2);
- takes the single input;
- shapes each format for its platform using the per-feature rules (§8.2 / §9.2 / §10.2);
- demands the JSON schema with no extra prose.

**Parse defensively:** wrap parsing in try/catch; if JSON parse fails, fall back per output (reel → whole text into `script`; thread → split on newlines into `tweets`; carousel → split into slide titles) so the Results screen always renders something. Key stays server-side.

> **Performance option:** the three outputs can be one call (simplest) or three parallel calls behind the orchestrator (faster, more robust to one format failing). Start with one call; split only if latency or reliability needs it.

---

## 12. Build plan & checkpoints

**Phases**
- **P0 Scaffold** — React + Vite + Tailwind PWA (manifest + SW, Add to Home Screen, fullscreen, dark + accent). Deploy; return live URL.
- **P1 App shell** — 4-screen state machine (Setup, Capture, Loading, Results).
- **P2 Brand voice** — Setup screen: paste 2–4 samples or pick a tone; persist to `localStorage`; load on launch.
- **P3 Serverless endpoint** — `/api/generate` returns strict `SynthesisResult` JSON (mock first); key server-side; defensive parse.
- **P4 Synthesis prompt** — inject brand voice, take input, demand the schema, shape each format (§11).
- **P5 Capture flow** — camera file input (`capture="environment"`) → vision model → synthesis; text-brief fallback.
- **P6 Render outputs** — Reel (script + shot list), Carousel (swipeable slides), Thread (stacked cards). Copy buttons. **This rendering is the demo.**
- **P7 Polish** — loading animation, transitions, iQOO-blue theme, empty/error states.
- **P8 EDGE (optional)** — WebLLM on-device draft/offline first-pass with cloud fallback.
- **P9 EDGE (optional)** — closed loop: Approve/Edit appends approved text back into the brand-voice samples.

**Checkpoints (ship in order; after each: deploy, open live URL on phone, commit)**
- CP0 Repo + scaffold + first deploy (live URL renders on mobile).
- CP1 PWA install works (Add to Home Screen, fullscreen).
- CP2 Design system + 4-screen shell navigable.
- CP3 Brand Voice Setup persists across refresh.
- CP4 Capture screen — both inputs trigger the flow.
- CP5 Results renderers — all three look demo-ready from the mock.
- CP6 Loading + copy + transitions + empty/error states.
- CP7 `/api/generate` skeleton wired (returns mock; `// TODO: real LLM call + brand-voice prompt`).
- CP8 Final end-to-end run on the phone from the live URL.

---

## 13. Demo & pitch

**Pitch / hook:** see §1.
**Live demo beat:** snap a product on the iQOO → three platform-ready posts appear on the display, live, on the phone. (Text-brief is the reliable on-stage fallback.)
**Why different (one line):** three platform-native, voice-matched deliverables from a single capture, generated on the device in your hand.
**Scope to defend:** single input → three rendered branded outputs + a 30-second brand-voice setup. Everything else is fake-gracefully (§2).
**Architecture story for judges:** *"Cloud for heavy synthesis, on-device for the always-on private layer — the phone isn't a screen, it's compute."*

---

## 14. Notion content to insert (UI/UX mockups, inspiration, themes)

> The Notion page (`app.notion.com/p/iQOO-Hackathon-…`) is a private, JS-rendered link, so its content couldn't be auto-scraped into this file. The product "brain," design system, and build plan above are reconstructed from our prior work and are already comprehensive. **Paste the Notion-only visual/curated material into the slots below** (or send it any of the three ways noted under §16), and it folds straight in.

### 14.1 UI/UX mockups
> _[INSERT: screen mockups / wireframes for Brand Voice Setup, Capture, Loading, Results. For each, note layout, key components, and any interaction not already covered in §5. If the mockups differ from §5's flow, the mockups win — flag the delta here.]_

### 14.2 Visual inspiration / references
> _[INSERT: moodboard, reference apps/posts, the "vibe" you're matching. Note anything that should override the §4 design system — e.g., a different accent, font, or card style.]_

### 14.3 Finalized themes / brand details
> _[INSERT: final color/type tokens if changed from §4, logo/wordmark, any motion or illustration style, and the product name if not "Echo".]_

### 14.4 Anything else from the "brain"
> _[INSERT: extra problem framing, target-user notes, competitor notes, or feature ideas from Notion not captured above.]_

---

## 15. Quality bars (consolidated QA)

Every generated output, before it's "good":
- **Hook stops the scroll** on its own (visual+text for Reel/Carousel; first line for Thread).
- **Right length & shape** — Reel 15–30s with cuts every 2–4s; Carousel 5–8 slides one idea each; Thread 5–7 tweets ≤280 chars.
- **Platform-correct hashtags** — Carousel 3–5; Thread 0. (Common bug: applying one platform's rule to another.)
- **Exactly one CTA**, tone-matched.
- **No fabricated** specs/stats/prices; **no named songs** (Reel).
- **Sounds like the chosen tone / pasted samples**, not generic AI.
- **Rendered, not raw** — looks like the real platform.

---

## 16. Open questions / TODOs

- **Insert Notion content** (§14). Three easy ways to get it in: (a) paste the page text into chat; (b) Notion → Share → **Publish to web**, send the `notion.site` link; (c) connect the **Notion** connector and I'll pull it directly.
- Confirm the exact judging rubric on the hackathon site (assumed: innovation, execution, demo polish, sponsor fit).
- Validate **WebGPU in the iQOO browser** before committing to the on-device edge (else mark Cloud APIs only).
- Decide single-call vs parallel synthesis (§11) based on measured latency.
- Pick the product name if not "Echo" (alts considered: Doppel, OneShot, Persona, Mirror).
- Confirm Reel shot-list enrichment: keep `string[]` (default) or move to `{ time, shot, onScreenText, audio }[]` for a richer table.
```

