import { useEffect, useRef, useState } from 'react'
import Button from '../components/Button'
import { loadBrandVoice } from '../lib/brandVoice'

// One <input> drives both the camera and the photo library on mobile.
const PHOTO_INPUT_ID = 'capture-photo'

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

/*
 * Capture (§5). One input is all Echo needs: a product photo (camera or upload)
 * OR a one-line brief. Either one is enough — "Generate kit" stays disabled
 * until at least one is provided, then hands the request up to be POSTed to
 * /api/generate (CP7). The endpoint returns mock JSON until the event.
 */
export default function Capture({ onGenerate, onBack }) {
  const [photo, setPhoto] = useState(null)
  const [photoUrl, setPhotoUrl] = useState(null)
  const [brief, setBrief] = useState('')
  const fileRef = useRef(null)

  // Revoke the preview URL when it's replaced or the screen unmounts so we
  // don't leak blobs. The URL itself is created in the picker handler below —
  // object URLs are a side effect, so they belong in the event, not an effect.
  useEffect(() => {
    if (!photoUrl) return undefined
    return () => URL.revokeObjectURL(photoUrl)
  }, [photoUrl])

  const canGenerate = Boolean(photo) || brief.trim().length > 0

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

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!canGenerate) return
    // Hand the synthesis request up — Loading POSTs it to /api/generate (via the
    // api lib) and routes to Results, or to the error screen on failure. The
    // endpoint returns mock JSON until the event; nothing here calls a model.
    // TODO (event): send the captured image BYTES (base64/multipart) so the
    // vision model can read the photo — the skeleton sends a descriptor only.
    onGenerate({
      input: brief.trim(),
      image: photo
        ? { name: photo.name, type: photo.type, size: photo.size }
        : null,
      brandVoice: loadBrandVoice(),
    })
  }

  return (
    <form className="flex flex-1 flex-col gap-6" onSubmit={handleSubmit}>
      <div className="space-y-2">
        <h1 className="text-2xl font-bold tracking-tight text-ink">
          What are you promoting?
        </h1>
        <p className="text-pretty leading-relaxed text-muted">
          Snap a product photo or jot a one-line brief — either is enough for
          Echo to build your kit.
        </p>
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
          <div className="relative h-44 overflow-hidden rounded-2xl border border-border bg-surface">
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
            className="flex h-44 cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border bg-surface text-center transition duration-150 hover:border-accent/50 active:scale-[0.99] peer-focus-visible:border-accent peer-focus-visible:ring-2 peer-focus-visible:ring-accent/50"
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
          className="w-full rounded-2xl border border-border bg-surface px-4 py-3 text-base leading-relaxed text-ink placeholder:text-muted/60 focus:border-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
        />
      </div>

      <div className="mt-auto space-y-3 pt-2">
        <Button type="submit" disabled={!canGenerate}>
          Generate kit
        </Button>
        <p className="text-center text-xs text-muted">
          {canGenerate
            ? 'Echo will turn this into a Reel, carousel, and X thread.'
            : 'Add a photo or a one-line brief to start.'}
        </p>
        <Button variant="ghost" onClick={onBack}>
          Back
        </Button>
      </div>
    </form>
  )
}
