#!/usr/bin/env python3
"""
Echo — Instagram co-occurrence harvester (Feature 1, the rate-limited seam).

WHY A SEPARATE WORKER: Instagram rate-limits hashtag scraping hard and needs a
logged-in session (and ideally rotating proxies), so this CANNOT run inside a
Vercel serverless function. It runs on its own daily schedule (see
.github/workflows/instagram-harvest.yml), slowly, and writes a JSON file that the
Node harvest reads as a best-effort live source
(src/lib/trendSources.js → fetchInstagramCooccurrence).

WHAT IT DOES: for each niche it queries a few baseline seed hashtags
(worker/niches.json, derived from the app's canonical taxonomy via
`npm run export:niches`), reads the hashtags that co-occur on recent top posts,
ranks them by frequency, and emits the strongest co-occurring tags per niche.

OUTPUT (default worker/output/instagram-cooccurrence.json) — the exact shape
fetchInstagramCooccurrence() expects:
  {
    "version": 1,
    "harvestedAt": "2026-06-18T05:00:00Z",
    "source": "instaloader",
    "geo": "US",
    "niches": { "skincare": ["#glassskin", "#barrierrepair", ...], ... }
  }

RUN:
  pip install -r worker/requirements.txt
  python worker/instagram_harvest.py

CONFIG (env; see worker/.env.example): IG_USERNAME, IG_PASSWORD or IG_SESSIONFILE,
HTTPS_PROXY, ECHO_IG_OUTPUT, IG_POSTS_PER_TAG, IG_MAX_TAGS_PER_NICHE,
IG_MAX_SEEDS_PER_NICHE, IG_SLEEP_SECONDS, IG_GEO.
"""

from __future__ import annotations

import itertools
import json
import os
import sys
import time
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

try:
    import instaloader
except ImportError:
    sys.exit("instaloader not installed — run: pip install -r worker/requirements.txt")


HERE = Path(__file__).resolve().parent


def env_int(name: str, default: int) -> int:
    try:
        return int(os.environ.get(name, default))
    except (TypeError, ValueError):
        return default


def load_seeds() -> dict[str, list[str]]:
    """Read the niche → seed-hashtags map produced by `npm run export:niches`."""
    cfg = json.loads((HERE / "niches.json").read_text())
    return cfg.get("niches", {})


def make_loader() -> "instaloader.Instaloader":
    """
    Build an Instaloader that fetches nothing to disk (we only read post
    metadata) and paces itself. Auth, in preference order: a saved session file,
    then username/password, else anonymous (Instagram heavily limits anon
    hashtag access, so a session is strongly recommended). Proxies are honoured
    through the standard HTTPS_PROXY env var since Instaloader uses `requests`.
    """
    loader = instaloader.Instaloader(
        sleep=True,  # respect Instaloader's built-in request pacing
        quiet=True,
        download_pictures=False,
        download_videos=False,
        download_video_thumbnails=False,
        download_comments=False,
        save_metadata=False,
        compress_json=False,
        max_connection_attempts=2,
    )

    user = os.environ.get("IG_USERNAME")
    password = os.environ.get("IG_PASSWORD")
    sessionfile = os.environ.get("IG_SESSIONFILE")

    if user and sessionfile and Path(sessionfile).exists():
        try:
            loader.load_session_from_file(user, sessionfile)
            print(f"[ig] loaded session for {user}")
            return loader
        except Exception as err:  # noqa: BLE001 — best-effort auth ladder
            print(f"[ig] session load failed ({err}); trying login/anonymous")

    if user and password:
        try:
            loader.login(user, password)
            print(f"[ig] logged in as {user}")
            return loader
        except Exception as err:  # noqa: BLE001
            print(f"[ig] login failed ({err}); continuing anonymously (limited)")

    print("[ig] no credentials — anonymous mode (Instagram heavily limits this)")
    return loader


def cooccurring_tags(loader, seed: str, posts_per_tag: int, sleep_s: int) -> Counter:
    """Caption hashtags that co-occur with `seed` on its recent top posts."""
    counts: Counter = Counter()
    name = seed.lstrip("#")
    try:
        hashtag = instaloader.Hashtag.from_name(loader.context, name)
        for post in itertools.islice(hashtag.get_top_posts(), posts_per_tag):
            for tag in post.caption_hashtags:
                tag = tag.lower()
                if tag and tag != name.lower():
                    counts["#" + tag] += 1
            time.sleep(sleep_s)  # gentle between posts
    except Exception as err:  # noqa: BLE001 — one seed failing must not stop the run
        print(f"[ig]   seed #{name} failed: {err}")
    return counts


def main() -> None:
    seeds = load_seeds()
    if not seeds:
        sys.exit("no seeds in worker/niches.json — run: npm run export:niches")

    posts_per_tag = env_int("IG_POSTS_PER_TAG", 15)
    max_tags = env_int("IG_MAX_TAGS_PER_NICHE", 8)
    max_seeds = env_int("IG_MAX_SEEDS_PER_NICHE", 3)
    sleep_s = env_int("IG_SLEEP_SECONDS", 2)
    geo = os.environ.get("IG_GEO", "US")
    out_path = Path(
        os.environ.get("ECHO_IG_OUTPUT", HERE / "output" / "instagram-cooccurrence.json")
    )

    loader = make_loader()

    out_niches: dict[str, list[str]] = {}
    for niche_id, seed_tags in seeds.items():
        tally: Counter = Counter()
        for seed in seed_tags[:max_seeds]:
            print(f"[ig] {niche_id} ← #{str(seed).lstrip('#')}")
            tally.update(cooccurring_tags(loader, str(seed), posts_per_tag, sleep_s))
            time.sleep(sleep_s)  # gentle between seeds

        # Drop the seeds themselves; keep the strongest co-occurring tags.
        seed_set = {str(s).lower() for s in seed_tags}
        ranked = [tag for tag, _ in tally.most_common() if tag.lower() not in seed_set]
        if ranked:
            out_niches[niche_id] = ranked[:max_tags]
        print(f"[ig] {niche_id}: {len(out_niches.get(niche_id, []))} co-occurring tags")

    payload = {
        "version": 1,
        "harvestedAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "source": "instaloader",
        "geo": geo,
        "niches": out_niches,
    }
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(payload, indent=2) + "\n")
    print(f"[ig] wrote {out_path} — {len(out_niches)} niches")


if __name__ == "__main__":
    main()
