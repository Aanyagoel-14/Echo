/*
 * The Echo mark with rings rippling outward — the "echo" made literal. Pure CSS
 * (keyframes in index.css); the loop is stilled under prefers-reduced-motion.
 * Shared by every screen that waits on the engine (Loading → synthesis, Audit →
 * the suggestion model) so the branded loader is identical wherever it appears.
 */
export default function EchoPulse() {
  return (
    <span className="relative flex h-24 w-24 items-center justify-center">
      <span className="absolute inset-0 rounded-full border border-accent animate-ripple" />
      <span className="absolute inset-0 rounded-full border border-accent animate-ripple [animation-delay:0.63s]" />
      <span className="absolute inset-0 rounded-full border border-accent animate-ripple [animation-delay:1.26s]" />
      <svg
        viewBox="0 0 512 512"
        className="relative h-12 w-12 text-accent"
        aria-hidden="true"
      >
        <g fill="none" stroke="currentColor">
          <circle cx="256" cy="256" r="150" strokeWidth="14" opacity="0.26" />
          <circle cx="256" cy="256" r="104" strokeWidth="16" opacity="0.55" />
          <circle cx="256" cy="256" r="58" strokeWidth="18" />
        </g>
        <circle cx="256" cy="256" r="22" fill="currentColor" />
      </svg>
    </span>
  )
}
