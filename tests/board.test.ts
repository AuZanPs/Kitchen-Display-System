import { evictDurableObject } from 'cloudflare:test'
import { exports } from 'cloudflare:workers'
import { describe, expect, it } from 'vitest'
import {
  adminHeaders,
  command,
  createOrder,
  getBoard,
  ORIGIN,
  openBoardSocket,
  postJson,
  room,
  upgrade,
} from './helpers'

describe('board socket', () => {
  it('answers health checks', async () => {
    const res = await exports.default.fetch(`${ORIGIN}/api/health`)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, environment: 'development' })
  })

  it('sends the current board as soon as a socket connects', async () => {
    const { ws, nextBoard } = await openBoardSocket()
    const board = await nextBoard()
    expect(board).toMatchObject({ type: 'board', serviceOpen: true })
    expect(board.rev).toBeGreaterThanOrEqual(0)
    ws.close()
  })

  it('broadcasts the committed board to every open socket', async () => {
    const a = await openBoardSocket()
    const b = await openBoardSocket()
    const initial = await a.nextBoard()
    await b.nextBoard()

    const created = await createOrder()
    for (const socket of [a, b]) {
      const board = await socket.nextBoard()
      expect(board.rev).toBe(initial.rev + 1)
      expect(board.rev).toBe(created.rev)
      expect(board.orders.map((o) => o.id)).toContain(created.orderId)
      socket.ws.close()
    }
  })

  it('lists orders oldest first and keeps served ones briefly', async () => {
    const first = await createOrder()
    const second = await createOrder()
    await command(first.orderId, { type: 'accept', expectedVersion: 1 })
    await command(first.orderId, { type: 'ready', expectedVersion: 2 })
    await command(first.orderId, { type: 'serve', expectedVersion: 3 })
    const ids = (await getBoard()).orders.map((o) => o.id)
    expect(ids.indexOf(first.orderId)).toBeGreaterThanOrEqual(0)
    expect(ids.indexOf(first.orderId)).toBeLessThan(ids.indexOf(second.orderId))
  })

  it('keeps hibernated sockets and rebuilds the board from storage after eviction', async () => {
    const { ws, nextBoard } = await openBoardSocket()
    const initial = await nextBoard()
    await createOrder({ destination: { type: 'table', tableId: 't01' } })
    expect((await nextBoard()).rev).toBe(initial.rev + 1)

    await evictDurableObject(room(), { webSockets: 'hibernate' })

    await createOrder({ destination: { type: 'table', tableId: 't02' } })
    const board = await nextBoard()
    expect(board.rev).toBe(initial.rev + 2)
    expect(board.instanceStartedAt).not.toBe(initial.instanceStartedAt)
    expect(board.orders.map((o) => o.table)).toEqual(
      expect.arrayContaining(['Meja 1', 'Meja 2']),
    )
    ws.close()
  })

  it('rejects upgrades without a paired device', async () => {
    const res = await upgrade({ Origin: ORIGIN })
    expect(res.status).toBe(401)
  })

  it('rejects upgrades from another origin', async () => {
    const res = await upgrade({
      Origin: 'http://evil.test',
      ...(await adminHeaders()),
    })
    expect(res.status).toBe(403)
  })

  it('closes a non-TV socket that sends anything but ping', async () => {
    const { ws, nextBoard } = await openBoardSocket('waiter')
    await nextBoard()
    const closed = new Promise<number>((resolve) =>
      ws.addEventListener('close', (event) => resolve(event.code)),
    )
    ws.send(JSON.stringify({ type: 'rendered', items: [] }))
    expect(await closed).toBe(1003)
  })
})

describe('kitchen TV', () => {
  it('counts connected TVs', async () => {
    const watcher = await openBoardSocket()
    const before = (await watcher.nextBoard()).tvCount
    const tv = await openBoardSocket('tv')
    expect((await watcher.nextBoard()).tvCount).toBe(before + 1)
    tv.ws.close()
    expect((await watcher.nextBoard()).tvCount).toBe(before)
    watcher.ws.close()
  })

  it('marks an order shown on TV only for the version the TV rendered', async () => {
    const tv = await openBoardSocket('tv')
    await tv.nextBoard()
    const { orderId } = await createOrder()
    const board = await tv.boardWhere((b) =>
      b.orders.some((o) => o.id === orderId),
    )

    tv.ws.send(
      JSON.stringify({
        type: 'rendered',
        items: [{ id: orderId, version: 1 }],
      }),
    )
    const shown = await tv.boardWhere((b) => b.rev > board.rev)
    expect(shown.orders.find((o) => o.id === orderId)?.shownOnTv).toBe(true)

    // A new version is not shown until the TV renders it again.
    await command(orderId, { type: 'accept', expectedVersion: 1 })
    const accepted = await tv.nextBoard()
    expect(accepted.orders.find((o) => o.id === orderId)?.shownOnTv).toBe(false)

    // Old, repeated or unknown receipts change nothing: the next board is the next order.
    tv.ws.send(
      JSON.stringify({
        type: 'rendered',
        items: [
          { id: orderId, version: 1 },
          { id: 'unknown', version: 1 },
          { id: orderId, version: 99 },
        ],
      }),
    )
    const next = await createOrder()
    expect((await tv.nextBoard()).rev).toBe(next.rev)
    expect(next.rev).toBe(accepted.rev + 1)
    tv.ws.close()
  })

  it('pauses and pages through kitchen control', async () => {
    const res = await postJson('/api/tv/control', { action: 'pause' })
    expect(res.status).toBe(200)
    expect((await getBoard()).tvControl).toEqual({ paused: true, page: 0 })
    await postJson('/api/tv/control', { action: 'page', page: 2 })
    await postJson('/api/tv/control', { action: 'resume' })
    expect((await getBoard()).tvControl).toEqual({ paused: false, page: 2 })
  })
})

describe('venue settings', () => {
  it('start clean, then follow the admin and reach open sockets', async () => {
    expect((await getBoard()).settings).toEqual({
      allergy: false,
      lineNotes: true,
      orderNote: true,
      staffPins: false,
    })
    const { ws, nextBoard } = await openBoardSocket()
    await nextBoard()
    const detailed = {
      allergy: true,
      lineNotes: true,
      orderNote: false,
      staffPins: false,
    }
    expect((await postJson('/api/admin/settings', detailed)).status).toBe(200)
    expect((await nextBoard()).settings).toEqual(detailed)
    ws.close()
  })

  it('rejects a partial settings body', async () => {
    const res = await postJson('/api/admin/settings', { allergy: true })
    expect(res.status).toBe(422)
  })
})
