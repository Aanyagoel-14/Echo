# Social import — upload-first (no OAuth)

**Status:** implementing · **Date:** 2026-06-18 · **Supersedes:** `social-import-implementation.md` (OAuth plan, now retired)

One-line: instead of *connecting* an Instagram/X/LinkedIn account over OAuth, the
creator **uploads the posts file they export from the platform**. We parse it **in
the browser**, clean it into a few voice samples, and feed Brand Voice — same as
before. No login, no API, no server, no secrets.

---

## 1. Why the pivot

Upload doesn't just simplify the OAuth plan — it **deletes its three hardest
problems outright** (the same ones flagged as top risks in the old doc):

| OAuth plan's biggest blocker | What upload does to it |
| --- | --- |
| **IG App Review + business verification** before any user can connect (top schedule risk) | **Gone.** We call no platform API, so there's nothing to review. Works on day one. |
| **IG personal accounts return nothing** via the API (a majority case, not an edge) | **Gone.** Instagram's *Download Your Information* export works for **personal accounts too**. The majority-failure case becomes the happy path. |
| **X pay-per-use** (~$0.10/connect, card required, uncapped multi-user bill) | **Gone.** Export is $0, no card, no spend-cap engineering, no abuse vector. |
| Server OAuth surface: `*_CLIENT_SECRET`, PKCE, CSRF state, signed-cookie relay | **Gone.** No server secrets, smaller attack surface, fewer env vars (now: none). |
| **LinkedIn** (infeasible to read your own posts via API) | **Now a first-class platform** via its data export. |

It also makes the privacy promise **literally true**: the file is parsed in the
browser and never leaves the device.

### The costs we take on (honest)

1. **More user friction + latency.** Export is request → wait → unzip → find file →
   upload, vs. two OAuth taps. **X is worst** (full-archive only, up to ~24h). IG /
   LinkedIn targeted exports are minutes. Mitigation: the **paste fallback stays**,
   and we guide users to the *targeted* (posts-only) export.
2. **Three different formats** (see §6). Bounded parsing work; we have a real IG
   fixture (`public/posts_1.json`) to test against.

---

## 2. The seam (unchanged contract)

The one rule from the original plan holds: a single async function isolates the UI
from the data source. Everything downstream is **untouched**:

```
ImportPosts.jsx → onImported({ posts, source }) → BrandVoiceSetup
  → samplesToArray → /api/generate
```

Only the *body* of the seam changes:

```diff
- importPosts(platform): Promise<{ platform, handle, posts: string[] }>   // OAuth / mock
+ importFromFile(file, platformHint): Promise<{ platform, handle, posts: string[] }>  // upload, client-side
```

`handle` becomes **optional** (`null`) — exports don't reliably carry a username;
the UI degrades to "from your Instagram export".

---

## 3. Architecture

- **100% client-side parsing.** Files are tiny (the IG fixture is 7 KB). No upload
  endpoint, no payload limits, airtight privacy, and it lets us delete server code.
  `postClean.js` already runs in the browser — reused verbatim.
- **Single-file upload, not the ZIP.** Matches the user's mental model ("unzip, grab
  that one file"). No in-browser unzip dependency.
- **Auto-detect platform from file content**, with the picker as a hint — a
  mislabeled pick still works.
- **No new dependencies.** CSV is parsed by a ~30-line hand-rolled reader.

---

## 4. File-by-file change plan

**Delete (OAuth teardown):**
- `api/connect/x/{start,callback}.js`, `api/connect/instagram/{start,callback}.js`, `api/connect/result.js`
- `api/_lib/oauth.js`, `api/_lib/providers.js`, `api/_lib/connect.js`, `api/_lib/postClean.js`
- `public/data-deletion.html` (existed only for IG App Review; nothing is stored now)

**Add:**
- `src/lib/importAdapters.js` — pure per-platform parsers + `detectAndExtract()` (§5/§6).

**Rewrite (the only two behavior changes):**
- `src/lib/socialImport.js` → `importFromFile()`; drop mock/LIVE/`collectImportResult`/`isLiveImport`. `IMPORT_PLATFORMS` gains `linkedin`.
- `src/components/ImportPosts.jsx` → platform picker + per-platform instructions + file input. Drop the boot `useEffect`, the IG "Professional account" gate (irrelevant now), and OAuth-specific error codes.

**Edit:**
- `vite.config.js` → remove the 5 connect imports + `devConnect()` + its plugin entry (keep `devApi()` for `/api/generate`).
- `.env.example` → no env vars are needed anymore (generate uses none; import is client-side). Reduce to a short note.
- `public/privacy.html` → drop the dead link to the deleted data-deletion page; reflect "parsed in your browser, nothing stored".

**Untouched (seam holds):** `src/screens/BrandVoiceSetup.jsx`, `src/lib/brandVoice.js`, `src/lib/postClean.js`, `src/lib/api.js`, `api/generate.js`.

---

## 5. Adapter design (`src/lib/importAdapters.js`)

Pure functions, no DOM — node-testable. Each takes the file **text** and returns a
raw `string[]` of post text; `postClean.js` turns that into ≤4 samples.

```
parseInstagram(text) → string[]   // JSON; caption at media[].title; fixes mojibake
parseX(text)         → string[]   // .js; strip `window.YTD…=` wrapper; tweet.full_text
parseLinkedIn(text)  → string[]   // CSV; ShareCommentary column
detectAndExtract(filename, text, hint) → { platform, raw }   // sniff content, hint breaks ties
```

**Detection** prefers unambiguous content signatures, then file extension, then the
picker hint: `window.YTD`/`full_text` → X; `ShareCommentary` → LinkedIn;
`creation_timestamp`/`"media":[` → Instagram.

**Mojibake (Instagram).** IG's export double-encodes UTF-8: each byte of a
multi-byte char is stored as its own Latin-1 code point, so `I’ve` arrives as
`Iâ€™ve` (`Iâve`, where `â€™` = bytes E2 80 99 = U+2019). The fix:
detect the signature, re-pack the code points as bytes, and `TextDecoder('utf-8')`
them back. Guarded so already-clean text (and genuine emoji) pass through untouched.

---

## 6. Per-platform export guides (also the in-app help copy)

Throughline: **export only what we need — your past posts' text.** The selective
options below keep the download small and private.

### Instagram — JSON · works on personal accounts too
> 1. Instagram → **Settings → Accounts Centre → Your information and permissions → Download your information**.
> 2. **Download or transfer information** → pick your account.
> 3. Choose **"Some of your information"** → under **Content**, tick **Posts only**.
> 4. **Format → JSON** (not HTML), **Media quality → Low**, **Date range → All time**.
> 5. Submit; Instagram emails a link (a posts-only export is usually ready in minutes).
> 6. Unzip → open `your_instagram_activity/media/posts_1.json` (older exports: `content/posts_1.json`).
> 7. Upload that one file. Captions live in each post's `title`.

### X (Twitter) — `.js` archive · slowest, request early
> X only offers a **full archive** (no posts-only subset); it can take **up to 24h**.
> 1. x.com → **Settings → Your account → Download an archive of your data** (re-enter password + code).
> 2. **Request archive** → wait for the "ready" email.
> 3. Unzip → find `data/tweets.js`. Upload it (it's a `.js`; we strip the wrapper; text is in `full_text`).
> 4. In a hurry? **Paste 3–4 tweets** instead — same result, no wait.

### LinkedIn — `.csv` · fastest (~10 min)
> 1. LinkedIn → **Me → Settings & Privacy → Data Privacy → Get a copy of your data**.
> 2. Choose **"Want something in particular?"** → tick **Posts / Shares only**.
> 3. **Request archive** → targeted file is usually ready in **~10 minutes** (emailed).
> 4. Unzip → open `Shares.csv`. Upload it (post text is the `ShareCommentary` column).

> File type differs per platform (IG = `.json`, X = `.js`, LinkedIn = `.csv`); the
> uploader accepts all three and auto-detects. Menu labels drift between app versions.

---

## 7. Error taxonomy (UI copy)

Dropped OAuth codes (`needs-professional`, `billing-required`, `rate-limited`,
`cancelled`, `state`/`token`/`connect`). New set, all falling back to a paste hint:

- `unsupported-file` — not a recognised export file.
- `parse-error` — couldn't read the file (corrupt / modified / wrong file).
- `no-posts` — parsed fine, but nothing usable to learn from.
- `too-large` — picked the full media archive, not the posts file.
- `read-error` — the browser couldn't open the file.

---

## 8. Testing

- Adapter sanity against the real fixture `public/posts_1.json`: asserts captions
  extract from `media[].title` and the mojibake `â€™` → `’` is fixed. (Run as a
  node script; no test runner is configured in `package.json` yet.)
- Manual: each platform's real export end-to-end → samples land in Brand Voice.

## 9. Open questions

1. **X 24h latency** — keep X in the picker with "request early / paste meanwhile",
   or soft-launch IG + LinkedIn + paste and add X after confirming the flow?
2. Keep `privacy.html` (simplified) — recommended, the claim is now stronger.
