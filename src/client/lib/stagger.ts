import type { CSSProperties } from 'react'

/** Position in a list, read by the `.rise` animation delay. */
export function stagger(index: number): CSSProperties {
  return { '--i': index } as CSSProperties
}
