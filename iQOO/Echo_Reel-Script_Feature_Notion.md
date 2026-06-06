# Echo — Feature 1: The Reel Script + Shot List Engine

> **Where this sits:** Echo turns one input → three branded outputs (Reel script + shot list, IG carousel, X thread). This doc is the build spec + content library for output #1, the **Reel**.
> **Data contract (already defined):** `reel: { hook, script, shotList: [] }` — keep this as the render contract.
> **Brand voice:** "RAG-lite" — 0–4 of the user's real posts/captions injected straight into the prompt. No vector DB.
> **One-liner for this feature:** *"Drop a brief or paste a post. Get a shoot-ready Reel — hook, script, and a timestamped shot list — in your voice."*

---

## 1. What this feature does (in plain terms)

The user gives one input, picks a tone, and gets a Reel they could **actually film today**: a scroll-stopping hook, a scene-by-scene script (what's said + what's shown), and a numbered, timestamped shot list with camera direction and on-screen text.

**Two input modes:**

1. **Brief mode** — user types a one-line brief / inspiration (e.g. *"launching our steel water bottle, keeps cold 24h, leak-proof, 6 colors"*) and picks a tone preset.
2. **Sample mode (RAG-lite)** — user pastes 2–4 of their own past captions/scripts. Echo extracts their voice (pacing, phrasing, energy) and writes the Reel in *their* style. The tone preset becomes seasoning/fallback on top.

**Output:** a 15–30s Reel plan rendered as a **script block (hook highlighted) + a timestamped shot-list table**, with copy buttons and an estimated duration.

---

## 2. Voice priority rule (the core logic)

Identical rule across all three Echo outputs — keep it consistent:

> **If brand samples exist, match the samples first. Tone preset only fills the gaps.**

| Situation | What drives the voice |
|---|---|
| Samples pasted + tone picked | Samples win (phrasing, pacing, energy, emoji habits). Tone seasons what samples don't cover. |
| No samples, tone picked | Tone preset fully drives the voice. |
| Samples pasted, no tone | Samples drive everything; default tone = Professional. |

For a Reel, "voice" = the **script wording + the energy of the edit**. Samples shape the words; the tone shapes the cut.

---

## 3. The 4 tone domains (inject-ready voice specs, Reel-adapted)

Same four personalities as the rest of Echo, but expressed in *video* terms — pacing, cuts, on-screen text, and voiceover. Each block is written to paste straight into the prompt as `{TONE_RULES}`.

### 3.1 Playful — *fun, casual, emoji-friendly*
- **Energy / edit:** fast jump cuts, expressive reactions, slightly chaotic, comedic timing.
- **VO / script:** casual, conversational, talks *to* the viewer. Contractions, asides, self-aware jokes.
- **On-screen text:** emoji-friendly (1–2 per overlay), lowercase-for-vibe, punchy reactions ("ZERO leaks 💧").
- **Audio:** trending / upbeat / comedic.
- **Hook style:** relatable confession, "POV:", playful exaggeration, mini-drama.
- **CTA:** light + warm — "ok go get one, link in bio 👇".
- **Avoid:** stiff demos, corporate VO, anything that feels like an ad read.

### 3.2 Professional — *polished, clear, trustworthy*
- **Energy / edit:** clean, steady shots, premium B-roll, calm pacing, purposeful cuts.
- **VO / script:** clear, full sentences, credible. Demonstrates rather than declares.
- **On-screen text:** minimal, functional, sentence case. Often a single clean label per scene.
- **Audio:** understated, clean background bed.
- **Hook style:** a credible promise or a "here's what we changed" framing.
- **CTA:** calm + direct — "Built to last. Link in bio.".
- **Avoid:** hype, fast gimmicky cuts, exclamation-heavy text.

### 3.3 Bold — *punchy, confident, high-energy*
- **Energy / edit:** hard, fast cuts, big bold text overlays, dramatic hook, strong music sync.
- **VO / script:** short, declarative, hammer rhythm. Takes a stance.
- **On-screen text:** large, high-contrast, occasional ALL-CAPS words for punch.
- **Audio:** high-energy / hard-hitting beat drop on the hook.
- **Hook style:** problem-in-your-face, contrarian, or a stat that slaps.
- **CTA:** commanding — "Buy once. Link in bio. 👇".
- **Avoid:** hedging, slow pacing, walls of text.

### 3.4 Minimal — *clean, concise, no fluff*
- **Energy / edit:** few shots, slow and deliberate, lots of negative space, single product focus. ASMR-adjacent.
- **VO / script:** little or no voiceover — let visuals + sparse text + ambient sound carry it.
- **On-screen text:** one or two words per scene, clean sentence case (or consistent lowercase).
- **Audio:** ambient / minimal beat; often no VO.
- **Hook style:** a crisp visual + a count ("one bottle.").
- **CTA:** shortest possible — "Link in bio.".
- **Avoid:** clutter, busy cuts, anything optional.

---

## 4. Reel-native rules (always on, every tone)

The conventions that make a Reel get watched and shared. Bake these into the system prompt regardless of tone.

- **The first 2 seconds are everything.** The hook must work **visually + as text + (optionally) spoken** at once. If it doesn't stop the thumb, nothing else gets seen.
- **Assume muted viewing.** Most people watch with sound off — every key message needs an **on-screen text overlay**, not just voiceover.
- **Target 15–30 seconds.** Short, high-completion Reels loop and rank better. Go longer (up to ~60s) only for genuine tutorial/value content.
- **Vertical 9:16, safe zones.** Keep text out of the top ~15% and bottom ~20% (UI overlaps there). Hook text sits in the upper-middle third.
- **Cut often.** A new shot every 2–4 seconds keeps retention. Use pattern interrupts.
- **Pay it off + loop it.** End on a payoff; design the last frame to flow back into the first so it replays seamlessly.
- **One clear CTA at the end** — save / follow / link in bio — matched to tone. (Saves & shares are the strongest ranking signals on IG.)
- **Suggest trending audio generically.** Recommend "use a trending upbeat track" — **never name specific copyrighted songs.**
- **Never fabricate.** No specs, stats, prices, or claims not in the brief. If a number isn't given, show the benefit instead.
- **Write a shot list anyone could shoot.** Every shot = timestamp + what's in frame + camera move + on-screen text.

---

## 5. Reel anatomy (the skeleton the engine fills)

```
0:00–0:02  HOOK        visual + text overlay + (optional) spoken hook → stop the scroll
0:02–0:05  SETUP       the promise / the problem / the first beat
0:05–0:??  VALUE beats demonstrate each point, one per shot (fast cuts)
   …       PAYOFF      the reveal / verdict / satisfying result
last 2–3s  CTA + LOOP  save/follow/link in bio, ending that flows back to the hook
```

Minimal collapses to ~4–5 shots; Playful/Bold sit at 6–7 shots.

---

## 6. Hook library (visual + verbal)

The hook is ~80% of a Reel's reach. The engine should always produce a hook that works **on screen** even with sound off.

| Pattern | Text overlay | Spoken (VO) |
|---|---|---|
| Result + timeframe | "i bullied this for 30 days 😅" | "I tried to destroy this and… it won." |
| Problem-in-face | "your bottle is leaking RIGHT NOW" | "Your bottle is leaking in your bag right now." |
| Contrarian | "your routine is built wrong" | "Your morning routine isn't failing because you're lazy." |
| Curiosity gap | "we changed 1 thing. complaints stopped." | "We fixed the one thing everyone complains about." |
| POV / relatable | "POV: your last water bottle" | "POV: you found the only bottle you'll ever need." |
| Crisp count (Minimal) | "one bottle. three things." | *(none — text + ambient)* |

Pair every verbal hook with a **strong opening visual** (a close-up, a dramatic action, a pattern interrupt) — text alone won't hold the thumb.

---

## 7. Shot & camera vocabulary (so the shot list reads like a real call sheet)

Give the engine these terms to draw from:

- **Framing:** extreme close-up (ECU), close-up (CU), medium, wide, top-down / flat-lay, POV shot, over-the-shoulder.
- **Movement:** static/tripod, handheld, push-in / pull-out, whip pan, slow pan, tilt, dolly.
- **Edit:** jump cut, hard cut, match cut, rack focus, slow-mo, time-lapse, speed ramp.
- **Talent:** talking head (to camera), hands-in-frame demo, faceless/product-only, green screen, reaction shot.
- **Per shot, specify:** `time range | shot + camera | what's in frame | on-screen text | (audio cue)`.

---

## 8. CTA library (by tone)

The last 2–3 seconds, matched to voice. Saves & follows are the goal.

| Tone | CTA examples |
|---|---|
| Playful | "ok go get one before they sell out, link in bio 👇 (and follow, i make these for fun)" |
| Professional | "Built to be your last one. Link in bio." / "Save this for when you're shopping." |
| Bold | "Stop wasting money on cheap ones. Buy once. Link in bio. 👇" |
| Minimal | "Link in bio." |

Rotate native CTAs: *"Follow for more"*, *"Save this 🔖"*, *"Comment 'LINK' and I'll send it"*, *"Share with someone who needs it"*.

---

## 9. Worked example — ONE brief, all 4 tones

The showcase + demo gold. Each example = **Hook → Script → Shot List**, ~18–25s.

**Brief:** *"Launching our stainless steel water bottle — keeps drinks cold 24 hours, completely leak-proof, comes in 6 matte colors."*

### 9.1 Playful
**Hook (text):** "i bullied this water bottle for 30 days 😅"
**Hook (VO):** "ok so I tried to destroy this thing… and it won."
**Script:** Open dramatically holding the bottle like a villain. Fast montage of "abuse" — tossed in a stuffed bag, dropped, forgotten in the car. Then the reveals: shake it (no leak), pour it (still cold), show the colors. End defeated-but-impressed.
**Shot list:**
```
0:00–0:02 | CU, talking head, mock-serious face, push-in | text: "i bullied this bottle for 30 days 😅"
0:02–0:05 | jump-cut montage: bottle thrown in messy bag, dropped on floor, shoved in cupholder | text: "the bag test 💼"
0:05–0:09 | pull bottle from bag, shake it hard at camera — nothing spills | text: "ZERO leaks 💧"
0:09–0:13 | pour into glass, ice still solid, sip + shocked reaction | text: "still cold at hour 24?? ✨"
0:13–0:17 | top-down whip-pan across all 6 colors lined up | text: "and the colors 🎨"
0:17–0:22 | hug the bottle, defeated-impressed look | text: "fine. you win 🤝 link in bio 👇"
audio: trending upbeat / comedic
```

### 9.2 Professional
**Hook (text):** "3 fixes. 1 bottle."
**Hook (VO):** "Every bottle fails at one of three things. So we fixed all three."
**Script:** Calm VO over premium B-roll. Demonstrate each fix clearly: temperature (ice intact at 24h), leak (upside down in a bag, interior dry), usability (one-hand cap). Close on the color lineup and a steady CTA.
**Shot list:**
```
0:00–0:03 | push-in on bottle, minimal desk, soft daylight | text: "3 fixes. 1 bottle."
0:03–0:08 | pour water → cut to ice still intact, "24H" graphic | text: "Cold for 24 hours"
0:08–0:13 | place bottle upside down in a bag, lift bag, reveal dry interior | text: "Leak-proof, verified"
0:13–0:17 | one-hand cap open while holding a laptop | text: "One-hand cap"
0:17–0:21 | slow top-down pan across 6 matte finishes | text: "Six finishes"
0:21–0:25 | bottle hero shot, logo | text: "Built to be your last bottle. Link in bio."
audio: clean, understated bed
```

### 9.3 Bold
**Hook (text):** "LEAKING. RIGHT NOW."
**Hook (VO):** "Your water bottle is leaking in your bag right now — and you have no idea."
**Script:** Hard, fast cuts. Big bold text. Dramatize the problem, then hammer each fix. Beat-synced to a strong track.
**Shot list:**
```
0:00–0:02 | ECU, water dripping from a generic bottle inside a bag (the problem) | text: "LEAKING. RIGHT NOW."
0:02–0:04 | hard cut: our bottle slammed onto a table | text: "we fixed it."
0:04–0:08 | flip upside down, shake hard — nothing moves | text: "100% LEAK-PROOF 🔒"
0:08–0:12 | pour, ice solid, whip to "24H" graphic | text: "COLD FOR 24 HOURS ⚡️"
0:12–0:16 | rapid cuts: one-hand cap, cupholder drop, no rattle | text: "details? nailed."
0:16–0:20 | all 6 colors slam in one by one, beat-synced | text: "6 COLORS 🔥"
0:20–0:24 | bottle hero shot | text: "buy once. link in bio. 👇"
audio: high-energy, beat drop on the hook
```

### 9.4 Minimal
**Hook (text):** "one bottle."
**Hook (VO):** *(none — text + ambient sound only)*
**Script:** Slow, deliberate, aesthetic. Single product on a neutral background, generous negative space, a few elegant shots. Two-word overlays. No voiceover.
**Shot list:**
```
0:00–0:03 | static, centered bottle on plain background, soft light | text: "one bottle."
0:03–0:07 | slow pour, condensation ECU | text: "cold 24h."
0:07–0:11 | place in bag, lift, reveal dry | text: "no leaks."
0:11–0:15 | slow pan across 6 colors | text: "six colors."
0:15–0:18 | static hero shot, slow fade | text: "link in bio."
audio: ambient / minimal beat, no VO
```

---

## 10. Second example — non-product brief (proves the engine isn't product-only)

Reels are huge for advice/educational content too. The engine must handle a talking-head insight Reel.

**Brief:** *"Why most morning routines fail."*

### Bold (compact)
```
HOOK (text): "your routine is built wrong."
0:00–0:02 | talking head, direct to camera, fast push-in | text: "your routine isn't failing. it's built wrong."
0:02–0:06 | B-roll: alarm + snooze, text punch | text: "rule 1: can't do it tired? it's not a routine."
0:06–0:10 | habit-stack visual (coffee → journal) | text: "rule 2: stack it onto what you already do"
0:10–0:14 | 5-min timer on screen | text: "rule 3: win in under 5 minutes"
0:14–0:17 | talking head, CTA | text: "save this for 6am 🔖 + follow"
audio: high-energy
```

### Professional (compact)
```
HOOK (text): "Most routines fail in 14 days. Here's the fix."
0:00–0:03 | clean talking head | text: "Most routines collapse in 2 weeks."
0:03–0:08 | calm morning B-roll | text: "They're built for your best day, not your average one."
0:08–0:12 | habit-stack demo | text: "Anchor new habits to existing ones."
0:12–0:16 | small-win visual | text: "Make the first step unskippable."
0:16–0:20 | talking head, CTA | text: "Save this. Try one change tomorrow."
audio: clean, understated
```

---

## 11. The system prompt (copy-paste, with injection slots)

Actual prompt for `/api/generate`'s Reel pipeline. `{CAPS}` get filled at runtime.

```
You are Echo, a brand-voice content engine. Write a shoot-ready Instagram Reel: a hook, a scene-by-scene script, and a timestamped shot list.

INPUT
- Brief / inspiration: {INPUT}
- Selected tone: {TONE}                 // Playful | Professional | Bold | Minimal
- Brand voice samples (RAG-lite): {BRAND_SAMPLES}   // 0–4 of the user's real posts, or "none"

VOICE PRIORITY
1. If BRAND_SAMPLES are present, match THEM first — phrasing, pacing, energy, emoji habits, formality.
   Samples override the tone defaults on any conflict.
2. Use the selected TONE to drive the edit/energy and fill anything the samples don't cover.

TONE SPEC ({TONE})
{TONE_RULES}            // paste the matching block from §3

REEL-NATIVE RULES (always)
- The first 2 seconds are the hook. It must work as a VISUAL + an on-screen TEXT overlay (assume sound is off).
- Target 15–30 seconds total. Aim for a high-completion, loop-friendly cut.
- Vertical 9:16. Keep on-screen text out of the top ~15% and bottom ~20% safe zones.
- New shot every 2–4 seconds. Use pattern interrupts.
- Exactly one CTA in the final 2–3s (save / follow / link in bio), matched to the tone.
- End on a payoff and design the last frame to loop back into the hook.
- Suggest trending audio generically (e.g. "trending upbeat track"). NEVER name a specific song.
- Never invent specs, stats, prices, or claims not in the brief. If a number isn't given, show the benefit.
- Every shot must be filmable: time range, shot + camera move, what's in frame, and the on-screen text.

OUTPUT
Return STRICT JSON only. No prose, no markdown, no backticks outside the JSON:
{
  "reel": {
    "hook": "the on-screen hook text",
    "script": "scene-by-scene narrative incl. the spoken hook and VO/dialogue",
    "shotList": [
      "0:00–0:02 | shot + camera | what's in frame | text: 'overlay'",
      "..."
    ]
  }
}
```

**Runtime assembly:** pick `{TONE_RULES}` from §3 by the selected preset → fill `{INPUT}` and `{BRAND_SAMPLES}` → call the cloud LLM → parse JSON defensively (fallback: treat the whole text as `script` and leave `shotList` empty rather than crash).

---

## 12. Data contract (keep backward-compatible)

Render contract stays exactly as Echo already uses:

```json
{
  "reel": {
    "hook": "i bullied this water bottle for 30 days 😅",
    "script": "Open on a mock-serious close-up… (scene-by-scene)…",
    "shotList": [
      "0:00–0:02 | CU talking head, push-in | mock-serious face | text: 'i bullied this bottle for 30 days 😅'",
      "0:02–0:05 | jump-cut montage | bottle thrown in bag, dropped | text: 'the bag test 💼'"
    ]
  }
}
```

`hook`, `script`, and `shotList[]` are the only fields the renderer needs — don't add required fields (it'd break the shared synthesis schema with Carousel + Thread). **Optional enrichment (only if you have time):** each shot can become an object `{ time, shot, onScreenText, audio }` for a richer table; keep the string form as the default so existing render code keeps working.

---

## 13. UI / render notes (the Reel plan is the demo)

Render in two clean parts:

- **Script card:** the **hook highlighted** at the top (it's the most important line), then the scene-by-scene script. Show an **estimated duration** chip (sum the shot ranges) and a **tone chip**.
- **Shot list:** a numbered, timestamped **table or vertical stepper** — columns: *Time · Shot/Camera · In frame · On-screen text*. Make it look like a real call sheet.
- **Nice-to-have:** a faux 9:16 phone-frame preview showing the current shot's on-screen text over a placeholder — instantly reads as "Reel" to judges.
- **Copy buttons:** copy script, copy shot list, copy all.
- Dark theme, electric-blue accent (`#2F6BFF`), rounded-2xl cards, soft shadows, smooth transitions — consistent with Echo's system.

> The shot list looking like a genuine call sheet is what sells "shoot-ready" to judges. Don't render it as raw JSON.

---

## 14. Reel lingo / trends glossary (use with care — Playful/Bold only)

Native phrases the engine can use for Playful/Bold when samples support it. **Never** in Professional/Minimal, never forced.

`POV:` · `stop scrolling` · `watch till the end` · `green screen` · `B-roll` · `the algorithm` · `it's giving __` · `no notes` · `run don't walk` · `link in bio` · `save this 🔖` · `comment '___'`.

**Hard avoids for brand safety:** fake "this changed my life", clickbait that the payoff doesn't deliver, and engagement-bait the content can't back up.

---

## 15. Build checklist (this component)

- [ ] Tone preset selector wired to the 4 `{TONE_RULES}` blocks (§3).
- [ ] Brand-voice samples from localStorage injected as `{BRAND_SAMPLES}` (reuse Brand Voice Setup — no new storage).
- [ ] `/api/generate` reel branch returns strict JSON matching §12; defensive parse with a "whole text → script" fallback.
- [ ] Hook is always present and works as on-screen text (test with sound-off framing).
- [ ] "Never fabricate" rule verified — vague brief in, no invented specs out.
- [ ] No specific song names ever appear in output (only "trending audio" style suggestions).
- [ ] Script card (hook highlighted) + shot-list table renderer with copy buttons + duration chip (§13).
- [ ] Test all 4 tones against the §9 brief → script wording AND edit energy should clearly differ.
- [ ] Test sample mode: paste 2 captions in a quirky voice → confirm script mimics it over the preset.
- [ ] Demo dry-run: brief → pick tone → Reel plan renders in < 2s and looks shoot-ready.

---

## 16. Quick QA rubric (is the output good?)

Score 0/1 each — aim for 8/8:

1. Does the **hook** work in the first 2s as both a visual and on-screen text?
2. Is it **15–30s** with a new shot roughly every 2–4s?
3. Does every key point have an **on-screen text overlay** (muted-safe)?
4. Is the **shot list filmable** — time, shot, camera, in-frame, text on each line?
5. Exactly **one CTA** in the final 2–3s, tone-matched?
6. Is the ending a **payoff that can loop**?
7. **No fabricated** specs and **no named songs**?
8. Does the script's wording + edit energy match the **chosen tone / pasted samples**?
```
