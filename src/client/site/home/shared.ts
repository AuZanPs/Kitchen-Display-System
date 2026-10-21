import { type CSSProperties, useEffect } from 'react'
import type { TicketLine } from '../../ticket'

export const line = (
  key: string,
  qty: number,
  name: string,
  extra: Partial<TicketLine> = {},
): TicketLine => ({
  key,
  qty,
  name,
  modifiers: [],
  note: null,
  allergy: null,
  ...extra,
})

export const delay = (d: number) => ({ '--d': d }) as CSSProperties

/** Marks [data-reveal] elements `is-in` once they scroll into view. */
export function useReveal() {
  useEffect(() => {
    const items = document.querySelectorAll('[data-reveal]')
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue
          entry.target.classList.add('is-in')
          io.unobserve(entry.target)
        }
      },
      { rootMargin: '0px 0px -8% 0px' },
    )
    for (const item of items) io.observe(item)
    return () => io.disconnect()
  }, [])
}
