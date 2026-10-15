import type { ComponentProps } from 'react'

/** Tonal container: elevation by tone, never by shadow. */
export function Card({ className = '', ...rest }: ComponentProps<'section'>) {
  return <section className={`rounded-md bg-wash p-5 ${className}`} {...rest} />
}
