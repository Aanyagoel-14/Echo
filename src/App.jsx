import { useCallback, useEffect, useState } from 'react'
import StepIndicator from './components/StepIndicator'
import ThemeToggle from './components/ThemeToggle'
import { useTheme } from './lib/theme'
import { EMPTY_INSPIRATION } from './lib/inspiration'
import VoiceProfileSetup from './screens/VoiceProfileSetup'
import Inspiration from './screens/Inspiration'
import Audit from './screens/Audit'
import Capture from './screens/Capture'
import Loading from './screens/Loading'
import Results from './screens/Results'
import GenerationError from './screens/GenerationError'
import { hasVoiceProfile } from './lib/voiceProfile'
import { summarizeAuditForGeneration } from './lib/audit'
import { loadGenre, resolveNiche } from './lib/genre'

/*
 * App shell + state-based navigation (no router — §5). App also owns the
 * synthesis request + the generated kit: Capture builds the request, Loading
 * POSTs it to /api/generate (CP7), and the resulting kit flows to Results.
 *
 * Flow (§0.1 + Audit): first run (no voice.md) → Voice Profile builder →
 * Inspiration (optional) → Audit (the always-on payoff) → (Create) → Capture →
 * Loading → Results. Returning creators (voice.md found) skip setup and land on
 * the Audit. Audit Mode ends at the audit; Creation Mode continues into Capture.
 * Loading branches to the error screen when synthesis fails (§7).
 */
const STEP_FOR_SCREEN = {
  voice: 0,
  inspiration: 1,
  audit: 2,
  capture: 3,
  loading: 3,
  error: 3,
  results: 4,
}

function EchoMark() {
  return (
    <svg viewBox="0 0 512 512" className="h-6 w-6 text-accent" aria-hidden="true">
      <g fill="none" stroke="currentColor">
        <circle cx="256" cy="256" r="150" strokeWidth="14" opacity="0.26" />
        <circle cx="256" cy="256" r="104" strokeWidth="16" opacity="0.55" />
        <circle cx="256" cy="256" r="58" strokeWidth="18" />
      </g>
      <circle cx="256" cy="256" r="22" fill="currentColor" />
    </svg>
  )
}

export default function App() {
  // Boot gate (§0.1 + Audit): returning creators (a stored voice.md) skip setup
  // and land on the always-on Audit; first-run users start in the Voice Profile
  // builder, then flow through Inspiration into the Audit.
  const [screen, setScreen] = useState(() =>
    hasVoiceProfile() ? 'audit' : 'voice',
  )
  const [request, setRequest] = useState(null)
  const [kit, setKit] = useState(null)
  // The Page 3 critique, lifted from the Audit screen once it resolves, so the
  // Creation Mode generate (Page 4 → Page 5) can continue the same strategy —
  // the audit and the new post read as one story (§F4). Null until/unless the
  // audit succeeds, so generation falls back to its plain behaviour otherwise.
  const [auditResult, setAuditResult] = useState(null)
  // Optional reference material gathered on the Inspiration screen; merged into
  // the request at generate time so it can shape synthesis (wired server-side).
  const [inspiration, setInspiration] = useState(EMPTY_INSPIRATION)
  // The Page 2 Genre Selector pick (or null = auto-detect). Initialized from
  // storage so a returning creator who boots straight to the Audit — skipping
  // Page 2 — still has their niche applied; null lets the server infer it.
  const [niche, setNiche] = useState(() => resolveNiche(loadGenre()))
  const { theme, toggle } = useTheme()
  const go = useCallback((next) => setScreen(next), [])

  // Inspiration → Audit: keep what the creator added (or skipped) — the
  // reference material and the genre pick — then run the always-on audit, the
  // first payoff, before any optional Creation Mode.
  const handleInspiration = useCallback((collected, pickedNiche) => {
    setInspiration(collected)
    setNiche(pickedNiche)
    setScreen('audit')
  }, [])

  // Capture → Loading: stash the { input, image, brandVoice } request — plus any
  // inspiration and the distilled audit direction — and start synthesis. The
  // audit is summarized to a compact { pivot, niche, hashtags } here so the kit
  // continues the audit's strategy without bloating the payload.
  const handleGenerate = useCallback(
    (req) => {
      setRequest({
        ...req,
        inspiration,
        audit: summarizeAuditForGeneration(auditResult),
      })
      setScreen('loading')
    },
    [inspiration, auditResult],
  )

  // Loading → Results: keep the kit the endpoint returned and show it.
  const handleDone = useCallback((generatedKit) => {
    setKit(generatedKit)
    setScreen('results')
  }, [])

  const handleError = useCallback(() => setScreen('error'), [])

  // Reset scroll on every navigation so a new screen never inherits the last
  // one's scroll position (e.g. after a long thread on Results).
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [screen])

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-6 pt-[max(1.5rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))]">
      <header className="flex items-center justify-between pb-8">
        <div className="flex items-center gap-2">
          <EchoMark />
          <span className="text-sm font-semibold tracking-tight text-ink">
            Echo
          </span>
        </div>
        <div className="flex items-center gap-3">
          <StepIndicator active={STEP_FOR_SCREEN[screen]} />
          <ThemeToggle theme={theme} onToggle={toggle} />
        </div>
      </header>

      {/* key={screen} remounts the body on each nav, replaying the entrance. */}
      <div key={screen} className="flex flex-1 flex-col animate-rise">
        {screen === 'voice' && (
          <VoiceProfileSetup
            onDone={() => go('inspiration')}
            onCancel={() => go('inspiration')}
          />
        )}
        {screen === 'inspiration' && (
          <Inspiration onContinue={handleInspiration} onBack={() => go('voice')} />
        )}
        {screen === 'audit' && (
          <Audit
            inspiration={inspiration}
            niche={niche}
            onAuditReady={setAuditResult}
            onCreate={() => go('capture')}
            onBack={() => go('inspiration')}
            onChangeVoice={() => go('voice')}
          />
        )}
        {screen === 'capture' && (
          <Capture
            onGenerate={handleGenerate}
            onBack={() => go('audit')}
            onChangeVoice={() => go('voice')}
          />
        )}
        {screen === 'loading' && (
          <Loading request={request} onDone={handleDone} onError={handleError} />
        )}
        {screen === 'results' && (
          <Results
            kit={kit}
            brandVoice={request?.brandVoice}
            audit={request?.audit}
            onNew={() => go('capture')}
            onChangeVoice={() => go('voice')}
          />
        )}
        {screen === 'error' && (
          <GenerationError
            onRetry={() => go('loading')}
            onStartOver={() => go('capture')}
          />
        )}
      </div>
    </div>
  )
}
