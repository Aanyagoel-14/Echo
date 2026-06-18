import { useEffect, useState } from 'react'
import EchoPulse from '../components/EchoPulse'
import { generateKit } from '../lib/api'

/*
 * Branded synthesis loader (§5 + §7, CP7). The Echo "ripple" mark plus rotating
 * status lines play while we POST the request to /api/generate. On resolve we
 * hand the kit to onDone; on reject we route to onError (the error screen). A
 * minimum visible time keeps the branded loader from flashing when the (mock)
 * endpoint answers near-instantly.
 *
 * The endpoint still returns mock JSON — the real vision+text model is wired in
 * server-side at the event. Load the app with ?fail to preview the error path.
 */
const STAGES = [
  'Reading your input…',
  'Matching your brand voice…',
  'Drafting Reel, carousel & thread…',
  'Polishing every line…',
]

export default function Loading({ request, onDone, onError, minVisible = 1800 }) {
  const [stage, setStage] = useState(0)

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
          <span key={stage} className="inline-block animate-fade-in">
            {STAGES[stage]}
          </span>
        </p>
      </div>
    </section>
  )
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
