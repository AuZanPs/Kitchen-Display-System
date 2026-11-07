import { describe, expect, it } from 'vitest'
import {
  menuImportSchema,
  parseCsv,
  rowsToMenu,
} from '../src/shared/menu-import'
import { MENU_TEMPLATES, templateItems } from '../src/shared/menu-templates'
import { adminHeaders, createOrder, getBoard, line, request } from './helpers'

// The first rows of a real menu file: a title, a note, then the header.
const SHEET = [
  ['DAFTAR MENU BAKMI BANGKA ASLI 17'],
  ['Transkripsi dari 2 foto menu'],
  [],
  ['Kategori', 'Nama Menu', 'Ukuran/Porsi', 'Harga (Rp)'],
  ['Menu Reguler', 'Bakmi Ayam Jamur', 'Reguler', '28000'],
  ['Minuman', 'Teh Botol/S-tee', '—', '8000'],
  ['Porsi Jumbo', 'Bakmi/Kwetiau Ayam Jamur', 'Jumbo', '32000'],
  ['Porsi 1/2', 'Bakso Kuah', '½ porsi', 'Rp 22.000'],
  ['Tambahan', 'Telur Ceplok/Dadar', 'Tambahan', '6000'],
  ['Tambahan', 'Kerupuk', '', ''],
  [],
]

describe('menu file rows', () => {
  it('reads names, prices, sizes and noodle choices', () => {
    const result = rowsToMenu(SHEET, 10)
    if (!result.ok) throw new Error(result.reason)
    expect(result.skipped).toBe(1)
    expect(
      result.items.map((i) => [i.category, i.name, i.priceIdr, i.sort]),
    ).toEqual([
      ['Menu Reguler', 'Bakmi Ayam Jamur', 28000, 10],
      ['Minuman', 'Teh Botol/S-tee', 8000, 11],
      ['Porsi Jumbo', 'Bakmi/Kwetiau Ayam Jamur (Jumbo)', 32000, 12],
      ['Porsi 1/2', 'Bakso Kuah (½ porsi)', 22000, 13],
      ['Tambahan', 'Telur Ceplok/Dadar', 6000, 14],
    ])
    const jumbo = result.items[2]?.modifierGroups[0]
    expect(jumbo?.required).toBe(true)
    expect(jumbo?.options.map((o) => o.name)).toEqual(['Bakmi', 'Kwetiau'])
    expect(result.items[1]?.modifierGroups).toEqual([])
    expect(result.items[4]?.modifierGroups).toEqual([])
  })

  it('needs a header with a name and a price', () => {
    expect(
      rowsToMenu(
        [
          ['a', 'b'],
          ['c', 'd'],
        ],
        0,
      ),
    ).toEqual({
      ok: false,
      reason: 'no_header',
    })
    expect(rowsToMenu([['Nama', 'Harga']], 0)).toEqual({
      ok: false,
      reason: 'no_rows',
    })
  })

  it('parses quoted CSV with either separator', () => {
    expect(parseCsv('﻿Nama;Harga\r\n"Es ""Teh""; manis";7000\r\n')).toEqual([
      ['Nama', 'Harga'],
      ['Es "Teh"; manis', '7000'],
    ])
    expect(parseCsv('Nama,Harga\nKopi,"12,000"')).toEqual([
      ['Nama', 'Harga'],
      ['Kopi', '12,000'],
    ])
  })
})

type Item = { id: string; name: string; category: string; hidden: boolean }

async function adminItems(): Promise<Item[]> {
  const res = await request('/api/manager/menu', {
    headers: await adminHeaders(),
  })
  return ((await res.json()) as { items: Item[] }).items
}

function importBody(names: string[], hideCurrent = false) {
  return {
    hideCurrent,
    items: names.map((name, i) => ({
      name,
      priceIdr: 10000,
      category: 'Impor',
      sort: 500 + i,
      available: true,
      hidden: false,
      modifierGroups: [],
    })),
  }
}

describe('menu import, bulk changes and delete', () => {
  it('imports once, skips repeats and can hide the old menu', async () => {
    const tag = crypto.randomUUID().slice(0, 6)
    const names = [`Mi ${tag}`, `Bihun ${tag}`]
    const before = await getBoard()
    const first = await request('/api/manager/menu/import', {
      headers: await adminHeaders(),
      body: importBody(names),
    })
    expect(await first.json()).toEqual({ added: 2, skipped: 0, hidden: 0 })
    expect((await getBoard()).menuVersion).toBeGreaterThan(before.menuVersion)

    const again = await request('/api/manager/menu/import', {
      headers: await adminHeaders(),
      body: importBody([...names, `Kwetiau ${tag}`], true),
    })
    const result = (await again.json()) as Record<string, number>
    expect(result.added).toBe(1)
    expect(result.skipped).toBe(2)
    expect(result.hidden).toBeGreaterThan(0)
    const shown = (await adminItems()).filter((i) => !i.hidden)
    expect(shown.map((i) => i.name)).toEqual([`Kwetiau ${tag}`])
  })

  it('refuses an import without an admin sign-in', async () => {
    const res = await request('/api/manager/menu/import', {
      body: importBody(['Nope']),
    })
    expect(res.status).toBe(401)
  })

  it('changes many items in one call', async () => {
    const tag = crypto.randomUUID().slice(0, 6)
    await request('/api/manager/menu/import', {
      headers: await adminHeaders(),
      body: importBody([`A ${tag}`, `B ${tag}`]),
    })
    const ids = (await adminItems())
      .filter((i) => i.name.endsWith(tag))
      .map((i) => i.id)
    const res = await request('/api/manager/menu', {
      method: 'PATCH',
      headers: await adminHeaders(),
      body: {
        changes: [
          ...ids.map((id) => ({ id, available: false, category: 'Baru' })),
          { id: 'missing-id', hidden: true },
        ],
      },
    })
    expect(await res.json()).toEqual({ updated: 2 })
    const changed = (await adminItems()).filter((i) => ids.includes(i.id))
    expect(changed.every((i) => i.category === 'Baru')).toBe(true)
  })

  it('deletes an item only while nobody ordered it', async () => {
    const tag = crypto.randomUUID().slice(0, 6)
    await request('/api/manager/menu/import', {
      headers: await adminHeaders(),
      body: importBody([`Fresh ${tag}`, `Ordered ${tag}`]),
    })
    const items = await adminItems()
    const fresh = items.find((i) => i.name === `Fresh ${tag}`)
    const ordered = items.find((i) => i.name === `Ordered ${tag}`)
    if (!fresh || !ordered) throw new Error('import failed')
    await createOrder({
      lines: [line({ menuItemId: ordered.id, qty: 1, optionIds: [] })],
    })

    const headers = await adminHeaders()
    const del = (id: string) =>
      request(`/api/manager/menu/${id}`, { method: 'DELETE', headers })
    expect((await del(fresh.id)).status).toBe(200)
    expect((await del(fresh.id)).status).toBe(404)
    expect((await del(ordered.id)).status).toBe(409)
    const left = (await adminItems()).map((i) => i.id)
    expect(left).toContain(ordered.id)
    expect(left).not.toContain(fresh.id)
  })
})

describe('menu templates', () => {
  it('are valid imports with no repeated item', () => {
    for (const template of MENU_TEMPLATES) {
      const items = templateItems(template, 1)
      expect(
        menuImportSchema.safeParse({ items, hideCurrent: true }).success,
      ).toBe(true)
      const keys = items.map((i) => `${i.category}/${i.name}`)
      expect(new Set(keys).size, template.id).toBe(keys.length)
    }
  })
})
