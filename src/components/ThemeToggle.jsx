/*
 * Light/dark toggle for the header's top-right corner. Shows the icon of the
 * theme you'll switch TO (moon while light, sun while dark) — the common,
 * legible pattern. Token-styled so it looks right in either theme.
 */
export default function ThemeToggle({ theme, onToggle }) {
  const toLabel = theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={toLabel}
      title={toLabel}
      className={[
        'flex h-9 w-9 items-center justify-center rounded-full border border-border',
        'bg-surface text-muted shadow-card transition duration-150',
        'hover:text-ink hover:border-accent/40 active:scale-95',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/60',
        'focus-visible:ring-offset-2 focus-visible:ring-offset-bg',
      ].join(' ')}
    >
      {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
    </button>
  )
}

function MoonIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-[18px] w-[18px]"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />
    </svg>
  )
}

function SunIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-[18px] w-[18px]"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  )
}
