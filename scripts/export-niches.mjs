/*
 * Derive worker/niches.json — the Instaloader worker's seed config — from the
 * canonical niche taxonomy in src/lib/trends.js, so the Python worker and the
 * app share ONE source of truth for which hashtags seed each niche. The generic
 * niche is skipped (its tags aren't a real niche to scrape).
 *
 * Re-run after editing NICHES:  npm run export:niches
 */
import { writeFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

import { NICHES, GENERIC_NICHE } from '../src/lib/trends.js'

const SEEDS_PER_NICHE = 3

const __dirname = dirname(fileURLToPath(import.meta.url))
const outDir = join(__dirname, '..', 'worker')
const outPath = join(outDir, 'niches.json')

const niches = {}
for (const [id, niche] of Object.entries(NICHES)) {
  if (id === GENERIC_NICHE) continue
  niches[id] = niche.tags.slice(0, SEEDS_PER_NICHE)
}

mkdirSync(outDir, { recursive: true })
writeFileSync(
  outPath,
  JSON.stringify({ version: 1, seedsPerNiche: SEEDS_PER_NICHE, niches }, null, 2) + '\n',
  'utf8',
)
console.log(
  `Wrote ${outPath} — ${Object.keys(niches).length} niches × ${SEEDS_PER_NICHE} seed tags.`,
)
