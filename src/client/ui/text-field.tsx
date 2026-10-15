import { CircleAlert } from 'lucide-react'
import { type ComponentProps, type ReactNode, useId } from 'react'
import { useI18n } from '../i18n'

type Common = {
  label: string
  hint?: ReactNode
  /** Shows a counter and an error past this length. Never truncates. */
  max?: number
  error?: string | null
  icon?: ReactNode
}

const FIELD =
  'w-full rounded-sm border bg-surface px-4 text-base text-ink outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-ink-soft focus:border-ink focus:shadow-[inset_0_0_0_1px_var(--color-ink)]'

function Frame({
  id,
  label,
  hint,
  max,
  error,
  icon,
  length,
  children,
}: Common & { id: string; length: number; children: ReactNode }) {
  const { t } = useI18n()
  const over = max !== undefined && length > max
  const message =
    error ?? (over ? t('tooLong', { count: length, max: max ?? 0 }) : null)
  return (
    <div className="grid gap-1.5">
      <label
        htmlFor={id}
        className="flex items-center gap-2 text-sm font-medium"
      >
        {icon}
        {label}
      </label>
      {children}
      <div className="flex min-h-5 items-start justify-between gap-3 text-[13px] text-ink-soft">
        {message ? (
          <span
            id={`${id}-msg`}
            className="flex items-center gap-1.5 font-semibold text-ink"
            role="alert"
          >
            <CircleAlert size={16} aria-hidden />
            {message}
          </span>
        ) : (
          <span id={`${id}-msg`}>{hint}</span>
        )}
        {max !== undefined && (
          <span
            className={`tabular-nums ${over ? 'font-semibold text-ink' : ''}`}
          >
            {length}/{max}
          </span>
        )}
      </div>
    </div>
  )
}

export function TextField({
  label,
  hint,
  max,
  error,
  icon,
  className = '',
  ...input
}: Common & ComponentProps<'input'>) {
  const id = useId()
  const length = String(input.value ?? '').length
  const invalid = Boolean(error) || (max !== undefined && length > max)
  return (
    <Frame {...{ id, label, hint, max, error, icon, length }}>
      <input
        id={id}
        aria-invalid={invalid}
        aria-describedby={`${id}-msg`}
        className={`${FIELD} h-14 ${invalid ? 'border-ink border-2' : 'border-ink-soft'} ${className}`}
        {...input}
      />
    </Frame>
  )
}

export function TextArea({
  label,
  hint,
  max,
  error,
  icon,
  className = '',
  ...input
}: Common & ComponentProps<'textarea'>) {
  const id = useId()
  const length = String(input.value ?? '').length
  const invalid = Boolean(error) || (max !== undefined && length > max)
  return (
    <Frame {...{ id, label, hint, max, error, icon, length }}>
      <textarea
        id={id}
        rows={2}
        aria-invalid={invalid}
        aria-describedby={`${id}-msg`}
        className={`${FIELD} resize-none py-3 leading-snug ${invalid ? 'border-ink border-2' : 'border-ink-soft'} ${className}`}
        {...input}
      />
    </Frame>
  )
}
