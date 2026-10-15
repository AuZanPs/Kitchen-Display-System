import type { ComponentProps, ReactNode } from 'react'

export type ButtonVariant = 'filled' | 'tonal' | 'outlined' | 'text'

// Each variant sets the state layer's container (--bg) and content (--on) colours.
const VARIANTS: Record<ButtonVariant, string> = {
  filled:
    'text-surface [--bg:var(--color-ink)] [--on:var(--color-surface)] disabled:[--bg:var(--color-line)] disabled:text-ink-soft',
  tonal: 'text-ink [--bg:var(--color-tonal)] disabled:[--bg:var(--color-line)]',
  outlined: 'text-ink border border-ink-soft disabled:border-line',
  text: 'text-ink',
}

const SIZES = {
  md: 'min-h-12 px-6 text-[15px] gap-2',
  lg: 'min-h-16 px-8 text-lg gap-3',
} as const

type Props = ComponentProps<'button'> & {
  variant?: ButtonVariant
  size?: keyof typeof SIZES
  icon?: ReactNode
}

export function Button({
  variant = 'filled',
  size = 'md',
  icon,
  className = '',
  children,
  type = 'button',
  ...rest
}: Props) {
  return (
    <button
      type={type}
      className={`state inline-flex select-none items-center justify-center rounded-full font-semibold tracking-[0.01em] transition-[background-color,scale] duration-150 ease-out active:scale-[0.97] disabled:cursor-not-allowed disabled:text-ink-soft disabled:active:scale-100 ${VARIANTS[variant]} ${SIZES[size]} ${className}`}
      {...rest}
    >
      {icon}
      {children}
    </button>
  )
}

/** A 48px round button that needs an accessible name. */
export function IconButton({
  label,
  className = '',
  children,
  type = 'button',
  ...rest
}: ComponentProps<'button'> & { label: string }) {
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      className={`state inline-grid size-12 shrink-0 place-items-center rounded-full text-ink transition-[background-color,scale] duration-150 ease-out active:scale-[0.94] disabled:text-ink-soft ${className}`}
      {...rest}
    >
      {children}
    </button>
  )
}
