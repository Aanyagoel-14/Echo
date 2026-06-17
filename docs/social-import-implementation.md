# Social Import — Implementation Plan (Instagram + X)

> ⚠️ **Superseded — historical (18 June 2026).** Echo no longer connects to social
> accounts via OAuth. Brand-voice import is now **upload-first**: the creator uploads
> a posts file they exported themselves and it's parsed entirely in the browser (no
> login, no server, no secrets). This document describes the **abandoned OAuth
> approach** and is kept only for history — see
> **[`social-import-upload.md`](./social-import-upload.md)** for the shipped design.

> **Scope of this doc.** How we turn the *mock* "Import your posts" feature into a
> **real, public one** that lets **any creator who installs Echo** connect **their
> own** Instagram or X account and pull their recent posts to learn their voice. It
> is the build plan for **Phase 2 → 5**.
>
> - **Phase 0 (dashboard setup)** — covered in [`social-import-setup.md`](./social-import-setup.md). Not repeated here.
> - **Phase 1 (mock-first UI)** — ✅ **already shipped** (commit `8a9883e`). The
>   connect buttons, cleaning, and Brand-Voice wiring are done and run offline.
> - **Phases 2–5 (this doc)** — real OAuth, real fetch/extraction, hardening, launch.
>
> **This is a multi-user feature, not a single-account demo.** Every user connects
> *their own* account (never ours), so two things that used to be "later / optional"
> are now **required and in-scope**: (a) the apps must pass **platform review** so
> non-tester users can authorize them (Phase 5 is no longer optional — see §8), and
> (b) the **pre-connect UX** must set expectations *before* the redirect — a one-line
> explainer and an Instagram **Professional-account** requirement (see §4.0). The
> DB-free, per-request token design (§2) already scales to many users unchanged:
> each person's token lives only inside their own connect request and is discarded.
>
> **Companion read:** §7 below ("Account & cost reality") is the *verified-as-of-2026-06* truth
> on what each platform requires and charges. It supersedes the pricing line in
> `social-import-setup.md` (which is slightly stale — see §7).

---

## 1. The one rule: don't break the seam

Phase 1 deliberately put a single async function between the UI and the data so
the real integration drops in **without touching any React**. That seam is the
contract for this entire plan:

```js
// src/lib/socialImport.js  — the ONLY thing Phase 2/3 rewrites.
importPosts(platform) -> Promise<{ platform, handle, posts: string[] }>
```

Everything downstream already consumes this shape and **must stay unchanged**:

- `src/components/ImportPosts.jsx` — calls `importPosts(platform)`, hands
  `{ posts, source }` up via `onImported`, renders ok/err status.
- `src/screens/BrandVoiceSetup.jsx` — `handleImported()` appends `posts` to the
  samples textarea and sets the `source`.
- `src/lib/postClean.js` — `cleanPosts()` turns raw captions/tweets into ≤4 voice
  samples. **Reused verbatim, server-side, in Phase 3.**
- `src/lib/brandVoice.js` — persistence + `samplesToArray()` at the `/api/generate` seam.

> **Definition of done for "no UI churn":** the only client file that changes is
> `socialImport.js`. If a `.jsx` file needs editing beyond copy/error-string
> tweaks, stop and reconsider — the seam is leaking.
>
> **Allowed `.jsx` copy for the public flow (§4.0):** `ImportPosts.jsx` already owns
> a short explainer (`"Connect an account … we don't store your login."`). Adding
> the one-line connection explainer and the Instagram Professional-account note is a
> **copy change to that same block** — no new props, no new data flow, so it stays
> inside the rule. The connect buttons still call `importPosts(platform)` and the
> result still arrives as `{ platform, handle, posts }`.

---

## 2. Why this needs a server (and how we stay DB-free)

This is a **Vite SPA on Vercel** with serverless functions under `api/` (same
pattern as the existing `api/generate.js`). Two hard constraints shape the design:

1. **Secrets are server-only.** `X_CLIENT_SECRET` / `INSTAGRAM_APP_SECRET` and the
   OAuth token exchange must never touch client code (§2 of the master spec, and
   the security rules in `social-import-setup.md`). So OAuth lives in `api/*`.
2. **No database.** The app persists only brand voice to `localStorage`. We will
   **not** add a DB just to hold an access token. The UI promise is literally
   *"We read them once — we don't store your login."* So the design is:
   **connect → fetch → clean → hand back cleaned posts → discard the token in the
   same request.** Nothing about the account is persisted server-side.

### Token handoff without a DB

The challenge: OAuth is a full-page redirect dance, but the cleaned posts need to
get back into the SPA's React state. Chosen approach — **short-lived signed cookie
relay** (robust on mobile; no popups, no storage backend):

```
[SPA] click "Connect Instagram"
   └─> full-page redirect to  /api/connect/instagram/start
        • mint PKCE verifier + random state
        • set signed, httpOnly, 10-min cookie  (verifier+state, signed w/ OAUTH_STATE_SECRET)
        • 302 -> platform authorize URL
[platform] user approves
   └─> 302 -> /api/connect/instagram/callback?code=…&state=…
        • verify state cookie (CSRF), exchange code -> access_token (PKCE)
        • fetch recent media/tweets, map -> raw[], cleanPosts(raw) -> posts[]
        • DROP the token (never stored, never returned to client)
        • set signed, httpOnly, 60-sec cookie  echo_import = { platform, handle, posts }
        • 302 -> /?import=instagram        (back to the SPA)
[SPA] boot detects ?import= → GET /api/connect/result
        • reads + CLEARS the echo_import cookie, returns { platform, handle, posts }
        • importPosts() resolves with it → onImported() → samples textarea fills
```

Cleaned posts are tiny (≤4 samples × ≤600 chars ≈ <3 KB), so they fit in a cookie
under the ~4 KB limit. If a payload ever exceeds that, fall back to a 60-second
Vercel KV / Upstash entry keyed by a one-time id — but for the demo the cookie is
enough and keeps us DB-free.

> **Alternative considered:** popup + `postMessage`. Rejected as the default —
> popups are unreliable in mobile PWAs (the exact target device). Keep it as a
> desktop-only fast path only if time allows.

---

## 3. New surface area (files)

```
api/
  connect/
    x/
      start.js            # mint PKCE+state, redirect to X authorize
      callback.js         # exchange code, fetch tweets, clean, relay cookie
    instagram/
      start.js            # mint PKCE+state, redirect to IG authorize
      callback.js         # exchange code, fetch media, clean, relay cookie
    result.js             # read+clear relay cookie -> { platform, handle, posts }
  _lib/
    oauth.js              # PKCE (S256), state sign/verify, cookie helpers (shared)
    providers.js          # per-platform: authorize URL, token URL, fetch+map fns
src/lib/
  postCleanShared.js      # (optional) move cleanPosts here if api/ can't import src/
```

Client change is limited to **`src/lib/socialImport.js`**: replace the mock body
of `importPosts()` with "redirect to `/api/connect/<platform>/start`", and add a
small `collectImportResult()` the SPA calls on boot when `?import=` is present.

> **Note on sharing `cleanPosts`:** Vercel functions are bundled separately from
> the Vite client. If `api/*` can't import from `src/lib/postClean.js` cleanly,
> copy the pure functions into `api/_lib/` (they have no React deps) or hoist to a
> shared module both can import. Keep ONE source of truth — don't fork the regex.

---

## 4. Phase 2 — Real OAuth (connect)

**Goal:** the Connect button completes a real authorization and lands back in the
app with a valid, server-held token (not yet fetching).

### 4.0 Pre-connect UX (what the user reads *before* the redirect)

Because every user brings their own account, set expectations **before** they leave
the app for the consent screen. This is copy added to the existing explainer block
in `ImportPosts.jsx` (see §1 — no new data flow).

**The connection line (shown above the two Connect buttons):**

> *"Connect your account and Echo learns your voice from your own recent posts. We
> read them once to set up your brand voice — we never post, and we don't store your
> login."*

This keeps the existing "read once / don't store" promise (which the privacy policy
in §8 must now actually back) and adds the **"we never post"** reassurance, since
asking many strangers to authorize is a higher trust bar than a single self-connect.

**The Instagram Professional-account note (the gate):**

Instagram's API only exposes media/captions for **Professional (Business or
Creator)** accounts — a *personal* account returns nothing (see §7). For a public
audience most users are on personal accounts, so the requirement must be visible
up front, not discovered as an error after the redirect. Show a small helper under
the Instagram button:

> *"Instagram import needs a free **Professional** account (Business or Creator).
> Switch in Instagram → Settings → **Account type and tools** — it's instant and
> reversible. On a personal account? Just paste a few posts below."*

- This is **guidance, not a hard block** — we cannot reliably detect account type
  *before* OAuth, so we **let them try**, and the `needs-professional` error path
  (§6) catches the personal-account case after the token comes back empty/forbidden
  and routes them to the same "paste below" fallback with the switch instructions.
- Keep the note compact (a `text-xs text-muted` line, matching the existing
  explainer styling); it is informational, so it must not crowd the button grid.
- **X needs no such gate** — any X account can authorize; its constraint is billing
  on *our* side (§7), invisible to the user unless it fails (`billing-required`).

### 4.1 Shared OAuth helper (`api/_lib/oauth.js`)
- `createPkce()` → `{ verifier, challenge }` (S256, base64url).
- `signState(payload)` / `verifyState(cookie)` → HMAC with `OAUTH_STATE_SECRET`
  (`openssl rand -hex 32`; already in the env contract). Reject on mismatch/expiry.
- `setCookie/readCookie/clearCookie` → httpOnly, `Secure`, `SameSite=Lax` (Lax so
  the post-redirect GET still carries it), `Path=/`, explicit `Max-Age`.

### 4.2 X (`api/connect/x/*`) — OAuth 2.0 Authorization Code + PKCE (confidential)
- **start:** redirect to `https://x.com/i/oauth2/authorize` with
  `response_type=code`, `client_id=X_CLIENT_ID`, the registered `redirect_uri`,
  `scope=tweet.read users.read`, `state`, `code_challenge`, `code_challenge_method=S256`.
- **callback:** `POST https://api.twitter.com/2/oauth2/token` with HTTP Basic auth
  (`X_CLIENT_ID:X_CLIENT_SECRET`), `grant_type=authorization_code`, `code`,
  `redirect_uri`, `code_verifier`. → `{ access_token }`.

### 4.3 Instagram (`api/connect/instagram/*`) — Instagram API with Instagram Login
- **start:** redirect to `https://www.instagram.com/oauth/authorize` with
  `client_id=INSTAGRAM_APP_ID`, `redirect_uri`, `response_type=code`,
  `scope=instagram_business_basic`. (The newer login — **no Facebook Page required**.)
- **callback:** `POST https://api.instagram.com/oauth/access_token` (form-encoded:
  `client_id`, `client_secret`, `grant_type=authorization_code`, `redirect_uri`,
  `code`) → `{ access_token, user_id }`. A one-shot read needs only this
  short-lived token; skip the 60-day long-lived exchange unless we add caching later.

> **Redirect URIs must match the dashboard exactly** (see `social-import-setup.md`
> §"Redirect URIs"). IG rejects `http://localhost` — test IG against the Vercel
> preview HTTPS URL or an ngrok tunnel; X accepts localhost for dev.

> ⚠️ Endpoint hosts, the IG Graph version (`v22.0` below), and scope names drift.
> Re-confirm against the live platform docs at build time; treat the values here
> as the shape, not gospel.

---

## 5. Phase 3 — Fetch + extraction

**Goal:** the callback returns real cleaned posts; `importPosts()` resolves with
them and the samples textarea fills.

### 5.1 X — fetch the user's own posts
1. `GET https://api.twitter.com/2/users/me` → `{ id, username }` (→ `handle = @username`).
2. `GET https://api.twitter.com/2/users/:id/tweets`
   `?max_results=100&exclude=retweets,replies&tweet.fields=text,lang`.
3. Map `data[].text` → `raw[]`; run `cleanPosts(raw)` → ≤4 samples.

### 5.2 Instagram — fetch the user's own media captions
1. `GET https://graph.instagram.com/v22.0/me?fields=username` → `handle`.
2. `GET https://graph.instagram.com/v22.0/me/media`
   `?fields=caption,media_type,timestamp,permalink&access_token=…`.
3. Map `data[].caption` (skip empty) → `raw[]`; `cleanPosts(raw)` → ≤4 samples.

### 5.3 Extraction = the existing cleaner, server-side
`cleanPosts()` already strips URLs, drops retweets/replies/link-only/too-short,
dedupes, preserves emoji+hashtags, and caps at 4 (`MAX_SAMPLES`) — exactly the
extraction we want. **Do not reinvent it.** The mock's junk fixtures were chosen
to exercise these same paths, so behavior is already proven.

### 5.4 Result relay
Callback sets the `echo_import` cookie `{ platform, handle, posts }` and redirects
to `/?import=<platform>`. `result.js` reads+clears it. `collectImportResult()` in
the SPA turns that into the same `{ platform, handle, posts }` the mock returned.

---

## 6. Phase 4 — Hardening (errors, limits, security)

`ImportPosts.jsx` already renders a friendly status and falls back to "paste a few
posts below." Extend `importPosts()`'s error vocabulary so each failure maps to a
clear message **without UI changes** (the component just needs a couple more
`e.code` branches):

| `e.code` | Cause | Message → user |
|---|---|---|
| `no-posts` | account has nothing usable (already handled) | "Couldn't find posts to learn from — paste a few below." |
| `needs-professional` | **IG personal account** — captions/media not exposed (the common case for a public audience) | "Instagram import needs a free Professional account — switch in Settings → Account type and tools, or just paste a few posts below." |
| `billing-required` | **X** returns 403, no pay-per-use billing on the dev app | "X import needs billing enabled on the developer account — paste a few posts for now." |
| `rate-limited` | 429 from either platform | "Hit a rate limit — try again in a minute, or paste a few posts." |
| `cancelled` | user denied / closed the consent screen | "No problem — paste a few posts below instead." |

**Other hardening:**
- **CSRF:** every callback verifies the signed `state` cookie before touching the
  token endpoint; reject mismatches.
- **Token hygiene:** never log tokens; never put them in a cookie or the client;
  let them fall out of scope at the end of the request.
- **Timeouts/retries:** wrap fetches with a timeout; one retry on a transient 5xx.
- **Scope creep guard:** request read-only scopes only (`tweet.read users.read`,
  `instagram_business_basic`) — matches App Review expectations and the privacy copy.
- **Rate/cost ceiling (X):** cap to one `users/:id/tweets` page (≤100) per connect;
  that's ≤100 owned reads (see §7 cost math).

---

## 7. Account & cost reality (verified 2026-06 — read before promising "free")

This is the part most likely to surprise users. **Verified against current platform
reporting in June 2026** (X and Meta both changed terms after the setup doc was
written). This **supersedes** the `social-import-setup.md` billing line.

### Instagram — free, but a *personal* account won't work
- **Cost: $0.** Meta's Graph API has no usage fee for this.
- **Upfront: nothing.** No card, no deposit.
- **Catch:** the account **must be Professional (Business or Creator)**. Meta
  permanently shut down the old *Basic Display API* (the only one personal accounts
  could use) in **Dec 2024**. A personal account has **zero API access** to its own
  media/captions today. The fix is a **free, instant, reversible** 1-tap switch in
  the IG app (Settings → Account type and tools).
- **App Review:** **not required** to import **your own** account in development
  mode (add yourself/teammates as Instagram testers). Full App Review + business
  verification + hosted privacy policy is only for **public launch** (Phase 5).

### X (Twitter) — technically free of upfront fees, but **not free per read**
- **No usable free tier** for new developers — it was discontinued. New apps are on
  **pay-per-use** by default (changed **Feb 6, 2026**).
- **No monthly minimum and no upfront lump sum** ($0 if you make no calls) — **but a
  payment method is required**, and there is **no free read allowance** to prototype.
- **Reading your own posts ("owned reads") ≈ $0.001 per read** (cut from $0.005 on
  **Apr 20, 2026**; general post reads are still $0.005, user/DM reads $0.010).
- **Real cost for us:** one import pulls ≤100 of your own tweets ≈ **~$0.10 per
  connect** (often far less — most accounts yield fewer). Cheap, but **not zero**,
  and you must add a card on the X developer account first.
- The legacy **$200/mo Basic** and **$5,000/mo Pro** tiers are **closed to new
  signups** — not an option.

> ⚠️ X has changed this pricing repeatedly; the per-read numbers are from current
> third-party reporting. **Confirm the live figure in the X developer portal** when
> billing is actually enabled. Sources are listed at the bottom of this doc.

### What this means for the product (now that *anyone* can connect)
- **Instagram:** still **free to us at any user count** (Meta charges no usage fee),
  but the Professional-account requirement now bites a **larger share of users** —
  most consumer IG accounts are personal. So the §4.0 gate copy and the
  `needs-professional` fallback aren't an edge case; they're a **main path** that a
  big fraction of users will hit. Lead with clear up-front messaging + the always-on
  paste fallback so a personal-account user still completes onboarding at $0.
- **X — the cost now scales with users.** Every connect bills *our* X developer
  account ~$0.10 (≤100 owned reads). One demo connect is nothing; **N users × every
  re-connect is a real, uncapped bill.** Required guardrails before opening X to the
  public:
  - a **hard per-connect read cap** (one page, ≤100 — already in §6) so no single
    connect blows up;
  - a **global budget alert / spend cap** on the X account;
  - ideally **one import per user per session** (don't let a user re-trigger paid
    reads repeatedly) and consider a short server-side cooldown.
  - If that operational risk isn't worth it for the demo, **flag X off and ship
    Instagram + paste** — both cover the voice-learning goal at $0 and zero abuse risk.
- The **paste fallback is always there**, so every user — personal IG, no X, or a
  declined consent — still gets full value.

---

## 8. Phase 5 — Public launch (REQUIRED — this is what "any user can connect" means)

Opening import to people who aren't us/our testers is the whole point of this
revision, so this phase is **in-scope and on the critical path**, not optional.
Until an app is approved/live, **only accounts you've added as testers can
authorize it** — a stranger hits an "app not available" error. To let any user
connect:

- **Instagram (the gating item — start early):** Meta **App Review** for
  `instagram_business_basic`, plus **business verification** and a **hosted privacy
  policy + data-deletion** URL, then flip the app to **Live** mode. ⚠️ **Lead time:**
  App Review + business verification can take **days to weeks** and often bounces
  back with change requests. **Submit this first**, before polishing anything else,
  and record a screencast of the exact read-only flow for the reviewer.
- **X:** no per-app "review" to authorize other users, but it **stays pay-per-use and
  the bill is ours** — enforce the §7 guardrails (per-connect cap, spend alert,
  one-import-per-session) **before** the public can trigger paid reads.
- **Privacy:** the UI promises "we read once, we never post, we don't store your
  login." With real third-party users that promise is now a **legal commitment** —
  publish it as an actual privacy-policy page (required for IG review anyway) and
  make sure the implementation matches it (read-only scopes, token discarded
  per-request, nothing logged — §6 token hygiene).

> **Fallback if review isn't approved in time for the deadline:** ship with **X (if
> billing-guarded) + paste** enabled and Instagram in "coming soon" state, or run the
> demo with the app in dev mode against a tester account while review is pending. The
> paste path means the product is fully usable either way.

---

## 9. Sequenced checklist (Definition of Done)

> **Do first (long lead time):** kick off **Instagram App Review + business
> verification + privacy-policy page** (§8) on day one — it's the slowest item and
> blocks "any user can connect." Build Phases 2–4 in parallel while it's pending.

**Phase 2 — OAuth connect**
- [ ] `api/_lib/oauth.js`: PKCE (S256), HMAC state sign/verify, cookie helpers.
- [ ] `api/connect/{x,instagram}/start.js` redirect to the right authorize URL with state+PKCE.
- [ ] `api/connect/{x,instagram}/callback.js` verify state, exchange code → token.
- [ ] Redirect URIs registered in both dashboards match the routes exactly (dev + prod).
- [ ] `src/lib/socialImport.js`: `importPosts()` redirects to `/start` (mock body removed).
- [ ] **Pre-connect UX copy (§4.0):** connection line + "never post" reassurance; IG
      Professional-account note under the Instagram button (copy-only in `ImportPosts.jsx`).

**Phase 3 — Fetch + extraction**
- [ ] X: `users/me` + `users/:id/tweets` (exclude RT/replies) → `cleanPosts()`.
- [ ] IG: `me/media?fields=caption,…` → captions → `cleanPosts()`.
- [ ] `cleanPosts()` shared (not forked) between client and `api/`.
- [ ] `api/connect/result.js` reads+clears relay cookie → `{ platform, handle, posts }`.
- [ ] `collectImportResult()` runs on SPA boot when `?import=` is present; resolves `importPosts`.
- [ ] End-to-end: real IG (Professional) + real X connect each fill the samples textarea.

**Phase 4 — Hardening**
- [ ] Error taxonomy wired (`needs-professional`, `billing-required`, `rate-limited`, `cancelled`).
- [ ] State/CSRF verified on every callback; tokens never logged/stored/returned.
- [ ] Timeout + single retry on transient 5xx; X read capped to one page (≤100).
- [ ] Cancel/deny path returns cleanly to paste fallback.

**Phase 5 — Public launch (REQUIRED for "any user can connect")**
- [ ] IG App Review approved + business verification done + app flipped to **Live**.
- [ ] Privacy-policy + data-deletion page published; UI claims match implementation.
- [ ] X guardrails live: per-connect read cap (≤100), spend alert/cap, one-import-per-session.
- [ ] Verified with a **non-tester** account (a real outside user) end-to-end on both platforms.

---

## 10. Risks & open questions

- **IG App Review lead time (top schedule risk).** Until the app is approved + Live,
  **no outside user can connect** — only testers. Review + business verification take
  days-to-weeks and can bounce. Submit on day one (§9) and keep the §8 fallback ready
  (paste + tester-account demo) in case it isn't approved by the deadline.
- **IG personal-account friction — now a majority case, not an edge.** A public
  audience is mostly personal accounts, all of which return nothing. The §4.0 up-front
  note + early `needs-professional` detection (token works but `me/media` empty/forbidden
  → friendly switch-or-paste, not a generic error) is essential, not a nicety.
- **X cost is an uncapped multi-user bill, not just optics.** Every public connect
  bills us ~$0.10; without the §7 guardrails (per-connect cap, spend alert,
  one-import-per-session) a burst of users — or one abuser re-connecting — runs up a
  real bill. Decide before launch: guard-and-enable, or flag X off and lead with IG+paste.
- **`cleanPosts` sharing across the Vite/Vercel bundle boundary.** Verify the import
  works from `api/`; if not, hoist the pure module. One source of truth only.
- **Cookie-relay size.** Fine for ≤4 cleaned samples; if we ever raise `MAX_SAMPLES`
  or carry richer payloads, switch the relay to a 60-sec KV entry keyed by one-time id.
- **Endpoint/scope drift.** IG Graph version and X hosts change; re-verify at build.
- **Do we need long-lived IG tokens?** Not for one-shot import. Only if we later
  cache or re-import on a schedule.

---

### Sources for §7 (verified 2026-06)
- X API pricing 2026 (pay-per-use, owned reads $0.001): https://twitterapi.io/blog/x-api-cost-breakdown-2026 · https://www.xpoz.ai/blog/guides/understanding-twitter-api-pricing-tiers-and-alternatives/ · https://www.getxapi.com/twitter-api-pricing
- Instagram API 2026 (Basic Display shut down; Professional account required; Graph API free; own-account access needs no App Review): https://gist.github.com/jameschapman2c/65eff9f54a2d350b17a6ce5127b9fe42 · https://www.getphyllo.com/post/instagram-api-get-post-use-display-api-to-access-user-info · https://elfsight.com/blog/instagram-graph-api-complete-developer-guide-for-2026/
