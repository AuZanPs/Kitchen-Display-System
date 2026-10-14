import { runInDurableObject } from 'cloudflare:test'
import { env } from 'cloudflare:workers'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { createOrderResultSchema, LIMITS } from '../src/shared/order'
import type { Actor } from '../src/worker/orders'
import {
  createOrder,
  getBoard,
  line,
  openBoardSocket,
  orderBody,
  postOrder,
  rejected,
  room,
} from './helpers'

const lineProblems = z.object({
  lines: z.array(z.object({ index: z.number(), code: z.string() })),
})
const zodIssues = z.object({
  issues: z.array(
    z.object({ path: z.array(z.union([z.string(), z.number()])) }),
  ),
})

const manager: Actor = {
  role: 'manager',
  deviceId: 'test',
  staffId: null,
  managerUser: null,
}

async function countRows(table: string, orderId: string) {
  return runInDurableObject(room(), (_, state) =>
    Number(
      state.storage.sql
        .exec(`SELECT count(*) AS n FROM ${table} WHERE order_id = ?`, orderId)
        .one().n,
    ),
  )
}

describe('POST /api/orders', () => {
  it('stores the order with its lines and puts it on the board', async () => {
    const created = await createOrder({
      lines: [
        line({
          qty: 3,
          optionIds: ['extra-pedas', 'telur-ceplok'],
          note: 'Tanpa kerupuk',
        }),
        line({ menuItemId: 'es-teh-lemon', qty: 1, optionIds: [] }),
      ],
      orderNote: 'Antar bersamaan',
    })
    const order = (await getBoard()).orders.find(
      (o) => o.id === created.orderId,
    )
    expect(order).toMatchObject({
      ticketNo: created.ticketNo,
      status: 'new',
      version: 1,
      takeaway: false,
      table: 'Meja 7',
      orderNote: 'Antar bersamaan',
      changePending: false,
      cancelRequested: false,
      shownOnTv: false,
    })
    expect(order?.lines).toMatchObject([
      {
        name: 'Nasi Goreng Kampung',
        qty: 3,
        modifiers: ['Extra pedas', 'Telur ceplok'],
        note: 'Tanpa kerupuk',
        allergy: null,
        addedInVersion: 1,
      },
      { name: 'Es Teh Lemon', qty: 1, modifiers: [], note: null },
    ])
    expect(await countRows('order_events', created.orderId)).toBe(1)
  })

  it('takes prices from the menu and ignores prices sent by the client', async () => {
    const res = await postOrder({
      ...orderBody(),
      lines: [
        {
          ...line({ optionIds: ['tidak-pedas', 'telur-ceplok'] }),
          priceIdr: 1,
        },
      ],
    })
    const created = createOrderResultSchema.parse(await res.json())
    const price = await runInDurableObject(
      room(),
      (_, state) =>
        state.storage.sql
          .exec(
            'SELECT price_snapshot AS p FROM order_lines WHERE order_id = ?',
            created.orderId,
          )
          .one().p,
    )
    expect(price).toBe(42000 + 5000)
  })

  it('returns the original order when the same operation is sent twice', async () => {
    const body = orderBody()
    const [first, second] = await Promise.all([
      postOrder(body),
      postOrder(body),
    ])
    const a = createOrderResultSchema.parse(await first.json())
    const b = createOrderResultSchema.parse(await second.json())
    expect([first.status, second.status]).toEqual([201, 201])
    expect(b.orderId).toBe(a.orderId)
    expect(b.ticketNo).toBe(a.ticketNo)

    // A retry after a lost response: same ticket, rev unchanged, marked replayed.
    const revBefore = (await getBoard()).rev
    const retry = createOrderResultSchema.parse(
      await (await postOrder(body)).json(),
    )
    expect(retry).toMatchObject({
      orderId: a.orderId,
      ticketNo: a.ticketNo,
      replayed: true,
    })
    expect((await getBoard()).rev).toBe(revBefore)
    expect(await countRows('order_lines', a.orderId)).toBe(1)
  })

  it('rejects a reused operation id with a different payload', async () => {
    const body = orderBody()
    expect((await postOrder(body)).status).toBe(201)
    const error = await rejected(
      await postOrder({ ...body, lines: [line({ qty: 5 })] }),
      409,
    )
    expect(error.code).toBe('operation_conflict')
  })

  it('numbers tickets one after another', async () => {
    const a = await createOrder()
    const b = await createOrder()
    expect(b.ticketNo).toBe(a.ticketNo + 1)
  })

  it('accepts takeaway orders without a table', async () => {
    const created = await createOrder({ destination: { type: 'takeaway' } })
    const order = (await getBoard()).orders.find(
      (o) => o.id === created.orderId,
    )
    expect(order).toMatchObject({ takeaway: true, table: null })
  })

  describe('rejects with 422 and stores nothing', () => {
    it.each([
      [
        'unknown item',
        [line(), line({ menuItemId: 'pizza' })],
        'unknown_item',
        1,
      ],
      [
        'missing required option',
        [line({ optionIds: [] })],
        'invalid_modifier',
        0,
      ],
      [
        'two choices in a single-choice group',
        [line({ optionIds: ['tidak-pedas', 'extra-pedas'] })],
        'invalid_modifier',
        0,
      ],
      [
        'option from another item',
        [line({ optionIds: ['tidak-pedas', 'tanpa-es'] })],
        'invalid_modifier',
        0,
      ],
    ])('%s', async (_, lines, code, index) => {
      const error = await rejected(await postOrder(orderBody({ lines })), 422)
      expect(error.code).toBe(code)
      expect(lineProblems.parse(error.details).lines[0]?.index).toBe(index)
    })

    it('unavailable item, flagging only that line', async () => {
      await runInDurableObject(room(), (_, state) => {
        state.storage.sql.exec(
          "UPDATE menu_items SET available = 0 WHERE id = 'sate-ayam'",
        )
      })
      const error = await rejected(
        await postOrder(
          orderBody({
            lines: [line(), line({ menuItemId: 'sate-ayam', optionIds: [] })],
          }),
        ),
        422,
      )
      expect(error.code).toBe('item_unavailable')
      expect(lineProblems.parse(error.details).lines).toEqual([
        expect.objectContaining({ index: 1, code: 'item_unavailable' }),
      ])
    })

    it('unknown table', async () => {
      const error = await rejected(
        await postOrder(
          orderBody({ destination: { type: 'table', tableId: 't99' } }),
        ),
        422,
      )
      expect(error.code).toBe('invalid_input')
    })

    it.each([
      ['no lines', { lines: [] }],
      [
        '26 lines',
        { lines: Array.from({ length: LIMITS.lines + 1 }, () => line()) },
      ],
      ['quantity 0', { lines: [line({ qty: 0 })] }],
      ['quantity 21', { lines: [line({ qty: LIMITS.qty + 1 })] }],
      ['fractional quantity', { lines: [line({ qty: 1.5 })] }],
      [
        'line note of 121',
        { lines: [line({ note: 'n'.repeat(LIMITS.lineNote + 1) })] },
      ],
      ['order note of 201', { orderNote: 'o'.repeat(LIMITS.orderNote + 1) }],
      ['missing operation id', { operationId: 'not-a-uuid' }],
    ])('%s', async (_, overrides) => {
      const error = await rejected(await postOrder(orderBody(overrides)), 422)
      expect(error.code).toBe('invalid_input')
    })
  })

  it('rejects allergy text over the limit instead of truncating it', async () => {
    const body = orderBody({
      lines: [line({ allergy: 'u'.repeat(LIMITS.allergy + 1) })],
    })
    const error = await rejected(await postOrder(body), 422)
    expect(zodIssues.parse(error.details).issues[0]?.path).toEqual([
      'lines',
      0,
      'allergy',
    ])

    // Nothing was stored under that operation, so the corrected draft goes through.
    const allergy = 'u'.repeat(LIMITS.allergy)
    const res = await postOrder({ ...body, lines: [line({ allergy })] })
    expect(res.status).toBe(201)
    const created = createOrderResultSchema.parse(await res.json())
    const order = (await getBoard()).orders.find(
      (o) => o.id === created.orderId,
    )
    expect(order?.lines[0]?.allergy).toBe(allergy)
  })

  it('accepts the largest order: 25 lines with full notes and allergies', async () => {
    const lines = Array.from({ length: LIMITS.lines }, () =>
      line({
        qty: LIMITS.qty,
        note: 'n'.repeat(LIMITS.lineNote),
        allergy: 'a'.repeat(LIMITS.allergy),
      }),
    )
    const res = await postOrder(
      orderBody({ lines, orderNote: 'o'.repeat(LIMITS.orderNote) }),
    )
    expect(res.status).toBe(201)
  })

  it('broadcasts a strictly increasing rev, one per committed order', async () => {
    const { ws, nextBoard, pending } = await openBoardSocket()
    const initial = await nextBoard()

    const body = orderBody()
    await postOrder(body)
    await postOrder(body) // replay: no commit, no board
    await postOrder(orderBody({ lines: [] })) // rejected: no board
    await postOrder()

    const revs = [(await nextBoard()).rev, (await nextBoard()).rev]
    expect(revs).toEqual([initial.rev + 1, initial.rev + 2])
    expect(pending()).toBe(0)
    ws.close()
  })
})

describe('service day', () => {
  const stub = () => env.VENUE_ROOM.getByName('service-day-test')

  it('refuses new orders while closed and restarts numbering on a new date', async () => {
    const first = await stub().createOrder(manager, orderBody(), Date.now())
    expect(first.ok).toBe(true)

    // Pretend yesterday's service is still open with a high counter.
    await runInDurableObject(stub(), (_, state) => {
      state.storage.sql.exec(
        "UPDATE meta SET value = '2020-01-01' WHERE key = 'service_day'",
      )
      state.storage.sql.exec(
        "UPDATE meta SET value = '41' WHERE key = 'ticket_counter'",
      )
    })

    const refused = await stub().closeServiceDay(manager, false)
    expect(refused).toMatchObject({ ok: false, status: 422 })
    expect((await stub().closeServiceDay(manager, true)).ok).toBe(true)

    const closed = await stub().createOrder(manager, orderBody(), Date.now())
    expect(closed).toMatchObject({
      ok: false,
      body: { error: { code: 'service_closed' } },
    })

    expect((await stub().openServiceDay(manager)).ok).toBe(true)
    const next = await stub().createOrder(manager, orderBody(), Date.now())
    expect(next).toMatchObject({ ok: true, body: { ticketNo: 1 } })
    expect((await stub().getBoard()).serviceOpen).toBe(true)
  })

  it('reopening on the same date keeps the ticket numbers going', async () => {
    const a = await stub().createOrder(manager, orderBody(), Date.now())
    await stub().closeServiceDay(manager, true)
    await stub().openServiceDay(manager)
    const b = await stub().createOrder(manager, orderBody(), Date.now())
    if (!a.ok || !b.ok) throw new Error('create failed')
    expect(b.body.ticketNo).toBe(a.body.ticketNo + 1)
  })

  it('only managers open or close the day', async () => {
    const waiter: Actor = { ...manager, role: 'waiter' }
    expect(await stub().openServiceDay(waiter)).toMatchObject({ status: 403 })
    expect(await stub().closeServiceDay(waiter, true)).toMatchObject({
      status: 403,
    })
  })
})

describe('role guard inside the room', () => {
  it.each(['kitchen', 'tv'] as const)(
    'refuses create from %s',
    async (role) => {
      const result = await room().createOrder(
        { ...manager, role },
        orderBody(),
        Date.now(),
      )
      expect(result).toMatchObject({ ok: false, status: 403 })
    },
  )
})
