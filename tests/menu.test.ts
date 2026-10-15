import { runInDurableObject } from 'cloudflare:test'
import { describe, expect, it } from 'vitest'
import { menuSchema, tablesSchema } from '../src/shared/menu'
import {
  adminHeaders,
  createOrder,
  getBoard,
  line,
  orderBody,
  pairDevice,
  postOrder,
  rejected,
  request,
  room,
} from './helpers'

function itemBody(overrides: Record<string, unknown> = {}) {
  return {
    name: `Es Kopi ${crypto.randomUUID().slice(0, 6)}`,
    priceIdr: 22000,
    category: 'Minuman',
    sort: 50,
    available: true,
    hidden: false,
    modifierGroups: [
      {
        id: 'suhu',
        name: 'Suhu',
        required: true,
        multi: false,
        options: [
          { id: 'dingin', name: 'Dingin', priceDeltaIdr: 0 },
          { id: 'panas', name: 'Panas', priceDeltaIdr: 0 },
        ],
      },
    ],
    ...overrides,
  }
}

async function addItem(body = itemBody()) {
  const res = await request('/api/manager/menu', {
    headers: await adminHeaders(),
    body,
  })
  expect(res.status).toBe(201)
  return ((await res.json()) as { item: { id: string } }).item.id
}

async function putItem(id: string, body: Record<string, unknown>) {
  return request(`/api/manager/menu/${id}`, {
    method: 'PUT',
    headers: await adminHeaders(),
    body,
  })
}

async function waiterMenu(headers: Record<string, string>) {
  const res = await request('/api/menu', { headers })
  expect(res.status).toBe(200)
  return menuSchema.parse(await res.json()).items
}

describe('manager menu', () => {
  it('a new item reaches the waiter menu and moves the board', async () => {
    const waiter = await pairDevice('waiter')
    const before = await getBoard()
    const body = itemBody()
    const res = await request('/api/manager/menu', {
      headers: await adminHeaders(),
      body,
    })
    expect(res.status).toBe(201)
    const { item } = (await res.json()) as { item: { id: string } }

    const listed = (await waiterMenu(waiter.headers)).find(
      (i) => i.id === item.id,
    )
    expect(listed).toMatchObject({
      name: body.name,
      priceIdr: 22000,
      category: 'Minuman',
      available: true,
    })
    const after = await getBoard()
    expect(after.menuVersion).toBeGreaterThan(before.menuVersion)
    expect(after.rev).toBeGreaterThan(before.rev)
  })

  it('a price change applies to the next order only', async () => {
    const body = itemBody()
    const id = await addItem(body)
    const first = await createOrder({
      lines: [line({ menuItemId: id, qty: 1, optionIds: ['dingin'] })],
    })
    expect((await putItem(id, { ...body, priceIdr: 30000 })).status).toBe(200)
    const second = await createOrder({
      lines: [line({ menuItemId: id, qty: 1, optionIds: ['dingin'] })],
    })
    // Prices are never sent to clients, so read the stored snapshots.
    const totals = await Promise.all(
      [first.orderId, second.orderId].map((orderId) =>
        runInDurableObject(room(), (_, state) =>
          Number(
            state.storage.sql
              .exec(
                'SELECT price_snapshot AS p FROM order_lines WHERE order_id = ?',
                orderId,
              )
              .one().p,
          ),
        ),
      ),
    )
    expect(totals).toEqual([22000, 30000])
  })

  it('a hidden item leaves the waiter menu and refuses new orders', async () => {
    const waiter = await pairDevice('waiter')
    const body = itemBody()
    const id = await addItem(body)
    expect((await putItem(id, { ...body, hidden: true })).status).toBe(200)

    expect((await waiterMenu(waiter.headers)).some((i) => i.id === id)).toBe(
      false,
    )
    const res = await postOrder(
      orderBody({ lines: [line({ menuItemId: id, optionIds: ['dingin'] })] }),
    )
    expect((await rejected(res, 422)).code).toBe('unknown_item')

    const admin = await request('/api/manager/menu', {
      headers: await adminHeaders(),
    })
    const { items } = (await admin.json()) as {
      items: { id: string; hidden: boolean }[]
    }
    expect(items.find((i) => i.id === id)?.hidden).toBe(true)

    expect((await putItem(id, body)).status).toBe(200)
    expect((await waiterMenu(waiter.headers)).some((i) => i.id === id)).toBe(
      true,
    )
  })

  it('a sold-out item stays listed but refuses new orders', async () => {
    const body = itemBody()
    const id = await addItem(body)
    expect((await putItem(id, { ...body, available: false })).status).toBe(200)
    const res = await postOrder(
      orderBody({ lines: [line({ menuItemId: id, optionIds: ['dingin'] })] }),
    )
    expect((await rejected(res, 422)).code).toBe('item_unavailable')
  })

  it.each([
    ['an empty name', { name: ' ' }],
    ['a negative price', { priceIdr: -1 }],
    [
      'a repeated option id',
      {
        modifierGroups: [
          {
            id: 'a',
            name: 'A',
            required: false,
            multi: true,
            options: [
              { id: 'x', name: 'X', priceDeltaIdr: 0 },
              { id: 'x', name: 'Y', priceDeltaIdr: 0 },
            ],
          },
        ],
      },
    ],
  ])('refuses %s', async (_, overrides) => {
    const res = await request('/api/manager/menu', {
      headers: await adminHeaders(),
      body: itemBody(overrides),
    })
    expect((await rejected(res, 422)).code).toBe('invalid_input')
  })

  it('refuses to edit an item that does not exist', async () => {
    const res = await putItem('missing', itemBody())
    expect((await rejected(res, 404)).code).toBe('not_found')
  })
})

describe('manager tables', () => {
  it('a new table reaches the tablet; an inactive one cannot take orders', async () => {
    const waiter = await pairDevice('waiter')
    const label = `Teras ${crypto.randomUUID().slice(0, 4)}`
    const created = await request('/api/manager/tables', {
      headers: await adminHeaders(),
      body: { label, sort: 40, active: true },
    })
    expect(created.status).toBe(201)
    const { table } = (await created.json()) as { table: { id: string } }

    const listed = await request('/api/tables', { headers: waiter.headers })
    const { tables } = tablesSchema.parse(await listed.json())
    expect(tables).toContainEqual({ id: table.id, label })

    const off = await request(`/api/manager/tables/${table.id}`, {
      method: 'PUT',
      headers: await adminHeaders(),
      body: { label, sort: 40, active: false },
    })
    expect(off.status).toBe(200)
    const res = await postOrder(
      orderBody({ destination: { type: 'table', tableId: table.id } }),
    )
    expect((await rejected(res, 422)).code).toBe('invalid_input')
  })
})
