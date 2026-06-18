import { useEffect, useState } from 'react'
import Button from '../components/Button'
import EchoPulse from '../components/EchoPulse'
import ScreenScaffold from '../components/ScreenScaffold'
import VoiceTag from '../components/VoiceTag'
import { requestAudit } from '../lib/api'
import { loadBrandVoice, samplesToArray } from '../lib/brandVoice'

/*
 * Audit — Page 3, the Output Engine (Feature 5 wiring for Feature 3). The
 * always-on payoff: the moment the creator lands here Echo reads their posts
 * (the Page 1 voice samples) and inspiration, pulls today's cached trends
 * server-side, and renders the Suggestion Model's structured critique —
 * What's Working · What's Missing · Hashtag Audit · Strategic Pivot.
 *
 * Self-contained, like a page that loads its own data: it reads the brand voice
 * from storage and POSTs to /api/audit via requestAudit() (the single client
 * seam) on mount, so it can be loaded in isolation (F5's standalone test) — App
 * only routes here and hands down the optional inspiration. The niche is left to
 * the server to infer from the posts, so the audit still works when Page 2 was
 * skipped. This is the natural end of Audit Mode; "Create a new post" carries
 * the creator on into Creation Mode (Page 4).
 *
 * The endpoint returns the templated mock critique until the real model is wired
 * in server-side (api/audit.js) — these renderers don't change when it lands.
 */
const STAGES = [
  'Reading your posts…',
  'Measuring against today’s trends…',
  'Writing your audit…',
]

// The four critique blocks, in spec order, each with its own glyph.
const SECTIONS = [
  { key: 'whatsWorking', label: "What's Working", Icon: SparkIcon },
  { key: 'whatsMissing', label: "What's Missing", Icon: TrendIcon },
  { key: 'hashtagAudit', label: 'Hashtag Audit', Icon: HashIcon },
  { key: 'strategicPivot', label: 'Strategic Pivot', Icon: CompassIcon },
]

export default function Audit({
  inspiration,
  onCreate,
  onBack,
  onChangeVoice,
  minVisible = 1100,
}) {
  const [status, setStatus] = useState('loading') // 'loading' | 'ready' | 'error'
  const [audit, setAudit] = useState(null)
  const [stage, setStage] = useState(0)
  const [nonce, setNonce] = useState(0) // bump to re-run (Try again)

  // Fetch the critique on mount (and on retry). setState lives in the async
  // callback, never the effect body; the `active` flag makes it safe under
  // StrictMode's double-invoke and against an unmount mid-flight. A minimum
  // visible time keeps the branded loader from flashing on the instant mock.
  useEffect(() => {
    let active = true
    const startedAt = Date.now()

    async function run() {
      const voice = loadBrandVoice()
      // The historical posts the audit analyzes are the creator's own samples
      // (imported or pasted on Page 1), split into discrete posts. niche: null
      // lets the server infer the niche from the posts when Page 2 was skipped.
      const posts = samplesToArray(voice.samples)

      let result = null
      let failed = false
      try {
        result = await requestAudit({ brandVoice: voice, posts, niche: null, inspiration })
      } catch {
        failed = true
      }

      const elapsed = Date.now() - startedAt
      if (elapsed < minVisible) await delay(minVisible - elapsed)
      if (!active) return
      if (failed) {
        setStatus('error')
      } else {
        setAudit(result)
        setStatus('ready')
      }
    }

    run()
    return () => {
      active = false
    }
  }, [nonce, inspiration, minVisible])

  // Step the status line through the stages while the audit is in flight.
  useEffect(() => {
    if (status !== 'loading') return undefined
    const id = setInterval(() => {
      setStage((s) => (s < STAGES.length - 1 ? s + 1 : s))
    }, minVisible / STAGES.length)
    return () => clearInterval(id)
  }, [status, minVisible])

  // Re-run the audit (the error screen's "Try again"). Resetting state lives in
  // this event handler, not the effect, so the loader shows immediately and the
  // fetch effect re-fires on the bumped nonce.
  const retry = () => {
    setStage(0)
    setStatus('loading')
    setNonce((n) => n + 1)
  }

  if (status === 'loading') {
    return (
      <section className="flex flex-1 flex-col items-center justify-center gap-8 text-center">
        <EchoPulse />
        <div className="space-y-2">
          <h1 className="text-xl font-semibold text-ink">Auditing your content…</h1>
          <p className="min-h-5 text-sm text-muted" aria-live="polite">
            <span key={stage} className="inline-block animate-fade-in">
              {STAGES[stage]}
            </span>
          </p>
        </div>
      </section>
    )
  }

  if (status === 'error') {
    return (
      <ScreenScaffold
        icon={<WarnIcon />}
        title="Audit didn’t come through"
        subtitle="Echo couldn’t reach the trends engine just now. Give it another go."
      >
        <Button onClick={retry}>Try again</Button>
        <Button variant="ghost" onClick={onBack}>
          Back
        </Button>
      </ScreenScaffold>
    )
  }

  // ── ready ──
  const meta = audit?.meta || {}
  const label = meta.label || 'your niche'
  const postCount = meta.postCount || 0
  const trendsMeta = meta.trends || {}
  const fresh =
    trendsMeta.stale === false ? 'updated today' : trendsMeta.stale === true ? 'cached' : null
  const footnote = [
    postCount > 0 ? `Based on ${postCount} ${postCount === 1 ? 'post' : 'posts'}` : null,
    `${label} trends`,
    fresh,
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <section className="flex flex-1 flex-col gap-5">
      <div className="space-y-3">
        <div className="space-y-1">
          <h1 className="text-xl font-bold tracking-tight text-ink">
            Your content audit
          </h1>
          <p className="text-sm text-muted">
            Your recent posts, measured against today’s{' '}
            <span className="font-semibold text-ink">{label}</span> trends.
          </p>
        </div>
        <VoiceTag onChange={onChangeVoice} />
        {postCount === 0 && (
          <p className="rounded-2xl border border-border bg-surface px-4 py-3 text-xs leading-relaxed text-muted shadow-card">
            No posts imported yet — this read leans on trends alone.{' '}
            <button
              type="button"
              onClick={onChangeVoice}
              className="font-semibold text-accent hover:text-accent-hover focus:outline-none focus-visible:underline"
            >
              Add a few posts
            </button>{' '}
            for a sharper audit.
          </p>
        )}
      </div>

      <div className="space-y-3 animate-rise">
        {SECTIONS.map(({ key, label: secLabel, Icon }) => {
          const body = audit?.sections?.[key]
          // Every block but the Hashtag Audit needs a body; the Hashtag Audit
          // renders from the structured `hashtags` data even if the body is thin.
          if (!body && key !== 'hashtagAudit') return null
          return (
            <article
              key={key}
              className="space-y-3 rounded-2xl border border-border bg-surface shadow-card p-4"
            >
              <div className="flex items-center gap-2.5">
                <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-accent/10 text-accent">
                  <Icon />
                </span>
                <h2 className="text-sm font-bold tracking-tight text-ink">
                  {secLabel}
                </h2>
              </div>
              {key === 'hashtagAudit' ? (
                <HashtagAudit hashtags={audit?.hashtags} fallbackMarkdown={body} />
              ) : (
                <SectionBody markdown={body} />
              )}
            </article>
          )
        })}
      </div>

      {footnote && (
        <p className="text-center text-[11px] text-muted/70">{footnote}</p>
      )}

      <div className="mt-auto space-y-3 pt-2">
        <Button onClick={onCreate}>
          Create a new post
          <ArrowIcon />
        </Button>
        <p className="text-center text-xs text-muted">
          That’s your audit — stop here, or turn it into a fresh post.
        </p>
        <Button variant="ghost" onClick={onBack}>
          Back
        </Button>
      </div>
    </section>
  )
}

/* ---------- Hashtag Audit: keep / retire / add chips ---------- */

// The structured hashtag data (extractHashtags + auditHashtags output) renders
// as labelled chip groups — sharper than the markdown bullets and the spec's
// "outdated tags out, trend-backed tags in" made visible. Falls back to the
// markdown body if the partition is empty (e.g. no tags and no trend tags).
function HashtagAudit({ hashtags, fallbackMarkdown }) {
  const { current = [], keep = [], retire = [], add = [] } = hashtags || {}
  const hasStructured = current.length || keep.length || retire.length || add.length
  if (!hasStructured) return <SectionBody markdown={fallbackMarkdown} />

  // Not using hashtags at all → lead with the recommendation, not the audit.
  if (!current.length && add.length) {
    return (
      <div className="space-y-2.5">
        <p className="text-sm leading-relaxed text-muted">
          You’re not using hashtags yet — that’s discovery left on the table.
          Start with these trend-backed tags:
        </p>
        <ChipRow items={add} variant="add" />
      </div>
    )
  }

  const groups = (
    <div className="space-y-3">
      {keep.length > 0 && (
        <ChipGroup label="Keep" hint="still trend-aligned" items={keep} variant="keep" />
      )}
      {retire.length > 0 && (
        <ChipGroup
          label="Retire"
          hint="absent from today’s trends"
          items={retire}
          variant="retire"
        />
      )}
      {add.length > 0 && (
        <ChipGroup
          label="Add"
          hint="trend-backed · number = momentum"
          items={add}
          variant="add"
        />
      )}
    </div>
  )
  return groups
}

function ChipGroup({ label, hint, items, variant }) {
  return (
    <div className="space-y-1.5">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">
        {label} <span className="font-normal text-muted/60">· {hint}</span>
      </p>
      <ChipRow items={items} variant={variant} />
    </div>
  )
}

const CHIP_VARIANTS = {
  keep: 'border-accent/25 bg-accent/10 text-accent',
  add: 'border-accent/30 bg-accent/15 text-accent',
  retire: 'border-red-500/25 bg-red-500/5 text-red-500 line-through decoration-red-500/40',
}

function ChipRow({ items, variant }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((it, i) => {
        // Items are either a tag string (current/keep/retire) or { tag, momentum } (add).
        const tag = typeof it === 'string' ? it : it?.tag
        const momentum = typeof it === 'object' && it ? it.momentum : null
        return (
          <span
            key={`${tag}-${i}`}
            className={[
              'inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium',
              CHIP_VARIANTS[variant],
            ].join(' ')}
          >
            {tag}
            {momentum != null && (
              <span className="text-[10px] font-semibold tabular-nums opacity-60">
                · {momentum}
              </span>
            )}
          </span>
        )
      })}
    </div>
  )
}

/* ---------- tiny Markdown renderer (just what the critique uses) ---------- */

// The critique bodies are simple Markdown: "- " bullets, paragraphs, and inline
// **bold** / *italic*. No dependency needed — we render exactly those, as React
// nodes (never dangerouslySetInnerHTML), so there's no injection surface.
const INLINE_RE = /(\*\*[^*]+\*\*|\*[^*]+\*)/g

function renderInline(text, keyPrefix) {
  return String(text)
    .split(INLINE_RE)
    .map((chunk, i) => {
      if (!chunk) return null
      const key = `${keyPrefix}-${i}`
      // Bold first — a **…** chunk also starts/ends with a single '*'.
      if (chunk.length > 4 && chunk.startsWith('**') && chunk.endsWith('**')) {
        return (
          <strong key={key} className="font-semibold text-ink">
            {chunk.slice(2, -2)}
          </strong>
        )
      }
      if (chunk.length > 2 && chunk.startsWith('*') && chunk.endsWith('*')) {
        return (
          <em key={key} className="text-ink/90">
            {chunk.slice(1, -1)}
          </em>
        )
      }
      return <span key={key}>{chunk}</span>
    })
    .filter(Boolean)
}

function SectionBody({ markdown }) {
  if (!markdown) return null
  // Group consecutive "- " lines into one list; everything else is a paragraph.
  const blocks = []
  let bullets = null
  const flush = () => {
    if (bullets) {
      blocks.push({ type: 'ul', items: bullets })
      bullets = null
    }
  }
  for (const raw of String(markdown).split('\n')) {
    const line = raw.trim()
    if (!line) {
      flush()
      continue
    }
    if (line.startsWith('- ')) {
      bullets = bullets || []
      bullets.push(line.slice(2))
    } else {
      flush()
      blocks.push({ type: 'p', text: line })
    }
  }
  flush()

  return (
    <div className="space-y-2.5">
      {blocks.map((b, i) =>
        b.type === 'ul' ? (
          <ul key={i} className="space-y-2">
            {b.items.map((item, j) => (
              <li
                key={j}
                className="flex gap-2.5 text-sm leading-relaxed text-muted"
              >
                <span
                  aria-hidden="true"
                  className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-accent/60"
                />
                <span>{renderInline(item, `${i}-${j}`)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p key={i} className="text-sm leading-relaxed text-muted">
            {renderInline(b.text, `p-${i}`)}
          </p>
        ),
      )}
    </div>
  )
}

/* ---------- bits ---------- */

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/* ---------- icons ---------- */

function iconProps(extra = '') {
  return {
    viewBox: '0 0 24 24',
    className: `h-4 w-4 ${extra}`.trim(),
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    'aria-hidden': true,
  }
}

// What's Working — a spark/highlight.
function SparkIcon() {
  return (
    <svg {...iconProps()}>
      <path d="M12 3l1.8 4.7L18.5 9l-4.7 1.3L12 15l-1.8-4.7L5.5 9l4.7-1.3z" />
    </svg>
  )
}

// What's Missing — a rising trend line you're not yet on.
function TrendIcon() {
  return (
    <svg {...iconProps()}>
      <path d="M3 17l6-6 4 4 7-7" />
      <path d="M17 8h4v4" />
    </svg>
  )
}

// Hashtag Audit — the hash.
function HashIcon() {
  return (
    <svg {...iconProps()}>
      <path d="M9 4L7 20M17 4l-2 16M5 9h14M4 15h14" />
    </svg>
  )
}

// Strategic Pivot — a compass / new heading.
function CompassIcon() {
  return (
    <svg {...iconProps()}>
      <circle cx="12" cy="12" r="9" />
      <path d="M15.5 8.5l-2.2 5.3-5.3 2.2 2.2-5.3z" />
    </svg>
  )
}

function ArrowIcon() {
  return (
    <svg {...iconProps()}>
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  )
}

function WarnIcon() {
  return (
    <svg {...iconProps('h-7 w-7')}>
      <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
    </svg>
  )
}
