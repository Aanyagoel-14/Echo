import { useEffect, useState } from 'react'
import EchoPulse from '../components/EchoPulse'
import { generateKit, generateCarouselImage } from '../lib/api'

/*
 * Branded synthesis loader (§5 + §7). The Echo "ripple" mark plus rotating
 * status lines play while we POST the request to /api/generate, which runs the
 * real voice-injected vision+text model server-side. On resolve we hand the kit
 * to onDone; on reject we route to onError (the error screen). A minimum visible
 * time keeps the branded loader from flashing on a fast response.
 *
 * Load the app with ?fail to preview the error path.
 */
const STAGES = [
  'Reading your photo & brief…',
  'Matching your voice…',
  'Drafting your kit…',
  'Polishing every line…',
]

// A carousel is 5 slides; illustrate at most this many. Each slide is an
// independent best-effort image call, so one failure never sinks the others.
const MAX_CAROUSEL_IMAGES = 5

export default function Loading({ request, onDone, onError, minVisible = 1800 }) {
  const [stage, setStage] = useState(0)
  // Flips once the text kit is in and we're generating carousel visuals — image
  // gen runs longer than the text, so the loader says what's actually happening.
  const [generatingVisuals, setGeneratingVisuals] = useState(false)

  // POST the request, then settle to Results (or the error screen). This is the
  // real resolve/reject path already — the event only swaps the mock the server
  // returns. setState here lives in async callbacks, never the effect body.
  useEffect(() => {
    let active = true
    const startedAt = Date.now()
    const forceFail = new URLSearchParams(window.location.search).has('fail')

    async function run() {
      let generated = null
      let failed = false
      try {
        if (forceFail) throw new Error('forced failure (?fail)')
        generated = await generateKit(request)
      } catch {
        failed = true
      }

      // Best-effort carousel visuals: once the text kit is in, illustrate each
      // slide with the best image model OpenRouter offers on this key. Failures
      // (or no key) degrade silently to text-only slides — they never turn a
      // good kit into the error screen.
      if (!failed && generated?.carousel?.slides?.length) {
        if (active) setGeneratingVisuals(true)
        try {
          generated = {
            ...generated,
            carousel: await withSlideImages(
              generated.carousel,
              request,
              generated.imageModel,
            ),
          }
        } catch {
          // Keep the text carousel exactly as it came back.
        }
      }

      // Hold so the branded loader is actually seen, even on an instant mock.
      const elapsed = Date.now() - startedAt
      if (elapsed < minVisible) await delay(minVisible - elapsed)
      if (!active) return
      if (failed) onError()
      else onDone(generated)
    }

    run()
    return () => {
      active = false
    }
  }, [request, onDone, onError, minVisible])

  // Step the status line through the stages across the minimum wait.
  useEffect(() => {
    const id = setInterval(() => {
      setStage((s) => (s < STAGES.length - 1 ? s + 1 : s))
    }, minVisible / STAGES.length)
    return () => clearInterval(id)
  }, [minVisible])

  return (
    <section className="flex flex-1 flex-col items-center justify-center gap-8 text-center">
      <EchoPulse />
      <div className="space-y-2">
        <h1 className="text-xl font-semibold text-ink">Composing your kit…</h1>
        <p className="min-h-5 text-sm text-muted" aria-live="polite">
          <span
            key={generatingVisuals ? 'visuals' : stage}
            className="inline-block animate-fade-in"
          >
            {generatingVisuals ? 'Designing your carousel visuals…' : STAGES[stage]}
          </span>
        </p>
      </div>
    </section>
  )
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/*
 * Illustrate carousel slides in parallel, best-effort. Each slide gets its own
 * image call (one image per response keeps us under the serverless payload
 * limit), and the product photo — if any — conditions every slide so the set
 * stays on-brand. allSettled means a slow or failed slide just stays text-only.
 */
async function withSlideImages(carousel, request, model) {
  const brief = request?.input || ''
  const productImage = request?.image?.dataUrl || null
  const targets = carousel.slides.slice(0, MAX_CAROUSEL_IMAGES)

  const results = await Promise.allSettled(
    targets.map((slide) =>
      generateCarouselImage({
        title: slide.title,
        body: slide.body,
        brief,
        image: productImage,
        model,
      }),
    ),
  )

  const slides = carousel.slides.map((slide, i) => {
    const r = results[i]
    return r && r.status === 'fulfilled' && r.value?.image
      ? { ...slide, image: r.value.image }
      : slide
  })
  return { ...carousel, slides }
}
