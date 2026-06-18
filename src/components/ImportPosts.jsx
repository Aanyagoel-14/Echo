import { useRef, useState } from 'react'
import { IMPORT_PLATFORMS, importFromFile } from '../lib/socialImport'

/*
 * "Import your posts" — the creator uploads the posts file they exported from a
 * platform, and Echo learns their voice from it. The UI contract is final: it
 * calls importFromFile(file, platformHint) and receives { platform, handle,
 * posts } (the parser lives in importAdapters.js, the seam in socialImport.js).
 * On success it hands cleaned samples + the source up to Brand Voice, which fills
 * the "Your posts" field so the creator can review/edit before generating.
 *
 * No OAuth, no account connection, no server: the file is read and parsed in the
 * browser and never leaves the device.
 */

// Map a parser error code to user-facing copy. Everything falls back to the
// paste hint so the creator is never stuck.
const ERROR_TEXT = {
  'unsupported-file':
    'That doesn’t look like an export file — upload the posts file from the steps above, or paste a few posts below.',
  'parse-error':
    'Couldn’t read that file — make sure it’s the unmodified export file, or paste a few posts below.',
  'no-posts': 'Couldn’t find posts to learn from in that file — paste a few below instead.',
  'too-large':
    'That file’s larger than expected — make sure you picked the single posts file, not the whole archive.',
  'read-error': 'Couldn’t open that file — try again, or paste a few posts below.',
}
const GENERIC_ERROR = 'Couldn’t import that file — try again, or paste a few posts below.'
const errorText = (code) => ERROR_TEXT[code] || GENERIC_ERROR

// Per-platform "how to get your file" guide + the file to upload (plan §6).
const GUIDES = {
  instagram: {
    accept: '.json,application/json',
    file: 'posts_1.json',
    note: 'Personal accounts work too.',
    steps: [
      'Settings → Accounts Centre → Your information and permissions → Download your information',
      'Pick your account → “Some of your information” → under Content, tick Posts only',
      'Format: JSON · Media quality: Low · Date range: All time → submit',
      'Unzip the emailed link → open your_instagram_activity/media/posts_1.json',
    ],
  },
  x: {
    accept: '.js,text/javascript',
    file: 'tweets.js',
    note: 'X only offers a full archive — it can take up to 24h, so request it early (or paste a few tweets meanwhile).',
    steps: [
      'Settings → Your account → Download an archive of your data (re-enter password)',
      'Request archive → wait for the “ready” email',
      'Unzip → find data/tweets.js',
    ],
  },
  linkedin: {
    accept: '.csv,text/csv',
    file: 'Shares.csv',
    note: 'Fastest — the targeted file is usually ready in ~10 minutes.',
    steps: [
      'Settings & Privacy → Data Privacy → Get a copy of your data',
      '“Want something in particular?” → tick Posts / Shares only',
      'Request archive → download the emailed link → open Shares.csv',
    ],
  },
}

const labelFor = (id) => IMPORT_PLATFORMS.find((p) => p.id === id)?.label || id

export default function ImportPosts({ onImported }) {
  const [platform, setPlatform] = useState(IMPORT_PLATFORMS[0].id)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState(null) // { kind: 'ok' | 'err', text }
  const inputRef = useRef(null)

  const guide = GUIDES[platform]

  const onPick = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = '' // let the creator re-pick the same file
    if (!file || busy) return
    setBusy(true)
    setStatus(null)
    try {
      const { posts, handle, platform: detected } = await importFromFile(file, platform)
      onImported({ posts, source: detected })
      const n = posts.length
      const from = handle || `your ${labelFor(detected)} export`
      setStatus({
        kind: 'ok',
        text: `Imported ${n} ${n === 1 ? 'post' : 'posts'} from ${from} — review below.`,
      })
    } catch (err) {
      setStatus({ kind: 'err', text: errorText(err?.code) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <p className="text-sm font-semibold text-ink">Import your posts</p>
        <p className="text-xs leading-relaxed text-muted">
          Upload a posts file you exported from a platform and Echo learns your
          voice from your own posts. It’s read right here in your browser — your
          file never leaves your device, and there’s no login.
        </p>
      </div>

      {/* Platform picker — selects which export + instructions to show. */}
      <div role="tablist" aria-label="Platform" className="grid grid-cols-3 gap-2">
        {IMPORT_PLATFORMS.map((pf) => {
          const active = platform === pf.id
          return (
            <button
              key={pf.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => {
                setPlatform(pf.id)
                setStatus(null)
              }}
              className={[
                'flex items-center justify-center gap-1.5 rounded-2xl border px-3 py-2.5 text-sm font-semibold',
                'transition duration-150 active:scale-[0.99] focus:outline-none focus-visible:ring-2',
                'focus-visible:ring-accent/60 focus-visible:ring-offset-2 focus-visible:ring-offset-bg',
                active
                  ? 'border-accent bg-accent/10 text-ink'
                  : 'border-border bg-surface text-muted shadow-card hover:border-accent/40',
              ].join(' ')}
            >
              <PlatformGlyph id={pf.id} />
              <span>{pf.label}</span>
            </button>
          )
        })}
      </div>

      {/* How to get your file, for the selected platform. */}
      <div className="rounded-2xl border border-border bg-surface/60 p-3.5">
        <p className="text-xs font-semibold text-ink">
          How to get your {labelFor(platform)} file
          <span className="ml-1 font-normal text-muted">· upload {guide.file}</span>
        </p>
        <ol className="mt-1.5 list-decimal space-y-1 pl-4 text-xs leading-relaxed text-muted">
          {guide.steps.map((step, i) => (
            <li key={i}>{step}</li>
          ))}
        </ol>
        {guide.note && <p className="mt-2 text-xs italic leading-relaxed text-muted">{guide.note}</p>}
      </div>

      {/* Upload — a hidden file input fronted by the styled button. */}
      <input ref={inputRef} type="file" accept={guide.accept} onChange={onPick} className="sr-only" />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        aria-busy={busy}
        className={[
          'flex w-full items-center justify-center gap-2 rounded-2xl border border-border bg-surface px-4 py-3',
          'text-sm font-semibold text-ink shadow-card transition duration-150 active:scale-[0.99]',
          'hover:border-accent/40 disabled:pointer-events-none disabled:opacity-50',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/60',
          'focus-visible:ring-offset-2 focus-visible:ring-offset-bg',
        ].join(' ')}
      >
        {busy ? <Spinner /> : <UploadGlyph />}
        <span>{busy ? 'Reading your file…' : `Upload ${guide.file}`}</span>
      </button>

      {status && (
        <p
          aria-live="polite"
          className={[
            'text-xs leading-relaxed',
            status.kind === 'ok' ? 'text-accent' : 'text-red-500',
          ].join(' ')}
        >
          {status.text}
        </p>
      )}
    </div>
  )
}

function PlatformGlyph({ id }) {
  if (id === 'x') {
    return (
      <svg
        viewBox="0 0 24 24"
        className="h-[18px] w-[18px]"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        aria-hidden="true"
      >
        <path d="M4 4l16 16M20 4 4 20" />
      </svg>
    )
  }
  if (id === 'linkedin') {
    return (
      <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="currentColor" aria-hidden="true">
        <path d="M4.98 3.5A2.5 2.5 0 1 0 5 8.5a2.5 2.5 0 0 0-.02-5ZM3 9.5h4V21H3zM10 9.5h3.8v1.57h.05c.53-.95 1.83-1.95 3.77-1.95 4.03 0 4.78 2.6 4.78 5.98V21H18.6v-5.1c0-1.22-.03-2.78-1.7-2.78-1.7 0-1.96 1.32-1.96 2.69V21H11.2z" />
      </svg>
    )
  }
  // Instagram
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-[18px] w-[18px]"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
    >
      <rect x="4" y="4" width="16" height="16" rx="5" />
      <circle cx="12" cy="12" r="3.6" />
      <circle cx="16.6" cy="7.4" r="1" fill="currentColor" stroke="none" />
    </svg>
  )
}

function UploadGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-[18px] w-[18px]"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 16V4M7 9l5-5 5 5" />
      <path d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
    </svg>
  )
}

function Spinner() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-[18px] w-[18px] animate-spin"
      fill="none"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" opacity="0.25" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  )
}
