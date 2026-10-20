import { Check } from 'lucide-react'
import { useId } from 'react'

/** A switch on a native checkbox, so keyboard and forms just work. */
export function Switch({
  label,
  hint,
  hideLabel = false,
  checked,
  disabled,
  onChange,
}: {
  label: string
  hint?: string
  /** Keeps the name for screen readers when the row already says what it is. */
  hideLabel?: boolean
  checked: boolean
  disabled?: boolean
  onChange: (checked: boolean) => void
}) {
  const id = useId()
  return (
    <label
      htmlFor={id}
      className="flex min-h-14 cursor-pointer items-center justify-between gap-4"
    >
      <span className={hideLabel ? 'sr-only' : 'grid'}>
        <span className="text-base">{label}</span>
        {hint && <span className="text-[13px] text-ink-soft">{hint}</span>}
      </span>
      <span className="relative inline-flex shrink-0">
        <input
          id={id}
          type="checkbox"
          role="switch"
          aria-checked={checked}
          checked={checked}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
          className="peer h-8 w-[52px] cursor-pointer appearance-none rounded-full border-2 border-ink-soft bg-surface transition-colors duration-200 checked:border-ink checked:bg-ink focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ink"
        />
        <span
          aria-hidden
          className="pointer-events-none absolute top-1/2 left-1 grid size-6 -translate-y-1/2 scale-[0.67] place-items-center rounded-full bg-ink-soft transition-[translate,scale,background-color] duration-200 ease-out peer-checked:translate-x-5 peer-checked:scale-100 peer-checked:bg-surface peer-active:scale-[0.85] peer-checked:peer-active:scale-[0.9]"
        >
          {checked && <Check size={14} strokeWidth={3} className="text-ink" />}
        </span>
      </span>
    </label>
  )
}
