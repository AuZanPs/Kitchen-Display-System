import { Check } from 'lucide-react'
import type { ComponentProps } from 'react'

/** Filter chip: a toggle with a check mark, so selection is never colour-only. */
export function Chip({
  selected,
  className = '',
  children,
  ...rest
}: ComponentProps<'button'> & { selected: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      className={`state inline-flex min-h-12 shrink-0 items-center gap-1.5 rounded-sm border px-4 text-[15px] font-medium transition-[background-color,border-color,scale] duration-150 active:scale-[0.97] ${
        selected
          ? 'border-transparent [--bg:var(--color-tonal)]'
          : 'border-line'
      } ${className}`}
      {...rest}
    >
      {selected && <Check size={18} aria-hidden strokeWidth={2.5} />}
      {children}
    </button>
  )
}
