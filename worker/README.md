# Echo — Instagram co-occurrence worker

The rate-limited Feature 1 source that **can't live in a serverless function**.

Instagram rate-limits hashtag scraping hard and wants a logged-in session (and
ideally rotating proxies), so this runs as its **own daily scheduled job**, slowly,
and writes a JSON file that the app's harvest reads as a best-effort live source.
Google Trends and TikTok Creative Center run inline in the serverless harvest
(`src/lib/trendSources.js`); Instagram is the one source that needs this worker.

## How it connects

```
worker/instagram_harvest.py  (daily, slow, authed)
        │  writes
        ▼
data/instagram-cooccurrence.json   ← committed by the GitHub Action
        │  read best-effort (freshness-checked) by
        ▼
src/lib/trendSources.js  fetchInstagramCooccurrence() → harvestBatch()
        │  folds co-occurring tags into each niche's pool
        ▼
/api/trends-harvest (Vercel cron) → trend store → /api/audit
```

If the file is missing or stale, the harvest just skips it and keeps the mock +
Google + TikTok signals — exactly the "enrich when we can, never block" contract
the other sources use.

## Setup & run (local)

```bash
pip install -r worker/requirements.txt
cp worker/.env.example worker/.env   # fill in IG creds / proxy
npm run export:niches                # (re)generate worker/niches.json from the taxonomy
set -a; . worker/.env; set +a        # load env
python worker/instagram_harvest.py   # writes worker/output/instagram-cooccurrence.json
```

Point it at the path the app reads by setting `ECHO_IG_OUTPUT=data/instagram-cooccurrence.json`.

## Scheduling

`.github/workflows/instagram-harvest.yml` runs it daily at 05:00 UTC (an hour
before the app's 06:00 trends-harvest cron), then commits the refreshed
`data/instagram-cooccurrence.json` back to the repo. Set repo secrets:
`IG_USERNAME`, `IG_PASSWORD` (or wire a session), and optionally `IG_HTTPS_PROXY`.

Any host with cron works too — it just needs Python, the deps, and to write the
output where the app can read it.

## Config

See `worker/.env.example`. Seeds come from `worker/niches.json`, regenerated from
the canonical taxonomy in `src/lib/trends.js` via `npm run export:niches` — so the
worker and the app never drift on which niches/tags exist.

## Production durability

Committing the JSON back to the repo is the simple MVP path (mirrors the trend
store's file approach). For a durable, multi-instance setup, have the worker
write to a shared store (Vercel Blob / Edge Config / a DB) and have
`fetchInstagramCooccurrence()` read from there — its `{ harvestedAt, niches }`
contract stays the same.

## Compliance note

Scraping Instagram is subject to its Terms of Service and rate limits. Use a
dedicated account, keep request volume low (the defaults are deliberately
modest), and respect applicable laws/robots. This worker is best-effort by
design — when Instagram blocks it, the app degrades gracefully to its other
sources.
