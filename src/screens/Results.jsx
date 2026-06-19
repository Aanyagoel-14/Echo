import { useRef, useState } from 'react'
import Button from '../components/Button'
import ScreenScaffold from '../components/ScreenScaffold'
import VoiceTag from '../components/VoiceTag'
import { toneLabel } from '../lib/brandVoice'

const ORDER = ['reel', 'carousel', 'thread']

/*
 * Results (§5 + §6). The kit arrives as one JSON object from POST /api/generate
 * (fetched in Loading, passed down via App). The creator picked their formats in
 * Capture, so there's no tab-hunting — we stack whichever formats came back, each
 * rendered the way its platform actually looks: Reel as a script block + a real
 * call-sheet (§8.9), Carousel as swipeable IG slides + caption (§9.7) with any
 * generated visuals, Thread as stacked X cards with char counts (§10.8). Copy-to-
 * clipboard everywhere; a tone chip per format shows the voice it's written in.
 */
export default function Results({ onNew, onChangeVoice, kit, brandVoice, audit }) {
  const present = kit ? ORDER.filter((f) => kit[f]) : []

  // Defensive empty state (§7): a partial/empty response shows this instead of
  // a broken screen.
  if (!present.length) {
    return <ResultsEmpty onNew={onNew} />
  }

  // The voice the kit is written in (§7.2): the picked tone, or Professional as
  // the default when only samples were given. Drives the tone chip on each tab.
  const effectiveTone =
    brandVoice?.tone || (brandVoice?.samples?.trim?.() ? 'professional' : null)

  return (
    <section className="flex flex-1 flex-col gap-6">
      <div className="space-y-3">
        <div className="space-y-1">
          <h1 className="text-xl font-bold tracking-tight text-ink">
            Your kit is ready
          </h1>
          <p className="text-sm text-muted">
            {present.length === 1
              ? 'Platform-ready, in your voice.'
              : `${present.length} platform-ready posts, in your voice.`}
          </p>
        </div>
        <VoiceTag onChange={onChangeVoice} />
      </div>

      {audit?.pivot && <StrategyFromAudit pivot={audit.pivot} niche={audit.niche} />}

      <div className="flex flex-col gap-8">
        {kit.reel && <ReelView reel={kit.reel} tone={effectiveTone} />}
        {kit.carousel && <CarouselView carousel={kit.carousel} tone={effectiveTone} />}
        {kit.thread && <ThreadView thread={kit.thread} tone={effectiveTone} />}
      </div>

      <Button variant="secondary" onClick={onNew}>
        Start a new kit
      </Button>
    </section>
  )
}

/* ---------- The audit through-line (§F4 · Page 3 → Page 5) ---------- */

// When this kit was generated off the back of an audit, name the strategic
// direction it followed — so the critique and the new post read as one story,
// not two disconnected screens. Hidden entirely when there was no prior audit.
function StrategyFromAudit({ pivot, niche }) {
  return (
    <div className="rounded-2xl border border-accent/30 bg-accent/10 px-4 py-3">
      <div className="flex items-center gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-accent">
          Continuing your audit
        </p>
        {niche && (
          <span className="rounded-full border border-accent/30 bg-accent/5 px-2 py-0.5 text-[10px] font-medium text-accent">
            {niche}
          </span>
        )}
      </div>
      <p className="mt-1.5 text-sm leading-relaxed text-ink/90">{pivot}</p>
    </div>
  )
}

/* ---------- Reel: hook + script + real call sheet (§8.9) ---------- */

function ReelView({ reel, tone }) {
  const shotList = reel.shotList ?? []
  const duration = estimateDuration(shotList)
  const copyAll = [
    `Hook: ${reel.hook}`,
    '',
    'Script:',
    reel.script,
    '',
    'Shot list:',
    formatShotList(shotList),
  ].join('\n')

  return (
    <div className="space-y-4">
      <SectionBar
        tone={tone}
        extra={<DurationChip seconds={duration} />}
        copyText={copyAll}
        copyLabel="all"
      >
        Reel · script + shots
      </SectionBar>

      <div className="rounded-2xl border border-border bg-surface shadow-card p-4">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-accent">
          Hook
        </p>
        <p className="mt-1.5 text-lg font-semibold leading-snug text-ink text-balance">
          {reel.hook}
        </p>
      </div>

      <div className="rounded-2xl border border-border bg-surface shadow-card p-4">
        <div className="flex items-center justify-between gap-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">
            Script
          </p>
          <CopyButton compact text={reel.script} label="script" />
        </div>
        <p className="mt-1.5 leading-relaxed text-ink/90">{reel.script}</p>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between gap-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">
            Shot list <span className="text-muted/60">· call sheet</span>
          </p>
          <CopyButton compact text={formatShotList(shotList)} label="shot list" />
        </div>
        <ol className="space-y-2">
          {shotList.map((raw, i) => {
            // Defensive (§8.10): a structured shot renders as a call-sheet row;
            // a bare string (model fallback) drops into the shot line intact.
            const s = typeof raw === 'string' ? { shot: raw } : (raw ?? {})
            return (
              <li
                key={i}
                className="rounded-2xl border border-border bg-surface shadow-card p-3.5"
              >
                <div className="flex items-center gap-2.5">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent/15 text-xs font-semibold text-accent">
                    {i + 1}
                  </span>
                  {s.time && (
                    <span className="font-mono text-[11px] text-muted">
                      {s.time}
                    </span>
                  )}
                </div>
                {s.shot && (
                  <p className="mt-2 text-sm font-medium leading-snug text-ink">
                    {s.shot}
                  </p>
                )}
                {s.inFrame && (
                  <p className="mt-1 text-xs text-muted">In frame · {s.inFrame}</p>
                )}
                {s.onScreenText && (
                  <div className="mt-2 rounded-xl border border-border bg-bg px-2.5 py-1.5">
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-muted/70">
                      On-screen text
                    </span>
                    <p className="mt-0.5 text-xs leading-snug text-ink/90">
                      {s.onScreenText}
                    </p>
                  </div>
                )}
              </li>
            )
          })}
        </ol>
      </div>
    </div>
  )
}

/* ---------- Carousel: swipeable IG slides + caption (§9.7) ---------- */

function CarouselView({ carousel, tone }) {
  const { slides, caption, hashtags } = carousel
  const total = slides.length
  const scrollerRef = useRef(null)
  const [active, setActive] = useState(0)

  // Track the centered slide so the progress dots reflect where the swipe is.
  const handleScroll = () => {
    const el = scrollerRef.current
    if (!el || total === 0) return
    const i = Math.round(el.scrollLeft / (el.scrollWidth / total))
    setActive(Math.max(0, Math.min(total - 1, i)))
  }

  const slidesText = slides
    .map((s, i) => `Slide ${i + 1} — ${s.title}\n${s.body}`)
    .join('\n\n')
  const copyText = [
    slidesText,
    caption && `Caption:\n${caption}`,
    hashtags?.length && hashtags.join(' '),
  ]
    .filter(Boolean)
    .join('\n\n')

  return (
    <div className="space-y-3">
      <SectionBar tone={tone} copyText={copyText} copyLabel="carousel">
        Instagram · {total} slides
      </SectionBar>

      <div
        ref={scrollerRef}
        onScroll={handleScroll}
        className="-mx-6 flex snap-x snap-mandatory gap-3 overflow-x-auto px-6 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {slides.map((slide, i) => {
          // Slides may carry a generated image (added best-effort after the text
          // kit); when present it's a full-bleed background with a scrim so the
          // overlaid copy stays legible, otherwise the clean surface card.
          const hasImage = Boolean(slide.image)
          return (
            <article
              key={i}
              className={[
                'relative flex aspect-[4/5] shrink-0 basis-[80%] snap-center flex-col justify-between overflow-hidden rounded-3xl border p-5',
                hasImage ? 'border-white/10' : 'border-border bg-surface shadow-card',
              ].join(' ')}
            >
              {hasImage && (
                <>
                  <img
                    src={slide.image}
                    alt=""
                    aria-hidden="true"
                    className="absolute inset-0 h-full w-full object-cover"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/45 to-black/10" />
                </>
              )}
              <div className="relative flex items-start justify-between gap-2">
                <span
                  className={[
                    'text-xs font-semibold tracking-wide',
                    hasImage ? 'text-white/80' : 'text-muted',
                  ].join(' ')}
                >
                  {String(i + 1).padStart(2, '0')}
                  <span className={hasImage ? 'text-white/40' : 'text-muted/50'}>
                    {' '}
                    / {String(total).padStart(2, '0')}
                  </span>
                </span>
                <CopyButton
                  compact
                  text={`${slide.title}\n${slide.body}`}
                  label={`slide ${i + 1}`}
                />
              </div>
              <div className="relative space-y-2">
                <h3
                  className={[
                    'text-2xl font-bold leading-tight tracking-tight text-balance',
                    hasImage ? 'text-white' : 'text-ink',
                  ].join(' ')}
                >
                  {slide.title}
                </h3>
                <p
                  className={[
                    'text-sm leading-relaxed',
                    hasImage ? 'text-white/85' : 'text-muted',
                  ].join(' ')}
                >
                  {slide.body}
                </p>
              </div>
              <span
                className={[
                  'relative text-[11px] font-semibold uppercase tracking-widest',
                  hasImage ? 'text-white/70' : 'text-muted/60',
                ].join(' ')}
              >
                echo
              </span>
            </article>
          )
        })}
      </div>

      <div
        className="flex items-center justify-center gap-1.5"
        aria-hidden="true"
      >
        {slides.map((_, i) => (
          <span
            key={i}
            className={[
              'h-1.5 rounded-full transition-all duration-200',
              i === active ? 'w-4 bg-accent' : 'w-1.5 bg-border',
            ].join(' ')}
          />
        ))}
      </div>

      {(caption || hashtags?.length > 0) && (
        <div className="space-y-3 rounded-2xl border border-border bg-surface shadow-card p-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">
              Caption
            </p>
            <CopyButton
              compact
              text={[caption, hashtags?.join(' ')].filter(Boolean).join('\n\n')}
              label="caption"
            />
          </div>
          {caption && (
            <p className="text-sm leading-relaxed text-ink/90">{caption}</p>
          )}
          {hashtags?.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {hashtags.map((tag, i) => (
                <span
                  key={i}
                  className="rounded-full border border-accent/25 bg-accent/10 px-2.5 py-1 text-xs font-medium text-accent"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}
          <p className="text-[11px] text-muted/70">
            3–5 hashtags · tuned for Instagram
          </p>
        </div>
      )}
    </div>
  )
}

/* ---------- Thread: stacked tweet cards + char counts (§10.8) ---------- */

function ThreadView({ thread, tone }) {
  const { tweets } = thread
  // The thread carries its own tone (§6); fall back to the kit's voice.
  const threadTone = thread.tone || tone
  const copyText = tweets.join('\n\n')

  return (
    <div className="space-y-3">
      <SectionBar tone={threadTone} copyText={copyText} copyLabel="thread">
        X · {tweets.length} posts
      </SectionBar>

      <ol className="rounded-2xl border border-border bg-surface shadow-card px-4 py-4">
        {tweets.map((tweet, i) => {
          const last = i === tweets.length - 1
          return (
            <li key={i} className="flex gap-3">
              <div className="flex flex-col items-center">
                <Avatar />
                {!last && <span className="mt-1 w-px flex-1 bg-border" />}
              </div>
              <div
                className={['min-w-0 flex-1', last ? 'pb-0' : 'pb-5'].join(' ')}
              >
                <div className="flex items-center gap-2">
                  <div className="flex min-w-0 items-center gap-1 text-sm leading-none">
                    <span className="font-semibold text-ink">You</span>
                    <span className="truncate text-muted">@you · now</span>
                  </div>
                  <div className="ml-auto flex shrink-0 items-center gap-2">
                    <CharCount text={tweet} />
                    <CopyButton compact text={tweet} label={`post ${i + 1}`} />
                  </div>
                </div>
                <p className="mt-1.5 whitespace-pre-wrap text-[15px] leading-relaxed text-ink">
                  {tweet}
                </p>
              </div>
            </li>
          )
        })}
      </ol>
    </div>
  )
}

/* ---------- shared bits ---------- */

// Eyebrow label + tone chip on the left; an optional extra (e.g. the reel's
// duration) and the format's copy-all button on the right.
function SectionBar({ children, tone, extra, copyText, copyLabel }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-2">
        <p className="truncate text-xs font-medium uppercase tracking-wide text-muted">
          {children}
        </p>
        <ToneChip tone={tone} />
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {extra}
        <CopyButton text={copyText} label={copyLabel} />
      </div>
    </div>
  )
}

// Shows the voice a format is written in (§8.9/§9.7/§10.8). Hidden when unknown.
function ToneChip({ tone }) {
  const label = toneLabel(tone)
  if (!label) return null
  return (
    <span className="shrink-0 rounded-full border border-accent/30 bg-accent/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent">
      {label}
    </span>
  )
}

// Estimated Reel runtime from the last shot's end timestamp (§8.9).
function DurationChip({ seconds }) {
  if (!seconds) return null
  return (
    <span className="rounded-full border border-border bg-bg px-2 py-0.5 text-[11px] font-medium text-muted">
      ~{seconds}s
    </span>
  )
}

// Per-tweet character count (§10.8). Amber as it nears the 280 limit, red over.
function CharCount({ text }) {
  const n = [...(text ?? '')].length
  const over = n > 280
  const near = !over && n >= 260
  return (
    <span
      className={[
        'font-mono text-[11px] tabular-nums',
        over ? 'text-red-500' : near ? 'text-amber-500' : 'text-muted/70',
      ].join(' ')}
      title={over ? 'Over the 280-character limit' : undefined}
    >
      {n}/280
    </span>
  )
}

function CopyButton({ text, label = 'Copy', compact = false }) {
  const [state, setState] = useState('idle') // 'idle' | 'copied' | 'error'

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setState('copied')
    } catch {
      // Clipboard blocked (insecure context / denied) — surface it instead of
      // failing silently, so the creator knows to select the text by hand.
      setState('error')
    }
    // Revert after a beat. React 18+ no-ops a setState on an unmounted component
    // (tab switch), so no cleanup needed.
    setTimeout(() => setState('idle'), 1800)
  }

  const copied = state === 'copied'
  const failed = state === 'error'
  const icon = copied ? <CheckIcon /> : failed ? <WarnIcon /> : <CopyIcon />
  const ariaLabel = copied ? 'Copied' : failed ? 'Copy failed' : `Copy ${label}`

  // Compact: icon-only round button for per-item copy (slides, tweets, sections).
  if (compact) {
    return (
      <button
        type="button"
        onClick={handleCopy}
        aria-label={ariaLabel}
        className={[
          'inline-flex shrink-0 items-center justify-center rounded-full border p-1.5',
          'transition duration-150 active:scale-[0.94]',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/50',
          copied
            ? 'border-accent/50 bg-accent/10 text-accent'
            : 'border-border bg-surface text-muted hover:border-accent/40 hover:text-ink',
        ].join(' ')}
      >
        {icon}
      </button>
    )
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      aria-label={ariaLabel}
      className={[
        'inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5',
        'text-xs font-medium transition duration-150 active:scale-[0.97]',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/50',
        copied
          ? 'border-accent/50 bg-accent/10 text-accent'
          : failed
            ? 'border-border bg-surface text-ink'
            : 'border-border bg-surface text-muted hover:border-accent/40 hover:text-ink',
      ].join(' ')}
    >
      {icon}
      {copied ? 'Copied' : failed ? 'Copy failed' : 'Copy'}
    </button>
  )
}

function Avatar() {
  return (
    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent/15 ring-1 ring-accent/30">
      <svg viewBox="0 0 24 24" className="h-4 w-4 text-accent" aria-hidden="true">
        <g fill="none" stroke="currentColor">
          <circle cx="12" cy="12" r="7" strokeWidth="1.4" opacity="0.4" />
          <circle cx="12" cy="12" r="3.4" strokeWidth="1.7" />
        </g>
        <circle cx="12" cy="12" r="1.4" fill="currentColor" />
      </svg>
    </span>
  )
}

function CopyIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-3.5 w-3.5"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M5 15V5a2 2 0 0 1 2-2h10" />
    </svg>
  )
}

function CheckIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-3.5 w-3.5"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  )
}

function WarnIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-3.5 w-3.5"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
    </svg>
  )
}

// Estimated Reel runtime in seconds, from the last parseable end timestamp.
function estimateDuration(shotList) {
  let max = 0
  for (const raw of shotList) {
    const time = typeof raw === 'string' ? raw : raw?.time
    if (!time) continue
    const stamps = String(time).match(/\d+:\d{2}/g)
    if (!stamps?.length) continue
    const [m, s] = stamps[stamps.length - 1].split(':').map(Number)
    const secs = m * 60 + s
    if (secs > max) max = secs
  }
  return max
}

// Flatten the shot list into copyable lines, structured or string-fallback.
function formatShotList(shotList) {
  return shotList
    .map((raw, i) => {
      if (typeof raw === 'string') return `${i + 1}. ${raw}`
      const parts = [
        raw.time,
        raw.shot,
        raw.inFrame,
        raw.onScreenText && `text: "${raw.onScreenText}"`,
      ].filter(Boolean)
      return `${i + 1}. ${parts.join(' · ')}`
    })
    .join('\n')
}

// Defensive fallback (§7, CP6): shown when no renderable kit arrives. The mock
// always provides one, so this is for CP7's real responses.
function ResultsEmpty({ onNew }) {
  return (
    <ScreenScaffold
      icon={
        <svg
          viewBox="0 0 24 24"
          className="h-7 w-7"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <rect x="3" y="3" width="18" height="18" rx="3" />
          <path d="M3 9h18M9 21V9" />
        </svg>
      }
      title="Nothing to show yet"
      subtitle="Your kit didn't come through. Start a new one and Echo will rebuild your Reel, carousel, and thread."
    >
      <Button onClick={onNew}>Start a new kit</Button>
    </ScreenScaffold>
  )
}
