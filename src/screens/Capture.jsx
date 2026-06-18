import { useEffect, useRef, useState } from 'react'
import Button from '../components/Button'
import VoiceTag from '../components/VoiceTag'
import { loadVoiceProfile } from '../lib/voiceProfile'
import { compressImage } from '../lib/image'

// One <input> drives both the camera and the photo library on mobile.
const PHOTO_INPUT_ID = 'capture-photo'
// A separate, multi-select input for style references (library, not camera).
const INSPO_INPUT_ID = 'capture-inspiration'
// Cap inspiration so the request stays small and the row stays tidy.
const MAX_INSPIRATION = 6

// The formats Echo can produce. Selected up front (in the flow) so generation
// makes exactly what the creator wants and Results shows only those — no
// after-the-fact tab hunting.
const FORMATS = [
  { id: 'reel', label: 'Reel', blurb: 'Hook · script · shot list' },
  { id: 'carousel', label: 'Carousel', blurb: '5 IG slides' },
  { id: 'thread', label: 'X thread', blurb: 'Threaded posts' },
]

function CameraIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-7 w-7"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 8.5A2.5 2.5 0 0 1 5.5 6h1.2a2 2 0 0 0 1.7-1l.5-1A1 1 0 0 1 10.6 3h2.8a1 1 0 0 1 .9.5l.5 1a2 2 0 0 0 1.7 1h1.2A2.5 2.5 0 0 1 21 8.5v8A2.5 2.5 0 0 1 18.5 19h-13A2.5 2.5 0 0 1 3 16.5z" />
      <circle cx="12" cy="13" r="3.2" />
    </svg>
  )
}

function PlusIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-5 w-5"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
    >
      <path d="M12 5v14M5 12h14" />
    </svg>
  )
}

/*
 * Capture (§5). One input is all Echo needs: a product photo (camera or upload)
 * OR a one-line brief. Either one is enough — "Generate kit" stays disabled
 * until at least one is provided, then hands the request up to be POSTed to
 * /api/generate (CP7). The endpoint returns mock JSON until the event.
 */
export default function Capture({ onGenerate, onBack, onChangeVoice }) {
  const [photo, setPhoto] = useState(null)
  const [photoUrl, setPhotoUrl] = useState(null)
  const [brief, setBrief] = useState('')
  // Which formats to generate — all on by default; at least one required.
  const [formats, setFormats] = useState(() => FORMATS.map((f) => f.id))
  // True while we downscale/encode images right before handing off to Loading.
  const [preparing, setPreparing] = useState(false)
  // Style references: { id, file, url } each. Optional — they shape the
  // narrative, they don't gate generation.
  const [inspirations, setInspirations] = useState([])
  const fileRef = useRef(null)
  const inspoRef = useRef(null)

  // Revoke the preview URL when it's replaced or the screen unmounts so we
  // don't leak blobs. The URL itself is created in the picker handler below —
  // object URLs are a side effect, so they belong in the event, not an effect.
  useEffect(() => {
    if (!photoUrl) return undefined
    return () => URL.revokeObjectURL(photoUrl)
  }, [photoUrl])

  // Inspiration URLs are revoked one-by-one on removal; this only sweeps
  // whatever's left on unmount. A ref keeps the cleanup pointed at the latest
  // list without re-subscribing (and re-revoking live URLs) on every add.
  const inspirationsRef = useRef(inspirations)
  useEffect(() => {
    inspirationsRef.current = inspirations
  }, [inspirations])
  useEffect(
    () => () => inspirationsRef.current.forEach((i) => URL.revokeObjectURL(i.url)),
    [],
  )

  const hasSubject = Boolean(photo) || brief.trim().length > 0
  const canGenerate = hasSubject && formats.length > 0 && !preparing

  const toggleFormat = (id) =>
    setFormats((prev) =>
      prev.includes(id) ? prev.filter((f) => f !== id) : [...prev, id],
    )

  const handlePhotoChange = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setPhoto(file)
    setPhotoUrl(URL.createObjectURL(file))
  }

  const handleRemovePhoto = () => {
    setPhoto(null)
    setPhotoUrl(null)
    // Reset the input so re-picking the same file still fires onChange.
    if (fileRef.current) fileRef.current.value = ''
  }

  const handleInspoChange = (e) => {
    const files = Array.from(e.target.files ?? [])
    if (files.length) {
      setInspirations((prev) => {
        const room = MAX_INSPIRATION - prev.length
        const next = files.slice(0, room).map((file) => ({
          id: `${file.name}-${file.size}-${file.lastModified}-${Math.random()
            .toString(36)
            .slice(2, 7)}`,
          file,
          url: URL.createObjectURL(file),
        }))
        return [...prev, ...next]
      })
    }
    // Reset so picking the same file(s) again still fires onChange.
    if (inspoRef.current) inspoRef.current.value = ''
  }

  const handleRemoveInspo = (id) => {
    setInspirations((prev) => {
      const target = prev.find((i) => i.id === id)
      if (target) URL.revokeObjectURL(target.url)
      return prev.filter((i) => i.id !== id)
    })
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!canGenerate) return
    setPreparing(true)
    // Downscale + encode the photo and any references to compact base64 so the
    // vision model can actually read the pixels (small enough to POST). Then
    // hand the request up — Loading POSTs it to /api/generate and routes to
    // Results, or to the error screen on failure.
    const [imageData, inspirationData] = await Promise.all([
      photo ? compressImage(photo) : Promise.resolve(null),
      Promise.all(inspirations.map((i) => compressImage(i.file))),
    ])

    onGenerate({
      input: brief.trim(),
      formats,
      image: photo
        ? { name: photo.name, type: photo.type, dataUrl: imageData }
        : null,
      inspiration: inspirations
        .map((i, idx) => ({ name: i.file.name, dataUrl: inspirationData[idx] }))
        .filter((i) => i.dataUrl),
      // The creator's distilled voice.md — injected so the kit sounds like them.
      voiceProfile: loadVoiceProfile(),
    })
  }

  return (
    <form className="flex flex-1 flex-col gap-6" onSubmit={handleSubmit}>
      <div className="space-y-3">
        <div className="space-y-2">
          <h1 className="text-2xl font-bold tracking-tight text-ink">
            What are you promoting?
          </h1>
          <p className="text-pretty leading-relaxed text-muted">
            Snap a product photo or jot a one-line brief — either is enough for
            Echo to build your kit.
          </p>
        </div>
        <VoiceTag onChange={onChangeVoice} />
      </div>

      <div>
        <input
          id={PHOTO_INPUT_ID}
          ref={fileRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handlePhotoChange}
          className="peer sr-only"
        />
        {photoUrl ? (
          <div className="relative h-44 overflow-hidden rounded-2xl border border-border bg-surface shadow-card">
            <img
              src={photoUrl}
              alt="Selected product"
              className="h-full w-full object-cover"
            />
            <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-2 bg-black/55 p-3">
              <span className="truncate text-xs text-white/90">
                {photo?.name}
              </span>
              <div className="flex shrink-0 gap-2">
                <label
                  htmlFor={PHOTO_INPUT_ID}
                  className="cursor-pointer rounded-full bg-white/15 px-3 py-1.5 text-xs font-medium text-white transition duration-150 hover:bg-white/25"
                >
                  Retake
                </label>
                <button
                  type="button"
                  onClick={handleRemovePhoto}
                  className="rounded-full bg-white/15 px-3 py-1.5 text-xs font-medium text-white transition duration-150 hover:bg-white/25"
                >
                  Remove
                </button>
              </div>
            </div>
          </div>
        ) : (
          <label
            htmlFor={PHOTO_INPUT_ID}
            className="flex h-44 cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border bg-surface text-center shadow-card transition duration-150 hover:border-accent/50 active:scale-[0.99] peer-focus-visible:border-accent peer-focus-visible:ring-2 peer-focus-visible:ring-accent/50"
          >
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl border border-border bg-bg text-accent">
              <CameraIcon />
            </span>
            <span className="text-sm font-medium text-ink">
              Snap a product photo
            </span>
            <span className="text-xs text-muted">Tap to open your camera</span>
          </label>
        )}
      </div>

      <div className="flex items-center gap-3" aria-hidden="true">
        <span className="h-px flex-1 bg-border" />
        <span className="text-xs font-medium uppercase tracking-wide text-muted">
          or
        </span>
        <span className="h-px flex-1 bg-border" />
      </div>

      <div className="space-y-2">
        <label htmlFor="brief" className="text-sm font-medium text-muted">
          One-line brief
        </label>
        <input
          id="brief"
          type="text"
          value={brief}
          onChange={(e) => setBrief(e.target.value)}
          maxLength={200}
          enterKeyHint="go"
          placeholder="e.g. New matte steel water bottle for gym-goers"
          className="w-full rounded-2xl border border-border bg-surface px-4 py-3 text-base leading-relaxed text-ink shadow-card placeholder:text-muted/60 focus:border-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
        />
      </div>

      <div className="space-y-3">
        <div className="flex items-baseline justify-between gap-2">
          <label htmlFor={INSPO_INPUT_ID} className="text-sm font-medium text-muted">
            Inspiration{' '}
            <span className="font-normal text-muted/60">(optional)</span>
          </label>
          {inspirations.length > 0 && (
            <span className="text-xs text-muted/70">
              {inspirations.length}/{MAX_INSPIRATION}
            </span>
          )}
        </div>
        <p className="text-xs leading-relaxed text-muted/80">
          Add reference posts or visuals you love — Echo studies their style to
          shape the narrative across your Reel, carousel, and thread.
        </p>

        <input
          id={INSPO_INPUT_ID}
          ref={inspoRef}
          type="file"
          accept="image/*"
          multiple
          onChange={handleInspoChange}
          className="sr-only"
        />

        <div className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-1">
          {inspirations.map((item) => (
            <div
              key={item.id}
              className="relative h-20 w-20 shrink-0 overflow-hidden rounded-xl border border-border bg-surface"
            >
              <img
                src={item.url}
                alt={`Inspiration: ${item.file.name}`}
                className="h-full w-full object-cover"
              />
              <button
                type="button"
                onClick={() => handleRemoveInspo(item.id)}
                aria-label={`Remove ${item.file.name}`}
                className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-sm leading-none text-white transition duration-150 hover:bg-black/80"
              >
                ×
              </button>
            </div>
          ))}

          {inspirations.length < MAX_INSPIRATION && (
            <label
              htmlFor={INSPO_INPUT_ID}
              className="flex h-20 w-20 shrink-0 cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-border bg-surface text-muted transition duration-150 hover:border-accent/50 hover:text-accent active:scale-[0.99]"
            >
              <PlusIcon />
              <span className="text-[10px] font-medium uppercase tracking-wide">
                Add
              </span>
            </label>
          )}
        </div>
      </div>

      <fieldset className="space-y-3">
        <legend className="pb-1 text-sm font-medium text-muted">
          What should Echo make?
        </legend>
        <div className="flex flex-wrap gap-2">
          {FORMATS.map((f) => {
            const active = formats.includes(f.id)
            return (
              <button
                key={f.id}
                type="button"
                onClick={() => toggleFormat(f.id)}
                aria-pressed={active}
                className={[
                  'inline-flex items-center gap-1.5 rounded-full border px-4 py-2 text-sm font-semibold transition duration-150 active:scale-[0.98]',
                  'focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/60',
                  active
                    ? 'border-accent bg-accent text-white'
                    : 'border-border bg-surface text-muted hover:border-accent/40 hover:text-ink',
                ].join(' ')}
              >
                {active && <CheckIcon />}
                {f.label}
              </button>
            )
          })}
        </div>
      </fieldset>

      <div className="mt-auto space-y-3 pt-2">
        <Button type="submit" disabled={!canGenerate}>
          {preparing ? 'Preparing…' : 'Generate kit'}
        </Button>
        <p className="text-center text-xs text-muted">
          {!hasSubject
            ? 'Add a photo or a one-line brief to start.'
            : formats.length === 0
              ? 'Pick at least one format to generate.'
              : `In your voice — ${formatSummary(formats)}.`}
        </p>
        <Button variant="ghost" onClick={onBack}>
          Back to audit
        </Button>
      </div>
    </form>
  )
}

// "Reel", "Reel & carousel", "Reel, carousel & X thread" — for the helper line.
const SUMMARY_LABEL = { reel: 'Reel', carousel: 'carousel', thread: 'X thread' }
function formatSummary(ids) {
  const labels = FORMATS.filter((f) => ids.includes(f.id)).map(
    (f) => SUMMARY_LABEL[f.id],
  )
  if (labels.length <= 1) return labels[0] ?? ''
  return `${labels.slice(0, -1).join(', ')} & ${labels[labels.length - 1]}`
}

function CheckIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-3.5 w-3.5"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  )
}
