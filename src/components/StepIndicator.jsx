/**
 * Compact progress for the 3 user-facing steps (Loading folds into Capture).
 * The active step is a wide accent pill; past steps stay tinted, future ones
 * are border-grey. Purely presentational — App owns which step is active.
 */
const STEPS = ['Voice', 'Capture', 'Results']

export default function StepIndicator({ active }) {
  return (
    <nav aria-label="Progress" className="flex items-center gap-1.5">
      {STEPS.map((label, i) => (
        <span
          key={label}
          aria-label={label}
          aria-current={i === active ? 'step' : undefined}
          className={[
            'h-1.5 rounded-full transition-all duration-200',
            i === active
              ? 'w-6 bg-accent'
              : i < active
                ? 'w-1.5 bg-accent/50'
                : 'w-1.5 bg-border',
          ].join(' ')}
        />
      ))}
    </nav>
  )
}
