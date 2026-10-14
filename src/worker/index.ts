import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import { z } from 'zod'
import { tvControlSchema } from '../shared/board'
import { commandSchema } from '../shared/commands'
import { createOrderSchema, ROLES } from '../shared/order'
import { devLogin, devLoginSchema, requireDevKey } from './dev-auth'
import type { Actor, Result } from './orders'

export { VenueRoom } from './venue-room'

// Single restaurant pilot: every device talks to the same room.
const VENUE_ID = 'main'

// TEMP-AUTH: the dev key acts as a manager until devices and staff exist.
const DEV_ACTOR: Actor = {
  role: 'manager',
  deviceId: 'dev',
  staffId: null,
  managerUser: null,
}

function venueRoom(env: Env) {
  // Placement hint only applies when the object is first created.
  return env.VENUE_ROOM.getByName(VENUE_ID, { locationHint: 'apac-se' })
}

function invalidInput<T extends z.ZodType>(
  target: 'json' | 'param' | 'query',
  schema: T,
) {
  return zValidator(target, schema, (result, c) => {
    if (!result.success) {
      return c.json(
        {
          error: {
            code: 'invalid_input',
            message: 'Ada isian yang kosong atau terlalu panjang.',
            details: {
              issues: result.error.issues.map((issue) => ({
                path: issue.path.filter((p) => typeof p !== 'symbol'),
                message: issue.message,
              })),
            },
          },
        },
        422,
      )
    }
  })
}

function reply<T>(
  c: { json: (body: unknown, status: Result<T>['status']) => Response },
  result: Result<T>,
) {
  return c.json(result.body, result.status)
}

const orderParam = z.object({ id: z.string().min(1).max(64) })

const app = new Hono<{ Bindings: Env }>()

app.get('/api/health', (c) =>
  c.json({ ok: true, environment: c.env.ENVIRONMENT }),
)

// TEMP-AUTH
app.post('/api/dev/login', invalidInput('json', devLoginSchema), (c) =>
  devLogin(c, c.req.valid('json').key),
)

// Everything registered below needs the dev key.
app.use('/api/*', requireDevKey) // TEMP-AUTH

// TEMP-AUTH
app.get('/api/dev/session', (c) => c.body(null, 204))

app.get(
  '/api/ws',
  // TEMP-AUTH: the role comes from the device credential once enrollment exists.
  invalidInput('query', z.object({ role: z.enum(ROLES).default('manager') })),
  (c) => {
    if (c.req.header('Upgrade') !== 'websocket') {
      return c.text('Expected websocket', 426)
    }
    if (c.req.header('Origin') !== new URL(c.req.url).origin) {
      return c.text('Forbidden', 403)
    }
    const { role } = c.req.valid('query')
    // The room trusts only headers the Worker sets itself.
    const headers = new Headers(c.req.raw.headers)
    for (const name of [...headers.keys()]) {
      if (name.startsWith('x-kds-')) headers.delete(name)
    }
    headers.set('x-kds-role', role)
    headers.set('x-kds-device', `dev-${role}`)
    return venueRoom(c.env).fetch(new Request(c.req.raw, { headers }))
  },
)

app.get('/api/board', async (c) => c.json(await venueRoom(c.env).getBoard()))
app.get('/api/menu', async (c) => c.json(await venueRoom(c.env).getMenu()))
app.get('/api/tables', async (c) => c.json(await venueRoom(c.env).getTables()))

app.post('/api/orders', invalidInput('json', createOrderSchema), async (c) => {
  const result = await venueRoom(c.env).createOrder(
    DEV_ACTOR,
    c.req.valid('json'),
    Date.now(),
  )
  return reply(c, result)
})

app.get('/api/orders/:id', invalidInput('param', orderParam), async (c) =>
  reply(c, await venueRoom(c.env).getOrder(c.req.valid('param').id)),
)

app.post(
  '/api/orders/:id/commands',
  invalidInput('param', orderParam),
  invalidInput('json', commandSchema),
  async (c) => {
    const result = await venueRoom(c.env).command(
      DEV_ACTOR,
      c.req.valid('param').id,
      c.req.valid('json'),
      Date.now(),
    )
    return reply(c, result)
  },
)

app.post(
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
    const room = venueRoom(c.env)
    const body = c.req.valid('json')
    const { tvControl } = await room.getBoard()
    const next = tvControlSchema.parse(
      body.action === 'page'
        ? { ...tvControl, page: body.page }
        : { ...tvControl, paused: body.action === 'pause' },
    )
    return reply(c, await room.controlTv(DEV_ACTOR, next))
  },
)

app.post('/api/manager/service-day/open', async (c) =>
  reply(c, await venueRoom(c.env).openServiceDay(DEV_ACTOR)),
)

app.post(
  '/api/manager/service-day/close',
  invalidInput('json', z.object({ force: z.boolean().default(false) })),
  async (c) =>
    reply(
      c,
      await venueRoom(c.env).closeServiceDay(
        DEV_ACTOR,
        c.req.valid('json').force,
      ),
    ),
)

export default app
