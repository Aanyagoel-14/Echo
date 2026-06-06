import { useCallback, useEffect, useState } from 'react'
import StepIndicator from './components/StepIndicator'
import BrandVoiceSetup from './screens/BrandVoiceSetup'
import Capture from './screens/Capture'
import Loading from './screens/Loading'
import Results from './screens/Results'
import GenerationError from './screens/GenerationError'

/*
 * App shell + state-based navigation (no router — §5). App also owns the
 * synthesis request + the generated kit: Capture builds the request, Loading
 * POSTs it to /api/generate (CP7), and the resulting kit flows to Results.
 * Flow: Brand voice → Capture → Loading → Results → (New) → Capture.
 * Loading branches to the error screen when synthesis fails (§7).
 */
const STEP_FOR_SCREEN = { voice: 0, capture: 1, loading: 1, error: 1, results: 2 }

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
  const [screen, setScreen] = useState('voice')
  const [request, setRequest] = useState(null)
  const [kit, setKit] = useState(null)
  const go = useCallback((next) => setScreen(next), [])

  // Capture → Loading: stash the { input, image, brandVoice } request and start.
  const handleGenerate = useCallback((req) => {
    setRequest(req)
    setScreen('loading')
  }, [])

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
        <StepIndicator active={STEP_FOR_SCREEN[screen]} />
      </header>

      {/* key={screen} remounts the body on each nav, replaying the entrance. */}
      <div key={screen} className="flex flex-1 flex-col animate-rise">
        {screen === 'voice' && (
          <BrandVoiceSetup onContinue={() => go('capture')} />
        )}
        {screen === 'capture' && (
          <Capture onGenerate={handleGenerate} onBack={() => go('voice')} />
        )}
        {screen === 'loading' && (
          <Loading request={request} onDone={handleDone} onError={handleError} />
        )}
        {screen === 'results' && <Results kit={kit} onNew={() => go('capture')} />}
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
