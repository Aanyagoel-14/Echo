# Feature 1 — Trend Harvesting Engine

A self-updating store of current content trends. The audit (Feature 3) reads
**our own cached batch**, never a live source, so query time pays zero
per-request API fees. A daily job refreshes the cache; everything else reads it.

> The product spec names Python tools (pytrends, Playwright, Instaloader). Those
> are *example* sources for the same goal. Echo is a JS/Vercel app, so the engine
> is implemented in JS and is **mock-first**, exactly like `api/generate.js`: it
> always returns a complete, well-shaped batch with zero dependencies, and folds
> in real sources on a best-effort basis. Every source returns the same
> `TrendBatch` shape, so the store, cron, and query path never change as sources
> are added.

## The contract — `TrendBatch`

```jsonc
{
  "version": 1,
  "harvestedAt": "2026-06-18T08:32:31.075Z", // ISO timestamp
  "dateKey": "2026-06-18",                    // the day represented
  "source": "mock | live | mixed",            // provenance
  "niches": {
    "skincare": {
      "hashtags": [{ "tag": "#cleangirl", "momentum": 97 }],
      "topics":   ["Skin-cycling schedules"],
      "sounds":   ["Spoken-word trend audio (storytime)"]
    }
    // … one entry per niche in NICHES
  }
}
```

## Pieces

| File | Role |
|---|---|
| `src/lib/trends.js` | Pure core (browser-safe, node-testable). The canonical `NICHES` taxonomy + `normalizeNiche`, the deterministic date-seeded `generateMockBatch`, `isStale` (24h), and `selectNiche` (the per-niche query). **`NICHES` is the single source of truth** the future Page 2 Genre Selector reads from. |
| `src/lib/trendSources.js` | Harvest orchestration. Mock baseline + **best-effort live** Google Trends Daily Trends RSS (free, keyless, behind a 2.5s timeout). `fetch` is injectable for offline tests. TikTok Creative Center / Instaloader are stubbed **seams** — they need a headless browser / rate-limited proxied session, so they belong in a separate worker, not a request-time function. |
| `src/lib/trendStore.js` | The cache. **Server-only** (`node:fs`/`os`). Single JSON file; path overridable via `ECHO_TRENDS_PATH`. |
| `api/trends.js` | `GET /api/trends?niche=<id\|free-text>` — reads the cache only, **never scrapes**. Falls back to a freshly generated mock batch on a cold instance so it always answers. |
| `api/trends-harvest.js` | `GET\|POST /api/trends-harvest` — runs the harvest and **writes** the batch (replaces the previous one). The daily cron target and the manual "run the scraper" action. |
| `vercel.json` | Cron: `/api/trends-harvest` daily at `0 6 * * *`. |

In dev, both routes are mounted by the `devApi()` plugin in `vite.config.js`
(same bridge as `/api/generate`), so the full thing runs under `vite dev` with
no Vercel CLI.

## Storage durability — the one open seam

The file store persists across requests locally, but on Vercel it lives in
`/tmp`, which is **per-instance and ephemeral** — fine for the demo (the query
path also falls back to a fresh mock batch), but not durable across instances.
For production, swap `readBatch`/`writeBatch` in `trendStore.js` for a shared
store (Vercel Blob, Edge Config, or a Marketplace Postgres/Redis). The
`TrendBatch` shape and those two signatures are the contract — `api/*` callers
don't change.

## Configuration

| Env var | Default | Purpose |
|---|---|---|
| `ECHO_TRENDS_PATH` | `os.tmpdir()/echo-trends.json` | Where the cache file lives. |
| `ECHO_TRENDS_LIVE` | live on | Set to `0` to force the deterministic mock-only harvest (offline / CI). Live failures fall back to mock regardless. |

No env vars are required to run — matching the app's zero-config stance.

## Testing it on its own

```bash
npm run test:trends      # the spec's 3 checks + normalization, staleness, store, live-merge
```

End-to-end against a running dev server (`npm run dev`):

```bash
curl -X POST localhost:5173/api/trends-harvest          # run the scraper → fresh batch + timestamp
curl 'localhost:5173/api/trends?niche=skincare'         # query the cache for a niche
curl 'localhost:5173/api/trends?niche=%23GymTok'        # fuzzy/hashtag input → fitness
```

## How it connects

`/api/trends?niche=<brand niche>` is the **Today's Market Trends** input to the
Feature 3 audit (`Echo_Plan.md`). The audit composes the parsed posts (Feature 2)
+ this trend slice + brand voice into the critique — and because trends come
from the cache, that composition is free per request.
