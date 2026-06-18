import { useEffect, useRef, useState } from 'react'
import Button from '../components/Button'
import {
  hasInspiration,
  loadInspiration,
  saveInspirationRefs,
} from '../lib/inspiration'

/*
 * Inspiration (optional). After teaching Echo their voice, the creator can show
 * it a few reference posts and visuals they love, and Echo borrows the vibe —
 * it doesn't copy them. Fully skippable: the primary button proceeds either way,
 * and its label flips to "Skip for now" when nothing's been added.
 *
 * Reference text persists (localStorage, via the inspiration lib); reference
 * images are session-only previews (object URLs) — only lightweight descriptors
 * { name, type, size } travel up, mirroring how Capture handles its photo until
 * real bytes are wired in at the event.
 */
const VISUAL_INPUT_ID = 'inspiration-visuals'
const MAX_VISUALS = 6

export default function Inspiration({ onContinue, onBack }) {
  // Load any persisted reference text once (lazy init); visuals start empty.
  const [refs, setRefs] = useState(() => loadInspiration().refs)
  // visuals: { id, url, name, type, size } — url is a session preview only.
  const [visuals, setVisuals] = useState([])
  const fileRef = useRef(null)

  // Persist the reference text as it changes (visuals stay in-session).
  useEffect(() => {
    saveInspirationRefs(refs)
  }, [refs])

  // Revoke every preview URL when the screen unmounts — no blob leaks. The ref
  // mirrors the latest list (updated in an effect, never during render) so the
  // unmount cleanup sees current visuals, not the empty array captured at mount.
  const visualsRef = useRef(visuals)
  useEffect(() => {
    visualsRef.current = visuals
  }, [visuals])
  useEffect(() => {
    return () => visualsRef.current.forEach((v) => URL.revokeObjectURL(v.url))
  }, [])

  const handleAdd = (e) => {
    const picked = Array.from(e.target.files || [])
    if (!picked.length) return
    setVisuals((cur) => {
      const room = MAX_VISUALS - cur.length
      const next = picked.slice(0, room).map((file) => ({
        id: `${file.name}-${file.size}-${Math.random().toString(36).slice(2, 8)}`,
        url: URL.createObjectURL(file),
        name: file.name,
        type: file.type,
        size: file.size,
      }))
      return [...cur, ...next]
    })
    // Reset so re-picking the same file still fires onChange.
    if (fileRef.current) fileRef.current.value = ''
  }

  const handleRemove = (id) =>
    setVisuals((cur) => {
      const v = cur.find((x) => x.id === id)
      if (v) URL.revokeObjectURL(v.url)
      return cur.filter((x) => x.id !== id)
    })

  const proceed = () =>
    onContinue({
      refs: refs.trim(),
      visuals: visuals.map((v) => ({ name: v.name, type: v.type, size: v.size })),
    })

  const filled = hasInspiration({ refs, visuals })

  return (
    <section className="flex flex-1 flex-col gap-7">
      <div className="space-y-2">
        <h1 className="text-2xl font-bold tracking-tight text-ink">
          Add inspiration
        </h1>
        <p className="text-pretty leading-relaxed text-muted">
          Optional. Show Echo a few posts or visuals you love and it&apos;ll
          borrow the vibe — never copy it.
        </p>
      </div>

      {/* Reference posts you love. */}
      <div className="space-y-2.5">
        <label htmlFor="refs" className="text-sm font-semibold text-ink">
          Posts you love <span className="font-normal text-muted">· optional</span>
        </label>
        <textarea
          id="refs"
          value={refs}
          onChange={(e) => setRefs(e.target.value)}
          rows={4}
          placeholder={'Paste a post, caption, or thread whose style you want Echo to echo.'}
          className="w-full resize-none rounded-2xl border border-border bg-surface px-4 py-3 text-base leading-relaxed text-ink shadow-card placeholder:text-muted/70 focus:border-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
        />
      </div>

      {/* Reference visuals — an image grid à la Looply's picker. */}
      <div className="space-y-2.5">
        <p className="text-sm font-semibold text-ink">
          Visuals you love <span className="font-normal text-muted">· optional</span>
        </p>
        <input
          id={VISUAL_INPUT_ID}
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          onChange={handleAdd}
          className="sr-only"
        />
        <div className="grid grid-cols-3 gap-3">
          {visuals.map((v) => (
            <div
              key={v.id}
              className="relative aspect-square overflow-hidden rounded-2xl border border-border bg-surface shadow-card"
            >
              <img src={v.url} alt={v.name} className="h-full w-full object-cover" />
              <button
                type="button"
                onClick={() => handleRemove(v.id)}
                aria-label={`Remove ${v.name}`}
                className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-black/55 text-white transition hover:bg-black/75 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
              >
                <XIcon />
              </button>
            </div>
          ))}
          {visuals.length < MAX_VISUALS && (
            <label
              htmlFor={VISUAL_INPUT_ID}
              className="flex aspect-square cursor-pointer flex-col items-center justify-center gap-1.5 rounded-2xl border border-dashed border-border bg-surface text-muted shadow-card transition duration-150 hover:border-accent/50 hover:text-accent active:scale-[0.99]"
            >
              <PlusIcon />
              <span className="text-xs font-medium">Add</span>
            </label>
          )}
        </div>
        <p className="text-xs text-muted">
          Up to {MAX_VISUALS}. Used only as a style reference.
        </p>
      </div>

      <div className="mt-auto space-y-3 pt-2">
        <Button onClick={proceed}>{filled ? 'Continue' : 'Skip for now'}</Button>
        <Button variant="ghost" onClick={onBack}>
          Back
        </Button>
      </div>
    </section>
  )
}

function PlusIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-6 w-6"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 5v14M5 12h14" />
    </svg>
  )
}

function XIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-3.5 w-3.5"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  )
}
