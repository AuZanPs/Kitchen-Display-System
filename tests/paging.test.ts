import { describe, expect, it } from 'vitest'
import { paginate } from '../src/client/tv/paging'

const ticket = (lines: number[], fixed = 100) => ({
  height: fixed + lines.reduce((a, b) => a + b, 0) + 10 * (lines.length - 1),
  lines,
})

describe('TV paging', () => {
  it('keeps tickets whole and starts a new page when the next one does not fit', () => {
    // Heights 140, 140, 140 on a 320px page with a 20px gap: two fit, one moves.
    const pages = paginate(
      [ticket([40]), ticket([40]), ticket([40])],
      320,
      20,
      10,
    )
    expect(pages.map((p) => p.map((s) => s.index))).toEqual([[0, 1], [2]])
    expect(pages.flat().every((s) => s.part === 0)).toBe(true)
  })

  it('splits a ticket taller than a page into parts by line', () => {
    // 100 fixed + 6 lines of 50 + 5 gaps of 10 = 450 on a 300px page.
    const pages = paginate([ticket([50, 50, 50, 50, 50, 50])], 300, 20, 10)
    expect(pages).toEqual([
      [{ index: 0, from: 0, to: 3, part: 0 }],
      [{ index: 0, from: 3, to: 6, part: 1 }],
    ])
  })

  it('never drops a line, even one taller than the page', () => {
    const pages = paginate([ticket([500, 20])], 300, 20, 10)
    const lines = pages.flat().flatMap((s) => [s.from, s.to])
    expect(lines).toEqual([0, 1, 1, 2])
  })
})
