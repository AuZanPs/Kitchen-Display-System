import { Hono } from 'hono'
import { z } from 'zod'
import { tvControlSchema } from '../../shared/board'
import { commandSchema } from '../../shared/commands'
import { createOrderSchema } from '../../shared/order'
import { credentials } from '../auth/session'
import {
  type AppEnv,
  idParam,
  invalidInput,
  reply,
  roomOf,
  venueRoom,
} from './common'

/** What a paired screen uses: who it is, the live board, the menu and orders. */
export const screens = new Hono<AppEnv>()

screens.get('/api/session', async (c) =>
  reply(c, await venueRoom(c).session(await credentials(c, roomOf(c)))),
)

screens.get('/api/ws', async (c) => {
  if (c.req.header('Upgrade') !== 'websocket') {
    return c.text('Expected websocket', 426)
  }
  const who = await credentials(c, roomOf(c))
  if (who.kind === 'none') return c.text('Unauthenticated', 401)
  // The room trusts only headers the Worker sets itself.
  const headers = new Headers(c.req.raw.headers)
  for (const name of [...headers.keys()]) {
    if (name.startsWith('x-kds-')) headers.delete(name)
  }
  if (who.kind === 'admin') {
    headers.set('x-kds-admin', who.epoch)
  } else {
    headers.set('x-kds-device-id', who.deviceId)
    headers.set('x-kds-device-secret', who.secret)
  }
  return venueRoom(c).fetch(new Request(c.req.raw, { headers }))
})

screens.get('/api/board', async (c) =>
  reply(c, await venueRoom(c).getBoard(await credentials(c, roomOf(c)))),
)
screens.get('/api/menu', async (c) =>
  reply(c, await venueRoom(c).getMenu(await credentials(c, roomOf(c)))),
)
screens.get('/api/tables', async (c) =>
  reply(c, await venueRoom(c).getTables(await credentials(c, roomOf(c)))),
)

screens.post(
  '/api/orders',
  invalidInput('json', createOrderSchema),
  async (c) => {
    const result = await venueRoom(c).createOrder(
      await credentials(c, roomOf(c)),
      c.req.valid('json'),
      Date.now(),
    )
    return reply(c, result)
  },
)

screens.get('/api/orders/:id', invalidInput('param', idParam), async (c) =>
  reply(
    c,
    await venueRoom(c).getOrder(
      await credentials(c, roomOf(c)),
      c.req.valid('param').id,
    ),
  ),
)

screens.post(
  '/api/orders/:id/commands',
  invalidInput('param', idParam),
  invalidInput('json', commandSchema),
  async (c) => {
    const result = await venueRoom(c).command(
      await credentials(c, roomOf(c)),
      c.req.valid('param').id,
      c.req.valid('json'),
      Date.now(),
    )
    return reply(c, result)
  },
)

screens.post(
  '/api/tv/control',
  invalidInput(
    'json',
    z.discriminatedUnion('action', [
      z.object({ action: z.literal('pause') }),
      z.object({ action: z.literal('resume') }),
      z.object({ action: z.literal('page'), page: z.number().int().min(0) }),
    ]),
  ),
  async (c) => {
    const room = venueRoom(c)
    const body = c.req.valid('json')
    const tvControl = await room.getTvControl()
    const next = tvControlSchema.parse(
      body.action === 'page'
        ? { ...tvControl, page: body.page }
        : { ...tvControl, paused: body.action === 'pause' },
    )
    return reply(c, await room.controlTv(await credentials(c, roomOf(c)), next))
  },
)
