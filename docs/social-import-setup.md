# Phase 0 — Social import setup (Instagram + X)

> ⚠️ **Superseded — historical (18 June 2026).** Echo no longer connects to social
> accounts via OAuth. Brand-voice import is now **upload-first**: the creator uploads
> a posts file they exported themselves and it's parsed entirely in the browser (no
> login, no server, no secrets). This document describes the **abandoned OAuth
> approach** and is kept only for history — see
> **[`social-import-upload.md`](./social-import-upload.md)** for the shipped design.

One-time setup you do in the platform dashboards before the **real** OAuth phases
(Phase 2+). Phase 1 (the mock-first import UI) needs **none** of this, so I can
build that in parallel.

> **Security rules (non-negotiable):**
> - Put secrets in **`.env.local`** (dev — gitignored) and in **Vercel → Settings → Environment Variables** (prod). Both are server-side only.
> - **Never** prefix a secret with `VITE_` (that would bundle it into the client). Only the serverless `api/*` functions read these via `process.env`.
> - **Do not paste secrets into chat.** Put them straight into the env files. I only need the non-secret **Client/App IDs**.

## Env vars to create (`.env.local` for dev, Vercel env for prod)

```
X_CLIENT_ID=...            # safe to share
X_CLIENT_SECRET=...        # secret — env only
INSTAGRAM_APP_ID=...       # safe to share
INSTAGRAM_APP_SECRET=...   # secret — env only
OAUTH_STATE_SECRET=...     # random; signs the PKCE/state cookie. Generate with:  openssl rand -hex 32
```

## Redirect URIs to register

The OAuth callback hits a serverless route (`/api/connect/<platform>/callback`).
Register both dev and prod:

| Platform | Dev | Prod |
|---|---|---|
| **X** (http localhost OK) | `http://localhost:5173/api/connect/x/callback` | `https://<your-vercel-domain>/api/connect/x/callback` |
| **Instagram** (HTTPS required) | use the Vercel preview URL, or an HTTPS tunnel (e.g. ngrok): `https://<tunnel>/api/connect/instagram/callback` | `https://<your-vercel-domain>/api/connect/instagram/callback` |

> Instagram won't accept a plain `http://localhost` redirect. Easiest local path: test IG against the deployed/preview HTTPS URL, or run an ngrok tunnel.

---

## A) X (Twitter) — developer.x.com

- [ ] Sign in → **create a Project**, then an **App** inside it.
- [ ] App → **User authentication settings → Set up**:
  - [ ] **App permissions:** Read
  - [ ] **Type of App:** *Web App, Automated App or Bot* (confidential client — we hold a secret server-side)
  - [ ] **Callback URI / Redirect URL:** the two X URLs above
  - [ ] **Website URL:** your site/Vercel URL
- [ ] Save → copy **OAuth 2.0 Client ID** and **Client Secret** (secret is shown once) → into env vars.
- [ ] Scopes the app will request at auth time: `tweet.read`, `users.read`.
- [ ] **Billing:** new developers are on **pay-per-use** (~$0.005/read). A ~80-post sample ≈ $0.40/connect. Add a payment method if the portal requires it; your own account works for testing immediately.

## B) Instagram — developers.facebook.com (Meta)

- [ ] **Create app** → Business type → add a use case that includes **Instagram**.
- [ ] Add product: **Instagram → "API setup with Instagram login"** (the newer flow — **no Facebook Page required**).
- [ ] Copy the **Instagram App ID** and **Instagram App Secret** → into env vars.
- [ ] **Business login settings / OAuth:** add the Instagram redirect URI(s) above; request scope **`instagram_business_basic`** (profile + media + captions).
- [ ] **Account type:** the account you import from must be **Professional (Business or Creator)** — captions aren't exposed for personal accounts. (Free 1-tap switch in the IG app: Settings → Account type and tools.)
- [ ] **Add testers for the demo:** App roles → add the team's IG usernames as **Instagram testers**; each accepts in the IG app (Settings → Apps and websites → Tester invites). In **dev mode**, testers use the live scopes **without full App Review**.
- [ ] **Public launch only (later, Phase 5):** App Review + business verification + a hosted privacy policy. Not needed for the demo.

---

## When you're done, hand back to me (safe to share)

- [ ] `X_CLIENT_ID` and `INSTAGRAM_APP_ID`
- [ ] The exact **redirect URIs** you registered (so my code matches them)
- [ ] Confirmation the **secrets are in `.env.local`** (dev) / Vercel env (prod) — don't send the secrets themselves
- [ ] Your Vercel domain (for the prod redirect URIs)

Then I wire Phase 2 (real OAuth) + Phase 3 (fetch + extraction). I can build **Phase 1 (mock)** any time — it doesn't depend on this.
