import { exports } from 'cloudflare:workers'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { boardOrderSchema } from '../src/shared/board'
import { commandSchema } from '../src/shared/commands'
import {
  adminHeaders,
  boardOrder,
  command,
  createOrder,
  deviceCredentials,
  line,
  ORIGIN,
  postCommand,
  rejected,
  room,
} from './helpers'

const staleDetails = z.object({
  current: boardOrderSchema,
  changes: z.array(z.string()),
})

const history = z.object({
  events: z.array(
    z.object({ type: z.string(), version: z.number(), summary: z.string() }),
  ),
})

async function getHistory(orderId: string) {
  const res = await exports.default.fetch(`${ORIGIN}/api/orders/${orderId}`, {
    headers: await adminHeaders(),
  })
  expect(res.status).toBe(200)
  return history.parse(await res.json()).events
}

describe('order lifecycle', () => {
  it('goes new, accepted, ready, served with a version per step', async () => {
    const { orderId } = await createOrder()
    expect(
      await command(orderId, { type: 'accept', expectedVersion: 1 }),
    ).toMatchObject({ version: 2, status: 'accepted', noop: false })
    expect(
      await command(orderId, { type: 'ready', expectedVersion: 2 }),
    ).toMatchObject({
      version: 3,
      status: 'ready',
    })
    expect(
      await command(orderId, { type: 'serve', expectedVersion: 3 }),
    ).toMatchObject({
      version: 4,
      status: 'served',
    })
    const order = await boardOrder(orderId)
    expect(order.status).toBe('served')
    expect(order.acceptedAt).not.toBeNull()
    expect(order.readyAt).not.toBeNull()
    expect(order.servedAt).not.toBeNull()
    expect((await getHistory(orderId)).map((e) => e.type)).toEqual([
      'created',
      'accept',
      'ready',
      'serve',
    ])
  })

  it('needs the allergy acknowledged before accepting', async () => {
    const { orderId } = await createOrder({
      lines: [line({ allergy: 'Udang' })],
    })
    const error = await rejected(
      await postCommand(orderId, { type: 'accept', expectedVersion: 1 }),
      422,
    )
    expect(error.code).toBe('allergy_ack_required')
    await command(orderId, {
      type: 'accept',
      expectedVersion: 1,
      allergyAcknowledged: true,
    })
  })

  it('treats a second tap on the same button as a noop', async () => {
    const { orderId } = await createOrder()
    await command(orderId, { type: 'accept', expectedVersion: 1 })
    const again = await command(orderId, { type: 'accept', expectedVersion: 1 })
    expect(again).toMatchObject({ noop: true, version: 2, status: 'accepted' })
  })

  it('returns 409 with the current order and what changed for a stale version', async () => {
    const { orderId } = await createOrder()
    await command(orderId, { type: 'accept', expectedVersion: 1 })
    await command(orderId, {
      type: 'requestCancel',
      expectedVersion: 2,
      reason: 'Tamu pergi',
    })
    const error = await rejected(
      await postCommand(orderId, {
        type: 'moveTable',
        expectedVersion: 1,
        tableId: 't03',
      }),
      409,
    )
    expect(error.code).toBe('stale_version')
    const details = staleDetails.parse(error.details)
    expect(details.current.version).toBe(3)
    expect(details.changes).toEqual([
      'Diterima dapur',
      'Minta pembatalan: Tamu pergi',
    ])
  })

  it('replays a command with the same operation id instead of applying it twice', async () => {
    const { orderId } = await createOrder()
    const body = {
      operationId: crypto.randomUUID(),
      type: 'addLines',
      expectedVersion: 1,
      lines: [line()],
    }
    const first = await command(orderId, body)
    const second = await command(orderId, body)
    expect(second).toMatchObject({ version: first.version, replayed: true })
    expect((await boardOrder(orderId)).lines).toHaveLength(2)

    const error = await rejected(
      await postCommand(orderId, { ...body, lines: [line({ qty: 9 })] }),
      409,
    )
    expect(error.code).toBe('operation_conflict')
  })

  it('returns 404 for an unknown order', async () => {
    const error = await rejected(
      await postCommand('nope', { type: 'accept', expectedVersion: 1 }),
      404,
    )
    expect(error.code).toBe('not_found')
  })
})

describe('changes', () => {
  it('adding to an accepted ticket blocks Ready until the kitchen acknowledges', async () => {
    const { orderId } = await createOrder()
    await command(orderId, { type: 'accept', expectedVersion: 1 })
    await command(orderId, {
      type: 'addLines',
      expectedVersion: 2,
      lines: [line({ menuItemId: 'es-teh-lemon', optionIds: [], qty: 2 })],
    })
    let order = await boardOrder(orderId)
    expect(order.changePending).toBe(true)
    expect(order.pendingChanges).toEqual([
      { version: 3, kind: 'add_lines', summary: 'Tambah 2× Es Teh Lemon' },
    ])
    expect(order.lines.at(-1)?.addedInVersion).toBe(3)

    const error = await rejected(
      await postCommand(orderId, { type: 'ready', expectedVersion: 3 }),
      422,
    )
    expect(error.code).toBe('invalid_transition')

    await command(orderId, { type: 'ackChange', expectedVersion: 3 })
    order = await boardOrder(orderId)
    expect(order.changePending).toBe(false)
    expect(order.pendingChanges).toEqual([])
    await command(orderId, { type: 'ready', expectedVersion: 4 })
  })

  it('a change that adds an allergy needs the allergy confirmation', async () => {
    const { orderId } = await createOrder()
    await command(orderId, { type: 'accept', expectedVersion: 1 })
    await command(orderId, {
      type: 'addLines',
      expectedVersion: 2,
      lines: [line({ allergy: 'Kacang' })],
    })
    const error = await rejected(
      await postCommand(orderId, { type: 'ackChange', expectedVersion: 3 }),
      422,
    )
    expect(error.code).toBe('allergy_ack_required')
    await command(orderId, {
      type: 'ackChange',
      expectedVersion: 3,
      allergyAcknowledged: true,
    })
  })

  it('adding after Ready creates a linked ticket and leaves the original alone', async () => {
    const original = await createOrder()
    await command(original.orderId, { type: 'accept', expectedVersion: 1 })
    await command(original.orderId, { type: 'ready', expectedVersion: 2 })
    const result = await command(original.orderId, {
      type: 'addLines',
      expectedVersion: 3,
      lines: [line({ menuItemId: 'jus-jeruk', optionIds: [] })],
    })
    expect(result.version).toBe(3)
    expect(result.linkedTicketNo).toBeGreaterThan(original.ticketNo)
    const linkedId = result.linkedOrderId ?? ''
    const linked = await boardOrder(linkedId)
    expect(linked).toMatchObject({
      linkedTo: original.orderId,
      status: 'new',
      table: 'Meja 7',
    })
    expect((await boardOrder(original.orderId)).lines).toHaveLength(1)
  })

  it('moving a table is audited and needs acknowledgement before it is cooked', async () => {
    const { orderId } = await createOrder()
    await command(orderId, {
      type: 'moveTable',
      expectedVersion: 1,
      tableId: 't03',
    })
    const order = await boardOrder(orderId)
    expect(order).toMatchObject({
      table: 'Meja 3',
      changePending: true,
      version: 2,
    })
    expect(order.pendingChanges[0]?.summary).toBe(
      'Pindah dari Meja 7 ke Meja 3',
    )

    const same = await rejected(
      await postCommand(orderId, {
        type: 'moveTable',
        expectedVersion: 2,
        tableId: 't03',
      }),
      422,
    )
    expect(same.code).toBe('invalid_input')
  })

  it('moving a ready ticket needs no acknowledgement', async () => {
    const { orderId } = await createOrder()
    await command(orderId, { type: 'accept', expectedVersion: 1 })
    await command(orderId, { type: 'ready', expectedVersion: 2 })
    await command(orderId, {
      type: 'moveTable',
      expectedVersion: 3,
      tableId: 't01',
    })
    expect(await boardOrder(orderId)).toMatchObject({
      table: 'Meja 1',
      changePending: false,
      status: 'ready',
    })
  })
})

describe('cancellation', () => {
  it('a cancel request blocks Ready and Served until the kitchen confirms', async () => {
    const { orderId } = await createOrder()
    await command(orderId, { type: 'accept', expectedVersion: 1 })
    await command(orderId, {
      type: 'requestCancel',
      expectedVersion: 2,
      reason: 'Tamu pergi',
    })
    expect(await boardOrder(orderId)).toMatchObject({
      cancelRequested: true,
      cancelReason: 'Tamu pergi',
    })
    const error = await rejected(
      await postCommand(orderId, { type: 'ready', expectedVersion: 3 }),
      422,
    )
    expect(error.code).toBe('invalid_transition')

    await command(orderId, { type: 'ackCancel', expectedVersion: 3 })
    const order = await boardOrder(orderId)
    expect(order).toMatchObject({
      status: 'cancelled',
      cancelRequested: false,
      cancelReason: 'Tamu pergi',
    })
    expect(order.cancelledAt).not.toBeNull()
  })

  it('a manager override cancels at once and is flagged in history', async () => {
    const { orderId } = await createOrder()
    await command(orderId, {
      type: 'managerCancel',
      expectedVersion: 1,
      reason: 'Pesanan ganda',
    })
    expect((await boardOrder(orderId)).status).toBe('cancelled')
    const events = await getHistory(orderId)
    expect(events.at(-1)).toMatchObject({
      type: 'managerCancel',
      summary: 'Dibatalkan manajer: Pesanan ganda',
    })
  })

  it('a reason is required', async () => {
    const { orderId } = await createOrder()
    const error = await rejected(
      await postCommand(orderId, {
        type: 'requestCancel',
        expectedVersion: 1,
        reason: ' ',
      }),
      422,
    )
    expect(error.code).toBe('invalid_input')
  })
})

describe('role guard inside the room', () => {
  it.each([
    ['waiter', 'accept'],
    ['waiter', 'ready'],
    ['kitchen', 'serve'],
    ['kitchen', 'addLines'],
    ['tv', 'accept'],
    ['tv', 'serve'],
    ['waiter', 'managerCancel'],
    ['kitchen', 'managerCancel'],
  ] as const)('%s cannot %s', async (role, type) => {
    const { orderId } = await createOrder()
    const body =
      type === 'addLines'
        ? { type, lines: [line()] }
        : type === 'managerCancel'
          ? { type, reason: 'x' }
          : { type }
    const result = await room().command(
      await deviceCredentials(room(), role),
      orderId,
      commandSchema.parse({
        operationId: crypto.randomUUID(),
        expectedVersion: 1,
        ...body,
      }),
      Date.now(),
    )
    expect(result).toMatchObject({ ok: false, status: 403 })
  })
})
