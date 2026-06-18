/**
 * Brand voice persistence (§5 + CP3). The creator's voice — a tone preset
 * and/or a few sample posts — lives in localStorage so it survives refreshes and
 * is ready for the synthesis call later (CP7 sends it to /api/generate). This is
 * the single place that touches storage, so screens never poke localStorage
 * directly.
 */

const STORAGE_KEY = 'echo.brandVoice.v1'

// Tone presets offered on the setup screen (§5). `id` is what we persist/send.
export const TONE_PRESETS = [
  { id: 'playful', label: 'Playful', blurb: 'Fun, casual, emoji-friendly' },
  { id: 'professional', label: 'Professional', blurb: 'Polished, clear, trustworthy' },
  { id: 'bold', label: 'Bold', blurb: 'Punchy, confident, high-energy' },
  { id: 'minimal', label: 'Minimal', blurb: 'Clean, concise, no fluff' },
]

// Where the pasted samples come from — optional, single-select ("Where are
// these from?"). `id` is persisted/sent so synthesis can lean platform-native.
export const SOURCES = [
  { id: 'x', label: 'X' },
  { id: 'instagram', label: 'Instagram' },
  { id: 'linkedin', label: 'LinkedIn' },
  { id: 'other', label: 'Other' },
]

const SOURCE_IDS = new Set(SOURCES.map((s) => s.id))

export const EMPTY_VOICE = { tone: null, samples: '', source: null }

// True once the creator has given us something to actually learn from. Source
// alone isn't "voice" — it only labels samples — so it doesn't count here.
export function hasVoice(voice) {
  return Boolean(voice && (voice.tone || voice.samples.trim()))
}

export function loadBrandVoice() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...EMPTY_VOICE }
    const parsed = JSON.parse(raw)
    return {
      tone: parsed.tone ?? null,
      samples: typeof parsed.samples === 'string' ? parsed.samples : '',
      source: SOURCE_IDS.has(parsed.source) ? parsed.source : null,
    }
  } catch {
    // Corrupt or blocked storage shouldn't break the app — start fresh.
    return { ...EMPTY_VOICE }
  }
}

export function saveBrandVoice(voice) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(voice))
  } catch {
    // Private mode / quota errors are non-fatal; in-memory state still works.
  }
}

/*
 * Normalize the stored samples blob into the §6 contract shape (`string[]`,
 * 0–4 posts). The Setup screen keeps one low-friction textarea; we split it into
 * discrete posts at the API seam (blank line = post boundary) so the synthesis
 * prompt gets real samples to match, not one wall of text.
 */
export function samplesToArray(samples) {
  if (Array.isArray(samples)) return samples.slice(0, 4)
  if (typeof samples !== 'string') return []
  return samples
    .split(/\n\s*\n/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 4)
}

// Map a tone id ('bold') or contract Tone ('Bold') to its display label, or
// null if unknown — so renderers can show a tone chip from either source.
export function toneLabel(tone) {
  if (!tone) return null
  const id = String(tone).toLowerCase()
  return TONE_PRESETS.find((p) => p.id === id)?.label ?? null
}
