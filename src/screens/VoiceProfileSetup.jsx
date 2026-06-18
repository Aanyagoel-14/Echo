import { useMemo, useState } from 'react'
import Button from '../components/Button'
import ImportPosts from '../components/ImportPosts'
import { TONE_PRESETS, saveBrandVoice } from '../lib/brandVoice'
import { distillVoiceProfile, normalisePosts } from '../lib/api'
import { passThroughPosts } from '../lib/posts'
import {
  ENGINE_LABEL,
  buildLocalProfile,
  composeProfile,
  loadVoiceProfile,
  saveVoiceProfile,
} from '../lib/voiceProfile'

// Where the pasted posts came from (feature-optimisation Phase 2). Ids match the
// posts.json contract's PLATFORMS; the choice tunes how the distiller reads the
// voice and is stored on the profile. Optional — left unset reads as "other".
const PLATFORMS_UI = [
  { id: 'x', label: 'X', blurb: 'Threads & quick takes' },
  { id: 'instagram', label: 'Instagram', blurb: 'Captions & stories' },
  { id: 'linkedin', label: 'LinkedIn', blurb: 'Professional posts' },
  { id: 'other', label: 'Other', blurb: 'Anywhere else' },
]

/*
 * Voice Profile builder (CP12) — the spine, and the first-run setup step (§0.1).
 *
 * The creator pastes a few of their posts (tone preset is an optional cold-start
 * scaffold). On "Build my voice," Echo distills them into an editable `voice.md`
 * — the cloud engine (/api/voice) when available, the on-device engine as the
 * always-works fallback. The result is shown, editable, and persisted locally;
 * the boot gate then sends returning creators straight to Capture.
 */
export default function VoiceProfileSetup({ onDone, onCancel }) {
  const existing = useMemo(() => loadVoiceProfile(), [])

  // 'input' (paste posts) → 'review' (see/edit the voice.md). Returning creators
  // editing their profile start in review with what's saved.
  const [phase, setPhase] = useState(existing ? 'review' : 'input')
  const [samples, setSamples] = useState('')
  const [tone, setTone] = useState(existing?.source?.tone ?? null)
  const [platform, setPlatform] = useState(existing?.source?.platform ?? null)
  const [profile, setProfile] = useState(existing)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  const toggleTone = (id) => setTone((t) => (t === id ? null : id))
  const togglePlatform = (id) => setPlatform((p) => (p === id ? null : id))

  // Imported posts (a platform export, parsed in-browser) append into the paste
  // box just like a manual paste, then feed the distiller and the audit bridge.
  const handleImported = ({ posts, source }) => {
    const text = posts.join('\n\n')
    setSamples((s) => (s.trim() ? `${s.trim()}\n\n${text}` : text))
    if (source) setPlatform(source)
  }

  async function build() {
    const text = samples.trim()
    if (text.length < 40) {
      setError('Paste a bit more — two or three of your posts works best.')
      return
    }
    setError(null)
    setBusy(true)
    // Bridge to the Audit (Feature 3): persist the raw posts as brandVoice
    // samples so the always-on audit can critique the creator's actual posts.
    // The distilled voiceProfile stays the first-class artifact for synthesis.
    saveBrandVoice({ tone, samples: text, source: platform })
    let artifact
    try {
      // Smart paste (Phase 1): clean + structure the raw paste into posts.json
      // BEFORE distilling, so the voice profile is learned from the creator's
      // actual words — not "1.2K", "Show more", or timestamps. The cloud
      // normaliser does the cleaning; the deterministic splitter is the
      // never-fail fallback when it's unavailable.
      let postsJson
      try {
        postsJson = await normalisePosts({ raw: text, platform, source: 'paste' })
      } catch {
        postsJson = passThroughPosts(text, { platform, source: 'paste' })
      }
      // Cloud distiller (richer) on the clean posts; the on-device heuristic
      // engine is the reliable fallback below — either way, a real voice.md.
      // `platform` (Phase 2) lets the distiller read the voice in context.
      const remote = await distillVoiceProfile({ posts: postsJson.posts, tone, platform })
      artifact = composeProfile({
        profileMarkdown: remote.profileMarkdown,
        traits: remote.traits,
        samples: text,
        tone,
        platform,
        engine: 'echo-cloud',
      })
    } catch {
      artifact = buildLocalProfile({ samples: text, tone, platform })
    }
    setProfile(artifact)
    setBusy(false)
    setPhase('review')
  }

  function save() {
    if (!profile) return
    saveVoiceProfile({
      ...profile,
      updatedAt: new Date().toISOString(),
      revisions: existing ? (profile.revisions ?? 0) + 1 : profile.revisions ?? 0,
    })
    onDone()
  }

  const editMarkdown = (val) =>
    setProfile((p) => (p ? { ...p, profileMarkdown: val } : p))

  if (busy) return <BuildingView />

  if (phase === 'review' && profile) {
    return (
      <ReviewView
        profile={profile}
        onEditMarkdown={editMarkdown}
        onSave={save}
        onRebuild={() => {
          setError(null)
          setPhase('input')
        }}
      />
    )
  }

  return (
    <section className="flex flex-1 flex-col gap-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-bold tracking-tight text-ink">
          Teach Echo your voice
        </h1>
        <p className="text-pretty leading-relaxed text-muted">
          Paste a few of your posts. Echo distills them into your{' '}
          <span className="text-ink">voice profile</span> — a guide to how
          <em> you </em> write — and reuses it on everything you create. You only
          do this once.
        </p>
      </div>

      {/* Import posts from a platform export (read in-browser, never uploaded);
          they drop into the paste box below, then feed the distiller + audit. */}
      <ImportPosts onImported={handleImported} />

      <div className="space-y-2">
        <label htmlFor="samples" className="text-sm font-medium text-muted">
          Your posts
        </label>
        <textarea
          id="samples"
          value={samples}
          onChange={(e) => setSamples(e.target.value)}
          rows={7}
          autoFocus
          placeholder={
            'Paste 2–4 of your posts here.\nThe more real your words, the sharper your twin.'
          }
          className="w-full resize-none rounded-2xl border border-border bg-surface px-4 py-3 text-base leading-relaxed text-ink placeholder:text-muted/60 focus:border-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
        />
      </div>

      <fieldset className="space-y-3">
        <legend className="pb-1 text-sm font-medium text-muted">
          Where are these from? <span className="text-muted/70">· optional</span>
        </legend>
        <div className="grid grid-cols-2 gap-3">
          {PLATFORMS_UI.map((p) => {
            const active = platform === p.id
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => togglePlatform(p.id)}
                aria-pressed={active}
                className={[
                  'rounded-2xl border p-3 text-left transition duration-150 active:scale-[0.99]',
                  'focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/60',
                  active
                    ? 'border-accent bg-accent/10'
                    : 'border-border bg-surface hover:border-accent/40',
                ].join(' ')}
              >
                <span className="font-semibold text-ink">{p.label}</span>
                <span className="mt-0.5 block text-xs leading-snug text-muted">
                  {p.blurb}
                </span>
              </button>
            )
          })}
        </div>
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="pb-1 text-sm font-medium text-muted">
          Starting tone <span className="text-muted/70">· optional</span>
        </legend>
        <div className="grid grid-cols-2 gap-3">
          {TONE_PRESETS.map((preset) => {
            const active = tone === preset.id
            return (
              <button
                key={preset.id}
                type="button"
                onClick={() => toggleTone(preset.id)}
                aria-pressed={active}
                className={[
                  'rounded-2xl border p-3 text-left transition duration-150 active:scale-[0.99]',
                  'focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/60',
                  active
                    ? 'border-accent bg-accent/10'
                    : 'border-border bg-surface hover:border-accent/40',
                ].join(' ')}
              >
                <span className="font-semibold text-ink">{preset.label}</span>
                <span className="mt-0.5 block text-xs leading-snug text-muted">
                  {preset.blurb}
                </span>
              </button>
            )
          })}
        </div>
      </fieldset>

      {error && <p className="text-sm text-red-400">{error}</p>}

      <div className="mt-auto space-y-3 pt-2">
        <Button onClick={build} disabled={samples.trim().length < 40}>
          Build my voice
        </Button>
        <p className="text-center text-xs text-muted">
          Distilled in the cloud. Your voice profile is saved only on this device.
        </p>
        {existing && (
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        )}
      </div>
    </section>
  )
}

// Shown while a profile is being distilled (cloud round-trip or local compute).
function BuildingView() {
  return (
    <section className="flex flex-1 flex-col items-center justify-center gap-6 text-center">
      <span className="flex gap-1.5" aria-hidden="true">
        <Dot />
        <Dot delay="0.15s" />
        <Dot delay="0.3s" />
      </span>
      <div className="space-y-2">
        <h1 className="text-xl font-semibold text-ink">Distilling your voice…</h1>
        <p className="text-sm text-muted">Cleaning your posts and learning how you write.</p>
      </div>
    </section>
  )
}

function Dot({ delay = '0s' }) {
  return (
    <span
      className="h-2.5 w-2.5 rounded-full bg-accent animate-ripple"
      style={{ animationDelay: delay, animationDuration: '1.1s' }}
    />
  )
}

// The payoff: render the learned voice.md, editable. This is the literal
// "skills.md for you."
function ReviewView({ profile, onEditMarkdown, onSave, onRebuild }) {
  const t = profile.traits ?? {}
  const chips = [...(t.vocabulary ?? []), ...(t.topics ?? [])].slice(0, 8)
  const engineLabel = ENGINE_LABEL[profile.source?.engine] ?? 'Built on your device'

  return (
    <section className="flex flex-1 flex-col gap-5">
      <div className="space-y-2">
        <h1 className="text-2xl font-bold tracking-tight text-ink">
          Echo learned your voice
        </h1>
        <p className="text-pretty leading-relaxed text-muted">
          This is your <span className="text-ink">voice.md</span> — injected into
          everything you make. Tweak anything that doesn&apos;t sound like you.
        </p>
      </div>

      {t.voiceOneLiner && (
        <div className="rounded-2xl border border-accent/30 bg-accent/10 px-4 py-3">
          <p className="text-sm leading-relaxed text-ink">{t.voiceOneLiner}</p>
        </div>
      )}

      {chips.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {chips.map((c) => (
            <span
              key={c}
              className="rounded-full border border-border bg-surface px-3 py-1 text-xs text-muted"
            >
              {c}
            </span>
          ))}
        </div>
      )}

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label htmlFor="voicemd" className="text-sm font-medium text-muted">
            Your voice profile
          </label>
          <span className="text-xs text-accent">{engineLabel}</span>
        </div>
        <textarea
          id="voicemd"
          value={profile.profileMarkdown}
          onChange={(e) => onEditMarkdown(e.target.value)}
          rows={12}
          className="w-full resize-none rounded-2xl border border-border bg-surface px-4 py-3 font-mono text-[13px] leading-relaxed text-ink focus:border-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
        />
      </div>

      <div className="mt-auto space-y-3 pt-2">
        <Button onClick={onSave}>Save &amp; start creating</Button>
        <Button variant="ghost" onClick={onRebuild}>
          Rebuild from posts
        </Button>
      </div>
    </section>
  )
}
