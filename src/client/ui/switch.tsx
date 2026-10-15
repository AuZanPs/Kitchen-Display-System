import { Check } from 'lucide-react'
import { useId } from 'react'

/** Material 3 switch on a native checkbox, so keyboard and forms just work. */
export function Switch({
  label,
  hint,
  checked,
  disabled,
  onChange,
}: {
  label: string
  hint?: string
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
      <span className="grid">
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
          className="pointer-events-none absolute top-1/2 left-2 grid size-4 -translate-y-1/2 place-items-center rounded-full bg-ink-soft transition-[left,width,height,background-color] duration-200 ease-out peer-checked:left-[24px] peer-checked:size-6 peer-checked:bg-surface"
        >
          {checked && <Check size={14} strokeWidth={3} className="text-ink" />}
        </span>
      </span>
    </label>
  )
}
