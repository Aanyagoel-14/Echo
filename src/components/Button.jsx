/**
 * Shared button — the one place primary/secondary/ghost styling lives so
 * every screen stays consistent with the §4 design system.
 */
const VARIANTS = {
  primary: 'bg-accent text-white shadow-card hover:bg-accent-hover',
  secondary:
    'border border-border bg-surface text-ink shadow-card hover:border-accent/50',
  ghost: 'text-muted hover:text-ink',
}

export default function Button({
  children,
  onClick,
  variant = 'primary',
  type = 'button',
  className = '',
  ...props
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      className={[
        'inline-flex w-full items-center justify-center gap-2 rounded-2xl px-6 py-4',
        'text-base font-semibold transition duration-150 active:scale-[0.99]',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/60',
        'focus-visible:ring-offset-2 focus-visible:ring-offset-bg',
        'disabled:pointer-events-none disabled:opacity-40',
        VARIANTS[variant],
        className,
      ].join(' ')}
      {...props}
    >
      {children}
    </button>
  )
}
