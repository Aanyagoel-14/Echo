# Echo — X Thread Generator (Build Notes)

> Component 3 of the Multi-format Synthesis hero (PS3).
> One input → a ready-to-post X thread, in a chosen tone + matched to the user's voice.
> Sibling components: ① Reel script + shot list · ② Instagram carousel · **③ X thread (this doc).**

---

## 1. What this feature does (one-liner)

**Give Echo a one-line brief *or* paste a sample post, pick a tone, and get back a posting-ready X thread** — stacked tweet cards, each under the char limit, with a scroll-stopping hook and a clean CTA.

Two input modes:

| Mode | User gives | Echo does |
|------|-----------|-----------|
| **A — Brief** | One line ("launching our voice-to-task app") | Writes a full thread from scratch in the selected tone |
| **B — Paste a sample** | One of their own past posts | Extracts their voice fingerprint (casing, rhythm, slang, emoji habits) and writes a *new* thread in that matched voice |

Tone (the 4 domains) and the pasted/brand sample work as **two layers**:
- **Tone = the register** (the broad lane: Playful / Professional / Bold / Minimal).
- **Brand samples / pasted post = the fingerprint** (the specific person inside that lane).
- Mode B can auto-detect the closest tone, or blend: "Playful, but in *their* voice."

---

## 2. Input contract

```
{
  "mode": "brief" | "sample",
  "input": "<one-line brief>" | "<pasted sample post>",
  "tone": "playful" | "professional" | "bold" | "minimal",
  "brand_samples": ["<post 1>", "<post 2>", "...up to 4"],   // RAG-lite, optional
  "thread_length": 5,            // default 5–7, hard cap 9
  "include_thread_emoji": true   // the 🧵 indicator, tone-dependent default
}
```

**RAG-lite reminder (from the hero spec):** do *not* build a vector DB. Just paste 2–4 brand samples straight into the prompt context. Judges won't see a difference; you save hours.

---

## 3. The 4 tone profiles (tuned for X)

These are the actual instruction blocks you inject as `{{TONE_PROFILE}}`. Each is written so the model behaves natively on X, not like a blog.

### 🎈 Playful — *fun, casual, emoji-friendly*
- **Casing:** lowercase-leaning, casual. Contractions everywhere.
- **Rhythm:** chatty, conversational, mid-thought asides. "ok so", "no bc", "the way I—".
- **Emoji:** 1–3 per tweet, used for punctuation/vibe (👀 💀 🌙 ⚡ 😭 🔥).
- **Signature moves:** relatable callouts, self-deprecating humor, "POV:", "iykyk", "fr". Tag-a-friend energy.
- **Hook style:** unhinged-but-relatable confession or a "POV: you just…" scenario.
- **CTA:** "drop a 🔥 if you relate", "tag the friend who…".
- **Hashtags:** 0–2 max, only if genuinely additive.

### 💼 Professional — *polished, clear, trustworthy*
- **Casing:** standard sentence case. Complete, well-formed sentences.
- **Rhythm:** measured, confident, no slang. Reads like a smart founder/operator.
- **Emoji:** 0, or a single subtle one in the hook at most.
- **Signature moves:** credibility cues ("In early testing…", "What we learned…"), value-first framing, respect for the reader's time.
- **Hook style:** a clear value promise or a sharp insight, not hype.
- **CTA:** soft — "Follow along for more on [topic]", "We'll share the link here."
- **Hashtags:** 0–1, topical only.

### ⚡ Bold — *punchy, confident, high-energy*
- **Casing:** sentence case with hard line breaks. Fragments are fine.
- **Rhythm:** short, declarative, imperative. "Stop X. Start Y." Strong verbs.
- **Emoji:** 0–1, used as a hit, never decoration.
- **Signature moves:** contrarian opener, reframes ("You don't have a motivation problem. You have a capture problem."), conviction.
- **Hook style:** a strong claim that picks a fight with conventional wisdom.
- **CTA:** high-energy — "RT this. Someone needs to hear it."
- **Hashtags:** 0–1, punchy.

### ▫️ Minimal — *clean, concise, no fluff*
- **Casing:** sentence case, lots of whitespace, very short lines.
- **Rhythm:** the fewest words that carry the idea. One thought per line.
- **Emoji:** 0. **Hashtags:** 0.
- **Signature moves:** definition-style statements, before/after framing, dense value.
- **Hook style:** a single sharp line. A number. A claim with no setup.
- **CTA:** minimal or none. "Link soon." / "That's the thread."

---

## 4. Anatomy of a great X thread (the structure the model must always follow)

1. **Hook tweet (tweet 1) — the whole game.** Must stop the scroll on its own. Ends with a thread cue (`🧵`, `🧵👇`, `a thread:`) when tone allows. Never bury the value.
2. **Body tweets (2 → n-1) — one idea each.** Use line breaks, not paragraphs. Each tweet must stand alone *and* pull to the next.
3. **CTA / close (last tweet) — one ask.** Follow, RT the first tweet, bookmark, reply prompt, or soft link drop. Exactly one ask, matched to tone.

**Hard formatting rules on X:**
- Standard tweets have **no bold/italics** — use line breaks and whitespace for emphasis, and emoji bullets (`•` `→` `✅`) only in Playful/Bold.
- Default to **≤280 characters per tweet** so it renders everywhere (note: Premium long-form exists, but 280-safe is the right default for the demo + universal posting).
- Numbering (`1/`, `x/n`) is optional and tone-dependent — Minimal/Bold often skip it; it can read dated. Prefer the connected-card thread look over manual "1/7".

---

## 5. The generation prompt (system + user template)

**System prompt:**

```
You are Echo's X Thread engine. You turn a single input into a posting-ready
X (Twitter) thread that looks and reads like it was written by a sharp human
creator, not an AI.

NON-NEGOTIABLE RULES
- Output ONLY valid JSON in the schema given below. No preamble, no markdown.
- Tweet 1 is a scroll-stopping HOOK. The last tweet is a single clear CTA.
- One idea per tweet. Use line breaks, never long paragraphs.
- Every tweet must be <= 280 characters. Count carefully.
- Thread length = {{THREAD_LENGTH}} tweets (range 5–9).
- Do NOT invent specific stats, numbers, prices, or claims that aren't in the
  input. If a strong line needs a number, write it as a [bracketed placeholder]
  for the user to fill.
- No spammy engagement-bait ("follow for follow", "RT to win"). CTAs must feel
  authentic to a real creator.
- Respect the tone and hashtag/emoji policy below exactly.

TONE PROFILE
{{TONE_PROFILE}}      // paste the matching block from §3

VOICE MATCH (RAG-lite — optional)
The following are real samples of the user's / brand's own posts. Mirror their
casing, sentence length, punctuation habits, recurring phrases, and emoji usage.
Match the voice; do not copy the content.
{{BRAND_SAMPLES}}     // 2–4 samples, or the single pasted sample in Mode B
```

**User message template:**

```
MODE: {{MODE}}            // "brief" or "sample"
INPUT: {{INPUT}}          // the one-line brief, or the pasted sample to extend
TOPIC HINT: {{TOPIC}}     // optional

Write the thread now. Return JSON only.
```

---

## 6. Output schema (for rendering stacked tweet cards)

```json
{
  "tone": "playful",
  "topic": "Lumen launch",
  "thread_indicator": "🧵",
  "hashtags": [],
  "thread": [
    { "n": 1, "role": "hook", "text": "...", "chars": 142 },
    { "n": 2, "role": "body", "text": "...", "chars": 119 },
    { "n": 3, "role": "body", "text": "...", "chars": 201 },
    { "n": 4, "role": "cta",  "text": "...", "chars": 96  }
  ],
  "notes": "internal rationale, hidden from user"
}
```

**Rendering notes (make it LOOK like X):** avatar + display name + `@handle` + timestamp, body text with line breaks preserved, the vertical connector line between cards, a decorative action row (reply / RT / like / bookmark), and a live char counter per card that turns red over 280. Add **Copy all** and **Copy per-tweet** buttons. "The polish of the output is the demo."

---

## 7. WORKED EXAMPLES — one brief, all 4 tones

> **Shared brief:** *"Launching Lumen — an app that turns rambling voice notes into clean, organized to-do lists in seconds."*
> These are the "gold standard" outputs — the bar Echo should hit. Use them as few-shot examples in the prompt if quality drifts.

### 🎈 Playful

```
1/ ok so i just talked to my phone for 4 minutes straight like a lunatic
and it handed me a perfectly organized to-do list 🧵👇

2/ my brain at 11pm:
"remember the dentist the gym mom's bday call the landlord oh and oat milk"

me, normally: writes down "oat milk." forgets the other four. 💀

3/ enter Lumen 🌙
you just… talk. ramble. spiral. whatever.
it listens and turns the chaos into actual tasks.
no typing. no "i'll organize it later" (you won't).

4/ tested it on my most unhinged voice note yet
(8 mins, 3 tangents, 1 mini existential crisis)

output? a clean checklist. categorized. iykyk how unserious my notes app
usually is 😭

5/ best part: it's fast.
like "done before you finish overthinking" fast ⚡
your future self is gonna be so smug

6/ we're letting a few people in early 👀
drop a 🌙 for the link + tag the friend whose voice memos are 6 minutes
long for absolutely no reason
```

### 💼 Professional

```
1/ Most productivity tools assume you already know what your tasks are.
Lumen starts a step earlier. Here's the thinking behind it. 🧵

2/ The hard part of staying organized isn't the to-do list itself.
It's the gap between having a thought and writing it down — and ideas
tend to arrive when your hands are busy.

3/ Lumen closes that gap.
Record a voice note the way you'd think out loud. Lumen transcribes it and
structures it into clear, categorized tasks. No manual cleanup.

4/ In early testing, people captured noticeably more tasks than they did by
typing — simply because the barrier to capture was lower.
Less friction, fewer dropped commitments.

5/ It's built to respect your time and your data:
capture in seconds, review when you're ready, private by default.

6/ We're opening early access this week.
If turning scattered thoughts into a clear plan sounds useful, follow along —
we'll share the link here, and we'd value your feedback.
```

### ⚡ Bold

```
1/ Your to-do list isn't broken.
Your capture is.

You lose most of your best ideas before they ever hit the page.
Lumen fixes that. 🧵

2/ Typing is a tax.
By the time you unlock, open the app, and start typing — the thought is gone.
Speed wins. Lumen is built for speed.

3/ Talk. That's it.
Ramble for five minutes. Lumen turns it into a clean, organized task list
before your coffee's cold.
No formatting. No friction. No excuses.

4/ Stop blaming your discipline.
You don't have a motivation problem.
You have a capture problem.
Fix the capture and the follow-through takes care of itself.

5/ This is what "effortless" actually looks like:
Voice in. Plan out. Seconds.
Everything else is a notes app pretending.

6/ Early access opens this week.
If you're done losing ideas — follow now and RT the first tweet.
Someone in your timeline needs this.
```

### ▫️ Minimal

```
1/ Talk. Get a to-do list.

That's Lumen.

2/ The problem:
ideas come when you can't type.

The fix:
capture them with your voice.

3/ You ramble.
Lumen organizes.

Voice note → clean, categorized tasks.
Seconds, not minutes.

4/ No typing.
No formatting.
No "I'll sort it later."

5/ Early access this week.
Link soon.
```

---

## 8. Mode B example — paste a sample → voice-matched thread

> This demonstrates the RAG-lite voice clone. Same Lumen brief, but written in *the user's* voice extracted from one pasted post.

**Pasted sample (the voice fingerprint):**

```
genuinely think "i'll remember it later" is the most expensive lie i tell
myself daily. i have never once remembered it later. not one time.
```

**Extracted fingerprint:** lowercase · dry, self-deprecating · absolute statements for comedy ("not one time") · no emoji · conversational · relatable-confession structure.

**Generated thread (matched voice):**

```
1/ i have lost more good ideas to "i'll write it down in a sec" than to
anything else in my entire life. so i stopped writing them down.
i talk to my phone now. 🧵

2/ it's an app called Lumen. you ramble into it like a maniac and it hands
you back an actual organized to-do list. no typing. which is good because
i do not trust myself to type.

3/ tested it on a 6 minute voice note with three unrelated topics and a
grocery list buried in the middle. it found the grocery list.
i would not have found the grocery list.

4/ the bar was "better than my notes app." reader, that bar was on the floor.
it cleared it anyway.

5/ anyway it's opening to a few people this week. if you also lie to yourself
about remembering things, you'll probably want this.
```

Note how it kept lowercase, the dry absolutes, and zero emoji from the sample — that's the win condition for Mode B.

---

## 9. X lingo & convention cheat sheet (seed the prompt / few-shot from here)

**Hook patterns**
| Pattern | Example skeleton | Best tones |
|---|---|---|
| Curiosity gap | "i just [did X] and the result genuinely surprised me 🧵" | Playful, Bold |
| Contrarian claim | "Everyone's wrong about [thing]. Here's why." | Bold |
| Listicle promise | "[N] [things] that [outcome]:" | All |
| Personal result | "I [did X] for [time]. Here's what happened." | Playful, Professional |
| Reframe | "Your [problem] isn't [obvious cause]. It's [real cause]." | Bold |
| POV / scenario | "POV: you just [relatable moment]" | Playful |
| Value promise | "Here's how to [outcome] without [pain]." | Professional |

**CTA patterns (one per thread)**
- Follow for more on [topic]
- RT the first tweet to help someone
- Bookmark this 🔖
- Reply prompt: "what did I miss? 👇"
- Tag a friend who needs this
- Soft link drop: "link's in the next tweet / coming this week"

**Formatting tricks**
- Line breaks > paragraphs · one idea per tweet
- Emoji bullets (`•` `→` `✅`) — Playful/Bold only
- Whitespace for emphasis (no native bold)
- `🧵` / `🧵👇` / `a thread:` as the cue
- Manual `1/ 2/ x/n` optional — often skipped in Minimal/Bold

**Lingo glossary (use sparingly, mostly Playful/Bold)**
`hot take` · `unpopular opinion` · `POV` · `iykyk` · `fr / frfr` · `the algorithm` · `ratio` · `banger` · `based` · `W / L` · `normalize` · `respectfully` · `this you?` · `the way that…` · `no bc` · `ok but`

---

## 10. Guardrails & edge cases

- [ ] **Char limit:** enforce ≤280 in code, not just the prompt. Re-prompt or truncate-and-flag if a tweet overflows.
- [ ] **No fabricated facts:** stats/prices/dates that aren't in the brief become `[bracketed placeholders]`. Protects trust on stage.
- [ ] **Hashtag policy by tone:** Minimal 0 · Professional 0–1 · Bold 0–1 · Playful 0–2. Never stuff.
- [ ] **Emoji policy by tone:** Minimal/Professional 0 (Pro: ≤1 in hook) · Bold 0–1 · Playful 1–3.
- [ ] **No banned engagement-bait** ("RT to win", "follow-for-follow") — X penalizes it and it reads cheap.
- [ ] **Thread length** default 5–7, hard cap 9. Long ≠ good.
- [ ] **Mode B fidelity:** mirror casing/punctuation/emoji of the sample even if it conflicts with the tone preset; the sample wins.
- [ ] **Empty/weak brief:** if the brief is one vague word, ask for one clarifying detail OR generate a "best-guess" thread with placeholders, clearly marked.

---

## 11. Build checklist (hackathon-scoped)

- [ ] Tone selector — 4 chips (🎈 💼 ⚡ ▫️)
- [ ] Input box + "Paste a sample instead" toggle (Mode A / B)
- [ ] Brand samples field (0–4) — RAG-lite, plain text
- [ ] Wire prompt template (§5) → Cloud LLM API
- [ ] Parse JSON (§6); validate char counts client-side
- [ ] Render stacked tweet cards with connector line + fake action row
- [ ] Live char counter (red > 280)
- [ ] Copy all / copy per-tweet
- [ ] Regenerate + per-tweet inline edit
- [ ] Seed few-shot from §7 if output quality drifts

**Demo line:** "One brief, four voices, a thread that's ready to post — generated on the phone."
