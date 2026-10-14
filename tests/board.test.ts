import { evictDurableObject } from 'cloudflare:test'
import { env } from 'cloudflare:workers'
import { describe, expect, it } from 'vitest'
import { createOrderResultSchema } from '../src/shared/order'
import { ORIGIN, openBoardSocket, postOrder, upgrade } from './helpers'

describe('board socket', () => {
  it('sends the current board as soon as a socket connects', async () => {
    const { ws, nextBoard } = await openBoardSocket()
    const board = await nextBoard()
    expect(board.type).toBe('board')
    expect(board.rev).toBeGreaterThanOrEqual(0)
    ws.close()
  })

  it('broadcasts the committed board to every open socket', async () => {
    const a = await openBoardSocket()
    const b = await openBoardSocket()
    const initial = await a.nextBoard()
    await b.nextBoard()

    const res = await postOrder('Meja 07')
    expect(res.status).toBe(201)
    const created = createOrderResultSchema.parse(await res.json())

    for (const socket of [a, b]) {
      const board = await socket.nextBoard()
      expect(board.rev).toBe(initial.rev + 1)
      expect(board.rev).toBe(created.rev)
      expect(board.orders.map((o) => o.id)).toContain(created.orderId)
      socket.ws.close()
    }
  })

  it('keeps hibernated sockets and rebuilds the board from storage after eviction', async () => {
    const { ws, nextBoard } = await openBoardSocket()
    const initial = await nextBoard()
    await postOrder('Meja 01')
    expect((await nextBoard()).rev).toBe(initial.rev + 1)

    await evictDurableObject(env.VENUE_ROOM.getByName('main'), {
      webSockets: 'hibernate',
    })

    await postOrder('Meja 02')
    const board = await nextBoard()
    expect(board.rev).toBe(initial.rev + 2)
    expect(board.orders.map((o) => o.tableLabel)).toEqual(
      expect.arrayContaining(['Meja 01', 'Meja 02']),
    )
    ws.close()
  })

  it('rejects upgrades without the dev key', async () => {
    const res = await upgrade({ Origin: ORIGIN })
    expect(res.status).toBe(401)
  })

  it('rejects upgrades from another origin', async () => {
    const res = await upgrade({
      Origin: 'http://evil.test',
      'x-dev-key': 'test-dev-key',
    })
    expect(res.status).toBe(403)
  })
})
