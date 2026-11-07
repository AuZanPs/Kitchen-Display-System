import { z } from 'zod'
import {
  MENU_LIMITS,
  type MenuItemInput,
  type ModifierGroup,
  menuItemInputSchema,
} from './menu'

/** Most rows one import may add; keeps the request under the 64 KB body cap. */
export const IMPORT_LIMIT = 150

export const menuImportSchema = z.object({
  items: z.array(menuItemInputSchema).min(1).max(IMPORT_LIMIT),
  /** Hide every item already on the menu, so the file becomes the menu. */
  hideCurrent: z.boolean(),
})
export const menuImportResultSchema = z.object({
  added: z.number().int(),
  skipped: z.number().int(),
  hidden: z.number().int(),
})
export type MenuImport = z.infer<typeof menuImportSchema>

/** Splits CSV text into rows. Handles quotes and the `;` Excel uses in id-ID. */
export function parseCsv(text: string): string[][] {
  const body = text.replace(/^﻿/, '')
  const firstLine = body.split('\n', 1)[0] ?? ''
  const sep =
    firstLine.split(';').length > firstLine.split(',').length ? ';' : ','
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  for (let i = 0; i < body.length; i++) {
    const ch = body[i]
    if (quoted) {
      if (ch === '"' && body[i + 1] === '"') {
        cell += '"'
        i++
      } else if (ch === '"') quoted = false
      else cell += ch
    } else if (ch === '"') quoted = true
    else if (ch === sep) {
      row.push(cell)
      cell = ''
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && body[i + 1] === '\n') i++
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
    } else cell += ch
  }
  if (cell !== '' || row.length > 0) {
    row.push(cell)
    rows.push(row)
  }
  return rows
}

const HEADERS = {
  name: /^(nama|menu|item|name)/i,
  price: /^(harga|price)/i,
  category: /^(kategori|category|jenis)/i,
  size: /^(ukuran|porsi|size)/i,
}

// A size that says nothing the name does not: left off the item name.
const PLAIN_SIZE = /^(|-|–|—|reguler|regular|biasa|normal|tambahan)$/i

// "Bakmi/Kwetiau Ayam Jamur": the waiter picks one of the two noodles.
const CHOICE_PREFIX = /^([^\s/]+)\/([^\s/]+)\s+\S/

export type ImportRows =
  | { ok: true; items: MenuItemInput[]; skipped: number }
  | { ok: false; reason: 'no_header' | 'no_rows' }

/**
 * Turns spreadsheet rows into menu items. The header row is the first one with
 * a name and a price column; rows without a name or a price are skipped.
 */
export function rowsToMenu(
  rows: string[][],
  firstSort: number,
  lang: 'en' | 'id' = 'en',
): ImportRows {
  const headerAt = rows.findIndex(
    (r) =>
      r.some((c) => HEADERS.name.test(c.trim())) &&
      r.some((c) => HEADERS.price.test(c.trim())),
  )
  const header = rows[headerAt]
  if (!header) return { ok: false, reason: 'no_header' }
  const column = (re: RegExp) => header.findIndex((c) => re.test(c.trim()))
  const col = {
    name: column(HEADERS.name),
    price: column(HEADERS.price),
    category: column(HEADERS.category),
    size: column(HEADERS.size),
  }

  const items: MenuItemInput[] = []
  let skipped = 0
  for (const row of rows.slice(headerAt + 1)) {
    const cell = (i: number) => (i < 0 ? '' : (row[i] ?? '').trim())
    const baseName = cell(col.name).replace(/\s+/g, ' ')
    const priceText = cell(col.price)
    if (baseName === '' && priceText === '') continue
    const priceIdr = toPrice(priceText)
    if (baseName === '' || priceIdr === null) {
      skipped++
      continue
    }
    const size = cell(col.size)
    const name = PLAIN_SIZE.test(size) ? baseName : `${baseName} (${size})`
    const item = menuItemInputSchema.safeParse({
      name: name.slice(0, MENU_LIMITS.name),
      priceIdr,
      category: (cell(col.category) || 'Menu').slice(0, MENU_LIMITS.category),
      sort: firstSort + items.length,
      available: true,
      hidden: false,
      modifierGroups: choiceGroups(baseName, lang),
    })
    if (item.success) items.push(item.data)
    else skipped++
  }
  if (items.length === 0) return { ok: false, reason: 'no_rows' }
  return { ok: true, items, skipped }
}

/** A spreadsheet number (28000, 28000.5) or rupiah text (Rp 28.000). */
function toPrice(text: string): number | null {
  // Three digits after a dot are thousands (28.000), not a fraction.
  if (/^\d+\.\d{1,2}$/.test(text)) return Math.round(Number(text))
  const digits = text.replace(/\D/g, '')
  return digits === '' ? null : Number(digits)
}

function choiceGroups(name: string, lang: 'en' | 'id' = 'en'): ModifierGroup[] {
  const match = CHOICE_PREFIX.exec(name)
  if (!match?.[1] || !match[2]) return []
  return [
    {
      id: 'choice',
      name: lang === 'id' ? 'Pilihan' : 'Choice',
      required: true,
      multi: false,
      options: [
        { id: 'a', name: match[1], priceDeltaIdr: 0 },
        { id: 'b', name: match[2], priceDeltaIdr: 0 },
      ],
    },
  ]
}
