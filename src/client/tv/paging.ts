/** Measured heights of one ticket as it renders in full on the TV. */
export type TicketSize = {
  /** The whole card. */
  height: number
  /** Each line in order; the rest of the card is header, allergy and note. */
  lines: number[]
}

/** A card on a page: a whole ticket, or a run of its lines when it is too tall. */
export type Slice = { index: number; from: number; to: number; part: number }

/**
 * Packs tickets into pages of `pageHeight`, whole tickets first. A ticket
 * taller than a page is cut into parts by line; every part repeats the
 * header and allergy block, so each part costs that fixed height again.
 */
export function paginate(
  sizes: TicketSize[],
  pageHeight: number,
  gap: number,
  lineGap: number,
): Slice[][] {
  const pages: Slice[][] = []
  let page: Slice[] = []
  let used = 0

  function place(slice: Slice, height: number) {
    const needed = page.length === 0 ? height : used + gap + height
    if (page.length > 0 && needed > pageHeight) {
      pages.push(page)
      page = []
      used = 0
    }
    used = page.length === 0 ? height : used + gap + height
    page.push(slice)
  }

  sizes.forEach((size, index) => {
    if (size.height <= pageHeight || size.lines.length <= 1) {
      place({ index, from: 0, to: size.lines.length, part: 0 }, size.height)
      return
    }
    const linesHeight =
      size.lines.reduce((sum, h) => sum + h, 0) +
      lineGap * (size.lines.length - 1)
    const fixed = size.height - linesHeight
    let from = 0
    let part = 0
    while (from < size.lines.length) {
      // At least one line per part, even if that line alone overflows.
      let to = from + 1
      let height = fixed + (size.lines[from] ?? 0)
      while (
        to < size.lines.length &&
        height + lineGap + (size.lines[to] ?? 0) <= pageHeight
      ) {
        height += lineGap + (size.lines[to] ?? 0)
        to += 1
      }
      // Each part starts its own page so the reader never loses the header.
      if (page.length > 0) {
        pages.push(page)
        page = []
        used = 0
      }
      place({ index, from, to, part }, height)
      from = to
      part += 1
    }
  })
  if (page.length > 0) pages.push(page)
  return pages
}
