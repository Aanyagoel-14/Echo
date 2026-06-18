import { useState } from 'react'
import { loadBrandVoice, toneLabel } from '../lib/brandVoice'

/*
 * The "change your voice" affordance. A compact tag showing the voice the kit
 * is (or will be) written in, with a Change action that jumps back to Brand
 * Voice. Shown on Capture and Results so the creator can revisit their voice
 * any time without hunting for it. Reads the saved voice once on mount.
 */
export default function VoiceTag({ onChange }) {
  const [voice] = useState(loadBrandVoice)
  const label =
    toneLabel(voice.tone) || (voice.samples.trim() ? 'From your posts' : 'Default')

  return (
    <div className="flex items-center justify-between gap-3 rounded-full border border-border bg-surface px-4 py-2 shadow-card">
      <span className="flex min-w-0 items-center gap-2 text-sm text-muted">
        <span
          className="h-2 w-2 shrink-0 rounded-full bg-accent"
          aria-hidden="true"
        />
        <span className="truncate">
          Voice: <span className="font-semibold text-ink">{label}</span>
        </span>
      </span>
      <button
        type="button"
        onClick={onChange}
        className="shrink-0 rounded-full text-sm font-semibold text-accent transition hover:text-accent-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
      >
        Change
      </button>
    </div>
  )
}
