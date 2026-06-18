/**
 * Shared empty-screen layout: a centered icon tile + title + subtitle, with
 * the screen's actions pinned toward the bottom (thumb-reachable). Used by the
 * static screens; Loading rolls its own so it can host the spinner animation.
 */
export default function ScreenScaffold({ icon, title, subtitle, children }) {
  return (
    <section className="flex flex-1 flex-col">
      <div className="flex flex-1 flex-col items-center justify-center gap-5 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-border bg-surface text-accent shadow-card">
          {icon}
        </div>
        <div className="space-y-2">
          <h1 className="text-2xl font-bold tracking-tight text-ink">{title}</h1>
          <p className="mx-auto max-w-xs text-pretty leading-relaxed text-muted">
            {subtitle}
          </p>
        </div>
      </div>
      {children ? <div className="space-y-3 pt-6">{children}</div> : null}
    </section>
  )
}
