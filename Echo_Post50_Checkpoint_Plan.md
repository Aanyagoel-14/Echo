# Echo — Post-50% Checkpoint Plan (Event-Day Build)

**Project:** Echo — the creator's digital twin · PS3 (Autonomous AI Social Media Engine)
**Event:** iQOO Hackathon 2026 · 8-hour AI build sprint
**Where you are now:** ~50% done = infra + installable PWA + 4-screen shell + **mock-data** renderers (CP0–CP8 complete). The UI *looks* finished; it has no real brain yet.
**What this file covers:** every checkpoint from here to a winning, demo-ready build — **CP9 → CP20.**

> **Refined (2026-06-06):** re-centered on the **Voice Profile** — a personalised `voice.md` the twin learns **on-device** and injects into every generation. The twin is no longer "two-stage generation"; it's *a voice that lives on the phone and gets more you each time you use it.* This promotes closed-loop learning from a cut-first edge feature to the product's spine.

---

## 0. The shift this plan is built around (read first)

The new rubric rewards the iQOO hardware three times over. So on-device LLM is **no longer an optional edge feature — it is a core, scored pillar**, and it must do *real product work* (not fake load), or R3 ("AI integrated, not bolt-on") penalizes you.

**The thing the on-device model does is the product's identity: it learns the creator's voice.**

Today "brand voice" is a tone preset + a blob of pasted posts, dumped raw into the synthesis prompt. We turn that into a first-class, *learned* artifact:

> **The Voice Profile** — a personalised `voice.md` (the creator's own "skills file"), **distilled on-device** from their posts, **stored on the phone**, **injected into every generation**, and **refined every time** they approve or edit a result. By default your voice lives **on your device**; you can later *opt in* to share into the collective that makes everyone's suggestions smarter (§0.2). Either way the twin gets more *you* with use.

**The architecture: the "living twin."**

```
                    ┌──────────────────────────────────────────┐
                    │  VOICE PROFILE  —  the twin's identity     │
                    │  voice.md, learned & refined ON-DEVICE,    │
                    │  stored on the phone, injected ALWAYS      │
                    └───────────────┬──────────────────────────┘
                                    │  injected as a voice block
   Capture (photo / brief)         │  into BOTH stages
         │                         ▼
         ▼                 [Stage 1 · ON-DEVICE]  WebLLM + Voice Profile
                              → instant rough draft of Reel + Carousel + Thread,
                                already in the creator's voice (offline, private)
                                    │
                                    ▼
                           [Stage 2 · CLOUD]  OpenRouter (vision + text) + Voice Profile
                              → polished, voice-locked final across all three formats
                                    │
                                    ▼
                           Results → Approve / Edit
                                    │
              [ON-DEVICE refine] ◄──┘  delta feeds back → Voice Profile updates
                                       → the twin is a little more "you" next time
```

Three stages, but the heart is **Stage 0 — the Voice Profile** — built and refined on-device, consumed by Stages 1 & 2, written back to by the closed loop. Better product (instant, private, voice-true) **and** it maxes every criterion at once: the on-device model is doing identity-level work, continuously, visibly.

### 0.1 The flow: set up once, create every day

Echo has **two phases** — a one-time **setup** that builds the twin, and a **creation loop** the creator returns to every day.

```
FIRST RUN (once)                       EVERY RUN AFTER (the loop)
────────────────                       ──────────────────────────
Welcome / sign-in                      Boot → Voice Profile found
   │                                      │
   ▼                                      ▼
Build Voice Profile ──┐             "What do you want to create?"
(paste posts →        │  voice.md        (Capture: photo / brief)
 on-device distill →  │  saved on         │
 edit the voice.md)   │  the phone        ▼
   │                  └──────────►   Voice-injected draft → cloud polish
   ▼                                      │
Saved. Never asked again.                 ▼
                                       Results → Approve / Edit
                                          │
                                          └─► on-device refine → voice.md sharpens
                                              (loop back to "what next?")
```

**Boot gate.** On launch, Echo checks for a stored Voice Profile:

- **None →** first-run onboarding: a short welcome, then the **Voice Profile builder** (CP12). This is the *only* time the creator is asked to set up their voice.
- **Found →** straight into **Capture** — *"what do you want to create today?"* — profile auto-injected. Setup is never repeated; the creator just makes content, and the twin keeps learning (CP16).
- A **"Profile" affordance** (header/settings) reopens the `voice.md` for edits anytime — off the critical path.

> **Scope note — "sign-in" is local first-run, not heavyweight auth.** Setup is a *first-run* experience and the personal `voice.md` lives **on the device** (localStorage) — Tier 1 is local-first and **mandatory**. The collective layer (**Tier 2**, §0.2) is an **opt-in, anonymous** contribution to a global vector DB — it needs no full account system (just an anonymous contributor id), so onboarding stays lightweight. Real per-user accounts + cross-device sync remain a separate, later decision; neither tier needs them to ship.

### 0.2 Two tiers of voice: yours (local) + the collective (global)

The open question resolves to a **hybrid**, in two tiers:

**Tier 1 — your Voice Profile (local · personal · mandatory).** The `voice.md`, distilled and refined **on-device**, stored on the phone. It governs **how you sound** — your identity. Always present, always injected. This is both the privacy pillar and the on-device scoring pillar; it ships in the core build (CP12–CP16).

**Tier 2 — the Echo Network (global · collective · opt-in · *later*).** Creators can opt in to contribute their `voice.md` to a **global vector DB**. The combined narrative across *all* creators becomes a retrieval source that **suggests what to post** — angles, hooks, structures, themes that resonate across the community. It governs **what works**, not how you sound.

```
                    ┌──────────────────────────────────────────────┐
  creating a    ──► │  GENERATION draws on TWO sources              │
  new post          │                                              │
                    │  Tier 1 · your voice.md (local)              │
                    │     → HOW it sounds — your voice, locked      │
                    │                                              │
                    │  Tier 2 · Echo Network vector DB (cloud)      │
                    │     → WHAT to say — suggestions from the      │
                    │       combined narrative of all creators      │
                    └──────────────────────────────────────────────┘
     result: a post that's unmistakably *yours*, informed by what's working
     across the whole platform — and the network gets smarter for everyone
     as more creators join.
```

**The one rule that keeps this coherent:** *Tier 2 may shape the **idea/structure**, never the **voice**.* Voice comes only from your local `voice.md`. If the global corpus were allowed to rewrite tone, every creator would converge to a bland average — the opposite of a twin. Keep them on separate prompt rails: Tier 2 fills the *what*, Tier 1 owns the *how*.

**Privacy default:** contribution is **opt-in** and stores **embeddings + derived patterns** (hook shapes, theme tags), not your raw personal `voice.md` verbatim — anonymous, no account required. Sharing raw text or attaching identity is an explicit, separate consent step.

**Why it's worth it (R4):** a real **data-network-effect moat** — the product gets better for everyone the more creators use it, while each creator's voice stays their own. That's the difference between a tool and a platform. **Build order:** Tier 2 is **Phase 2** (see §11) — sequenced *after* the on-device core, protected by the cut list; it must never jeopardize the hero path.

---

**Two hard timing rules:**

- **Build on the bridged phone even during green zones.** Every minute on a laptop is R1 points lost. Use the laptop only for things genuinely impossible on the bridge.
- **Front-load logged build activity before 16:45** (the buildScore snapshot). Heaviest checkpoints should land before then.

---

> The on-device work — distilling the profile (CP12), the local draft (CP13), and the refinement loop (CP16) — is the GPU-heavy stuff and **belongs in red light** where the device-push metric is measured. The plain *paste/edit UI* of the Voice Profile builder is keyboard work and can be scaffolded in green; only its on-device distillation must run in red.
> Confirm the exact schedule the moment you arrive. If green/red are interspersed, the rule still holds: keyboard-heavy work in green, on-device + AI iteration in red.

---

## 3. PRE-FLIGHT GATE — do this tonight, before doors

### CP9 — Validation gate (GO / NO-GO for on-device)

This single session de-risks the entire plan. Do all three on the actual iQOO, on the Office Kit bridge.

1. **WebGPU + WebLLM:** load a small model in the iQOO browser and run one inference.
2. **Phone-bridge coding loop:** open your cloud IDE (Claude Code on the web *or* Replit) on the bridge, make one edit, redeploy, see it on the live URL.
3. **OpenRouter cloud:** one successful **vision + text** call from your server-side function, key in secrets, credits confirmed.

- **Done =** local model runs an inference on the device **AND** a phone-browser edit redeploys live **AND** one OpenRouter vision+text call returns.
- **Serves:** unblocks everything.
- **⚠️ Heightened stake:** the Voice Profile is *built* on-device, so WebGPU GO now gates the twin's **identity**, not just a draft. Distillation is only a text task — if any inference runs, distillation runs — so the bar is the same WebGPU GO.
- **NO-GO branch:** if WebGPU fails on the iQOO browser → **stop and message me immediately.** Fallback that *keeps the product*: the **cloud builds the Voice Profile once** (server-side OpenRouter call), we **cache `voice.md` locally**, and it's still injected into every generation — so the "living twin / your voice.md" story survives. You lose the on-device-distillation scoring, not the concept. Demote on-device to the lightest real task that *does* run. Do **not** fake on-device.

> Model picks for WebLLM: start **Qwen2.5-1.5B-Instruct (q4f16)** for speed; try **Qwen2.5-3B** or **Llama-3.2-3B** to "push limits" if the device holds. **Pre-cache the model** tonight so first load isn't a demo-killer (confirm exact model IDs against the WebLLM model list).

---

## 4. GREEN SETUP — CP10–CP11 (front of event)

### CP10 — Lock the environment on the bridge

Open the cloud IDE on the Office Kit bridge, pull the repo, confirm the live URL renders on the phone, secrets present. **Start accumulating phone-bridge time from minute one** (R1).

- **Done =** live URL works on the bridged phone, repo synced, secrets set, you can edit→redeploy.
- **Serves:** R1.

### CP11 — Load the on-device model into the app

Integrate the chosen WebLLM model into Echo, wire the pre-cached weights, confirm it loads and produces text *inside the app* on the device (not just a test page). This single engine now powers **two** things: distilling the Voice Profile (CP12) and the local draft (CP13).

- **Done =** tapping a "warm engine" action runs the local model in-app and returns tokens.
- **Serves:** R2; the prerequisite for the whole twin.

---

## 5. RED LIGHT — CP12–CP17 (the core build; the device-push metric is measured here)

### CP12 — Voice Profile builder (Stage 0, on-device) ⭐ the spine

**This is the first-run setup step** (§0.1) — on first launch, after a short welcome, the creator builds their twin **once** and is never asked again. Reframe the **Brand Voice Setup** screen into the **Voice Profile builder**. The creator pastes a few of their posts (the existing tone preset stays as an optional *scaffold/cold-start* seed). On "Build my voice," the **on-device model distills** the posts into a structured, **editable `voice.md`** and persists it locally.

- **The artifact** (`localStorage` key `echo.voiceProfile.v1`):
  ```js
  {
    version: 1, builtAt, updatedAt, revisions: 0,
    source: { sampleCount, sampleHash, tone /* scaffold preset id, optional */ },
    profileMarkdown: "# Creator Voice Profile\n...",  // THE injectable voice.md
    traits: { voiceOneLiner, register, vocabulary[], avoid[], emojiHabit,
              sentenceRhythm, hookPatterns[], topics[] }  // structured mirror for UI/edits
  }
  ```
- **Relationship to today's code:** the existing `brandVoice = { tone, samples }` is **demoted to scaffold input** that *feeds* the builder; the builder's *output* is the new first-class `voiceProfile`. Keep `lib/brandVoice.js` for the scaffold; add `lib/voiceProfile.js` for the artifact.
- **Distillation prompt (on-device):** "From these posts, write a compact voice guide" → sections: *Voice in one line · Tone & register · Signature words/phrases · Sentence rhythm · Emoji & punctuation habits · Hook patterns · Topics & POV · Hard don'ts.* Strict, short, human-readable.
- **Show it:** render the `voice.md` on screen — *"Echo learned this about how you write, on your phone, offline."* Let the creator edit it. This is the literal "skills.md for you."
- **Boot gate (the flow, §0.1):** launch checks for a stored profile — **none →** this builder runs as first-run onboarding; **found →** skip straight to Capture. A "Profile" affordance reopens the builder later, off the critical path.
- **Done =** paste posts → on-device distill → an editable `voice.md` is shown and persisted on the device.
- **Serves:** R2 + the new metric (real on-device work), R4 (the twin made tangible + private).

### CP13 — On-device draft (Stage 1), voice-injected

Wire the local model into the capture flow. On capture (or brief), the on-device model produces an instant first-pass of Reel + Carousel + Thread **with the Voice Profile injected** as a system block — so the rough draft already sounds like the creator. Same JSON shape the renderers consume. No network.

- **Injection:** prepend `# Creator Voice Profile (write strictly in this voice)\n<profileMarkdown>` to the draft prompt.
- **Done =** capture → local rough draft renders in all three formats, in the creator's voice, fully offline.
- **Serves:** R2, new metric.

### CP14 — Cloud polish (Stage 2), voice-locked

Replace the mock `/api/generate`. Real OpenRouter call: vision on the product image + text synthesis + **Voice Profile injection** + **strict JSON schema** (`{ reel:{hook,script,shotList[]}, carousel:{slides[]}, thread:{tweets[]} }`), no prose outside JSON. The profile text travels in the request body (it's the creator's own data — fine to send; **still no secrets client-side**) and the server places it in the system message. Each format shaped for its platform.

- **Seam:** `generateKit({ input, image, inspiration, voiceProfile })`. The inspiration references (already wired) refine *structure/pacing*; the Voice Profile locks *voice*.
- **Phase-2 hook (Tier 2, §0.2 / §11):** this `/api/generate` step is the join point where the cloud also retrieves **suggestions** from the Echo Network vector DB (the *what*) and adds them to the prompt — strictly as idea/structure input, with the personal `voice.md` remaining the sole source of *voice*. Not in the core build; shape the seam so it can be added later without touching the client.
- **Done =** capture → cloud returns a polished, **voice-locked**, schema-valid multi-format kit.
- **Serves:** R3 (prompt + model quality), R4 (the content judges actually read).

### CP15 — Pipeline + On-Device Engine panel

Chain Stage 1 → Stage 2: show the instant local draft, then visibly **upgrade** it to the cloud-polished version. Add the **On-Device Engine panel** — model name, tokens/sec, "GPU active" — plus a small **"Voice Profile active"** indicator so judges see the twin's identity is in play.

- **Done =** user sees instant local draft → smooth upgrade to cloud polish, engine panel live, voice indicator on.
- **Serves:** R2, R3 (latency story), new metric (visible proof).

### CP16 — Closed-loop refinement (Stage 0 ⟲, on-device) ⭐ the device-push flagship

**This is where the living twin and the red-light device-push metric become the same thing.** On Results, add **Approve / Edit**:

- **Approve** → the accepted post becomes a new high-signal sample.
- **Edit** → the (draft → edited) **delta** is fed back as a correction.

The **on-device model re-distills** an updated `voice.md` from the new signal (bump `revisions`, update `updatedAt`), and a subtle cue confirms *"your voice profile leveled up."* Every approve/edit is real, product-justified, GPU-heavy on-device inference — sustained load through red light, never artificial.

- **Done =** approving/editing measurably shifts the next generation's voice; the engine panel shows the on-device model busy refining through the red-light window.
- **Serves:** the new metric (primary), R2, R3, R4 (the "gets more *you*" hook).
- **Graceful degrade (if time-pressed):** keep injection (CP13/CP14) and ship *build-once* profiles; drop continuous refinement to a single on-device refine firing so the metric still has real work.

### CP17 — Robustness / never-fail flow

Defensive JSON parsing with fallbacks; **cloud fails → fall back to the local voice-injected draft** (don't blank the screen); **no profile yet → fall back to the tone scaffold**; vision fails → text-brief path; clean empty/error/loading states.

- **Done =** every input path returns *something* presentable, always in-voice when a profile exists; no hard crash on stage.
- **Serves:** protects the live demo (R2), R4.

---

## 6. GREEN POLISH — CP18–CP20 (back of event; keep the bridge on for R1)

### CP18 — Visual polish

Transitions, iQOO-blue theme, copy-to-clipboard on every output, swap any stock graphics for **real screenshots**, premium engine panel + the **"voice leveled up"** cue. Make the `**voice.md` reveal look like a crafted artifact** (it's a hero moment). Renderers stay platform-native (carousel = swipeable snap-scroll, thread = stacked tweet cards, reel = script + numbered shot list).

- **Done =** the full flow feels finished; the Voice Profile looks like a real, ownable thing.
- **Serves:** R2 (native feel), R4.

### CP19 — Demo hardening

Pre-build a **golden Voice Profile** for a known creator persona and pre-cache the **golden-path example** (one product + that profile + a generation you know looks great). **Record a backup demo video.** Right before judging: warm OpenRouter, pre-load the on-device model, **and pre-load the golden `voice.md`** so the first response is instant and on-voice.

- **Done =** backup video exists, golden path (incl. profile) is instant, both engines warm.
- **Serves:** protects R2/R3/R4 against venue wifi + cold-start.

### CP20 — Deck + pitch

Finalize the 8-card deck, export to PDF as backup, rehearse the live phone demo **twice** end-to-end. Lead the story with the **living twin**: *"Echo learns your voice on your own phone, never sends it away, and gets more you every time you post."*

- **Done =** two clean end-to-end rehearsals done; deck + PDF backup ready.
- **Serves:** the score conversion across all four.

---

## 7. Cut order (if you fall behind)

Drop from the bottom up, **never touch the core hero path** (build voice → capture → voice-injected local draft → cloud polish → render):

1. CP16 *continuous* refinement → degrade to **build-once profile** (keep injection; keep ≥1 on-device refine firing for the metric).
2. CP15 pipeline flourish → show one stage well rather than the upgrade animation.
3. CP14 vision → fall back to text-brief input only (profile injection still applies).
4. On-device model size → drop to the 1.5B for stability.

**Non-negotiables that must survive:** CP12 (the Voice Profile, built on-device), CP13 (voice-injected on-device draft), CP15 (engine panel + pipeline), CP17 (never-fail), CP19 (backup video), the live demo on the phone.

---

## 8. OpenRouter ($25 credit) — usage notes

- **Role:** Stage-2 cloud polish (the heavy synthesis the judges read), and the **NO-GO fallback builder** for the Voice Profile if WebGPU fails.
- **Voice injection:** the `profileMarkdown` is the creator's own data — it travels in the request body and the server puts it in the **system message**. The **API key stays server-side only** (function/secrets), never in client code.
- **Model choice (R3):** pick from OpenRouter's live list with three filters — **vision-capable**, **fast**, **cheap to spam in testing**. A Gemini-Flash-class multimodal model is the ideal default; wire a GPT-4o / Claude-class model as a one-line fallback for the live demo.
- **Budget:** $25 is plenty for a hackathon's volume — but cache the golden path so you're not re-calling it on stage.

---

## 9. Pre-judging warmup checklist (last 10 minutes)

- [ ] On-device model pre-loaded (engine warm)
- [ ] **Golden Voice Profile pre-built and loaded** (`voice.md` ready to show)
- [ ] On-device **refine** path warmed (one approve/edit fired)
- [ ] OpenRouter call fired once to warm the path
- [ ] Golden-path example cached and tested on the phone
- [ ] Backup demo video on the phone, ready to play
- [ ] Deck PDF open as fallback
- [ ] Venue wifi checked; text-brief + tone-scaffold fallbacks confirmed working
- [ ] Phone still on the Office Kit bridge (R1 + the demo runs here)

---

## 10. The 60-second live demo (run order)

1. **Hook line** (the judge's pitch) — one breath.
2. **Reveal the Voice Profile** — *"Echo learned how* I *write — on this phone, offline. This is my `voice.md`."* (the twin's identity, made tangible)
3. **Capture** a product on the iQOO.
4. **Instant on-device draft** appears, *already in my voice* — *"this is the phone's own compute, offline."* (point at the engine panel)
5. **Cloud polish** upgrades it to the voice-locked final — Reel + Carousel + Thread.
6. **Edit one line → "watch the twin learn"** — the profile refines on-device. *(90s cut: drop this beat if tight.)*
7. **Swipe the carousel, scroll the thread, copy a post** — show it's real and platform-native.
8. Close on **R4**: a real Indian creator's voice, owned on their own phone, sharper every time they post.

> **Optional vision beat (15s, if pitching the platform):** "Your voice never leaves your phone — but opt in, and Echo learns from the whole community *what's working*, and suggests it to you in *your* voice. It gets smarter for everyone as it grows." That's the §11 Tier-2 story; pitch the vision even if it isn't built live.

---

## 11. Phase 2 — The Echo Network (global voice graph)

> **Status: post-core / likely post-event.** This is the platform play, not part of the on-device hero path. Build it only once CP12–CP19 are solid; it is **cut-first** and must never risk the device-push core. It needs cloud infra (a hosted vector DB + two serverless functions), which is exactly why it's sequenced last.

**What it is.** A global vector store of the community's voice/patterns. Each opted-in `voice.md` (as embeddings + derived pattern tags — see §0.2 privacy default) is upserted; at creation time Echo queries it for cross-creator **suggestions** (the *what*), which the cloud step blends in while the local `voice.md` keeps the *how*.

**Thin build (if attempted at the event):**

1. **Store** — a hosted vector DB reachable from a serverless function (e.g. pgvector on Postgres, or a managed vector service). Keys server-side only.
2. **Ingest** — `POST /api/voice/contribute`: embed the (opt-in) profile/patterns and upsert under an anonymous contributor id. Fire-and-forget after the creator builds/refines their `voice.md`.
3. **Retrieve** — inside `/api/generate`: embed the current brief + the creator's traits, query top-k community patterns, and pass them to the polish prompt **as suggestions only** (Tier-1 voice stays locked). This is the CP14 Phase-2 hook.

**Design rule (from §0.2):** Tier 2 informs idea/structure; **voice is Tier 1 only.** Separate prompt rails so the collective never homogenizes anyone's voice.

**Privacy/consent:** opt-in; embeddings + anonymized patterns by default, not raw personal text; anonymous contributor id (no account needed). Raw-text sharing or attaching identity = explicit, separate consent.

**Why (rubric/pitch):** a true **data-network-effect** — Echo gets smarter for everyone as it grows, while each voice stays its owner's. The tool-vs-platform line, and a strong R4 + investability beat even if only the *vision* is pitched live (CP20).

**Open sub-decisions (flag when you start this):** which vector DB; the opt-in default + consent copy; whether raw text is ever stored; whether per-user accounts come along for cross-device sync.

---

*The mantra: the twin's voice is the product — learn it on-device, keep it on the phone, inject it everywhere, refine it every time. Protect the hero path, make the on-device load real and visible, stay on the bridge, and have the backup video so the live demo can never sink you.*