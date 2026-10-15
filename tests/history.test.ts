import { describe, expect, it } from 'vitest'
import { historySchema } from '../src/shared/history'
import { jakartaDate } from '../src/shared/order'
import {
  adminHeaders,
  command,
  createOrder,
  line,
  postJson,
  rejected,
  request,
} from './helpers'

const today = () => jakartaDate(Date.now())

async function history(day = today()) {
  const res = await request(`/api/manager/history?day=${day}`, {
    headers: await adminHeaders(),
  })
  expect(res.status).toBe(200)
  return historySchema.parse(await res.json())
}

describe('history', () => {
  it("lists the day's orders with totals for the admin", async () => {
    const served = await createOrder()
    await command(served.orderId, {
      type: 'accept',
      expectedVersion: 1,
      allergyAcknowledged: true,
    })
    await command(served.orderId, { type: 'ready', expectedVersion: 2 })
    await command(served.orderId, { type: 'serve', expectedVersion: 3 })
    const cancelled = await createOrder()
    await command(cancelled.orderId, {
      type: 'managerCancel',
      expectedVersion: 1,
      reason: 'Tamu pergi',
    })

    const day = await history()
    const ids = day.orders.map((o) => o.id)
    expect(ids).toContain(served.orderId)
    expect(ids).toContain(cancelled.orderId)
    expect(day.stats.served).toBeGreaterThanOrEqual(1)
    expect(day.stats.cancelled).toBeGreaterThanOrEqual(1)
    // Two Nasi Goreng Kampung (42 000) on the served order; cancelled ones never count.
    expect(day.stats.revenueIdr).toBeGreaterThanOrEqual(84_000)
  })

  it('returns an empty day without failing', async () => {
    const day = await history('2020-01-01')
    expect(day.orders).toEqual([])
    expect(day.stats.orders).toBe(0)
  })
})

describe('export', () => {
  it('exports one CSV row per line, safe to open in a spreadsheet', async () => {
    const item = await postJson('/api/manager/menu', {
      name: '=HYPERLINK("x")',
      priceIdr: 1000,
      category: 'Uji',
      sort: 1,
      available: true,
      hidden: false,
      modifierGroups: [],
    })
    const { item: created } = (await item.json()) as { item: { id: string } }
    await createOrder({
      lines: [line({ menuItemId: created.id, qty: 3, optionIds: [] })],
    })

    const res = await request(
      `/api/manager/export?from=${today()}&to=${today()}&format=csv`,
      { headers: await adminHeaders() },
    )
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('text/csv')
    expect(res.headers.get('content-disposition')).toContain('attachment')
    const csv = await res.text()
    const [header] = csv.split('\r\n')
    expect(header).toBe(
      'service_day,ticket,status,destination,created_at,created_by,item,modifiers,qty,unit_price_idr,line_total_idr',
    )
    // A leading = would run as a formula; it is neutralised with a quote mark.
    expect(csv).toContain(`"'=HYPERLINK(""x"")"`)
    expect(csv).toContain(',3,1000,3000')
    expect(csv).not.toMatch(/udang|alergi/i)
  })

  it('exports JSON too', async () => {
    const res = await request(
      `/api/manager/export?from=${today()}&to=${today()}&format=json`,
      { headers: await adminHeaders() },
    )
    expect(res.status).toBe(200)
    const rows = (await res.json()) as { ticket: string }[]
    expect(rows.length).toBeGreaterThan(0)
    expect(rows[0]?.ticket).toMatch(/^A-\d{3}$/)
  })

  it('refuses a range longer than 31 days', async () => {
    const res = await request(
      '/api/manager/export?from=2026-01-01&to=2026-03-01&format=csv',
      { headers: await adminHeaders() },
    )
    expect((await rejected(res, 422)).code).toBe('invalid_input')
  })
})
