import { zValidator } from '@hono/zod-validator'
import { type Context, Hono, type MiddlewareHandler } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { z } from 'zod'
import { settingsSchema, tvControlSchema } from '../shared/board'
import { commandSchema } from '../shared/commands'
import { createOrderSchema } from '../shared/order'
import {
  clearAdminSession,
  clearDeviceCookie,
  credentials,
  hasAdminSession,
  ipHash,
  isAdminPassword,
  setAdminSession,
  setDeviceCookie,
} from './auth/session'
import { approveSchema, pollSchema } from './devices'
import type { Result } from './orders'

export { VenueRoom } from './venue-room'

// Single restaurant pilot: every device talks to the same room.
const VENUE_ID = 'main'
const MAX_BODY_BYTES = 64 * 1024

type AppEnv = { Bindings: Env }

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

function refuse(c: Context, status: 401 | 403, message: string) {
  return c.json(
    {
      error: {
        code: status === 401 ? 'unauthenticated' : 'forbidden',
        message,
      },
    },
    status,
  )
}

/**
 * Cookies ride along on cross-site requests, so anything that changes state
 * (and every socket) must come from this exact origin.
 */
const sameOrigin: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (c.req.header('Sec-Fetch-Site') === 'cross-site') {
    return refuse(c, 403, 'Permintaan lintas situs ditolak.')
  }
  const mutating = c.req.method !== 'GET' && c.req.method !== 'HEAD'
  const socket = c.req.header('Upgrade') === 'websocket'
  if (
    (mutating || socket) &&
    c.req.header('Origin') !== new URL(c.req.url).origin
  ) {
    return refuse(c, 403, 'Asal permintaan tidak dikenal.')
  }
  await next()
}

const requireAdmin: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (!(await hasAdminSession(c))) return refuse(c, 401, 'Masuk sebagai admin.')
  await next()
}

const orderParam = z.object({ id: z.string().min(1).max(64) })
const deviceParam = z.object({ id: z.uuid() })

const app = new Hono<AppEnv>()

app.use('/api/*', sameOrigin)
app.use(
  '/api/*',
  bodyLimit({
    maxSize: MAX_BODY_BYTES,
    onError: (c) =>
      c.json(
        {
          error: {
            code: 'invalid_input',
            message: 'Permintaan terlalu besar.',
          },
        },
        413,
      ),
  }),
)

app.get('/api/health', (c) =>
  c.json({ ok: true, environment: c.env.ENVIRONMENT }),
)

// Admin: one password from a secret, a signed 12-hour cookie.
app.post(
  '/api/admin/login',
  invalidInput('json', z.object({ password: z.string().min(1).max(200) })),
  async (c) => {
    const room = venueRoom(c.env)
    // Counted before checking, so a correct guess after the limit still fails.
    const key = `admin-login:${await ipHash(c)}`
    if (!(await room.allowAttempt(key, 5, 60 * 1000))) {
      return c.json(
        {
          error: {
            code: 'rate_limited',
            message: 'Terlalu banyak percobaan. Tunggu satu menit.',
          },
        },
        429,
      )
    }
    if (!(await isAdminPassword(c.env, c.req.valid('json').password))) {
      return refuse(c, 401, 'Kata sandi salah.')
    }
    await setAdminSession(c)
    return c.body(null, 204)
  },
)

app.post('/api/admin/logout', (c) => {
  clearAdminSession(c)
  return c.body(null, 204)
})

app.get('/api/admin/session', requireAdmin, (c) => c.body(null, 204))

// Pairing: the device shows a code, the admin approves it, the device polls.
app.post('/api/devices/enroll/start', async (c) =>
  reply(c, await venueRoom(c.env).startEnrollment(await ipHash(c))),
)

app.post(
  '/api/devices/enroll/poll',
  invalidInput('json', pollSchema),
  async (c) => {
    const result = await venueRoom(c.env).pollEnrollment(c.req.valid('json'))
    if (!result.ok || result.body.status === 'pending') return reply(c, result)
    // The device token only ever travels in the HttpOnly cookie.
    const { token, ...device } = result.body
    setDeviceCookie(c, token)
    return c.json(device)
  },
)

app.post(
  '/api/devices/enroll/approve',
  requireAdmin,
  invalidInput('json', approveSchema),
  async (c) =>
    reply(
      c,
      await venueRoom(c.env).approveEnrollment(
        { kind: 'admin' },
        c.req.valid('json'),
      ),
    ),
)

app.get('/api/devices', requireAdmin, async (c) =>
  reply(c, await venueRoom(c.env).listDevices({ kind: 'admin' })),
)

app.post(
  '/api/devices/:id/revoke',
  requireAdmin,
  invalidInput('param', deviceParam),
  async (c) =>
    reply(
      c,
      await venueRoom(c.env).revokeDevice(
        { kind: 'admin' },
        c.req.valid('param').id,
      ),
    ),
)

/** Forgets this browser's pairing (the device row stays until revoked). */
app.post('/api/devices/forget', (c) => {
  clearDeviceCookie(c)
  return c.body(null, 204)
})

app.get('/api/session', async (c) =>
  reply(c, await venueRoom(c.env).session(await credentials(c))),
)

app.get('/api/ws', async (c) => {
  if (c.req.header('Upgrade') !== 'websocket') {
    return c.text('Expected websocket', 426)
  }
  const who = await credentials(c)
  if (who.kind === 'none') return c.text('Unauthenticated', 401)
  // The room trusts only headers the Worker sets itself.
  const headers = new Headers(c.req.raw.headers)
  for (const name of [...headers.keys()]) {
    if (name.startsWith('x-kds-')) headers.delete(name)
  }
  if (who.kind === 'admin') {
    headers.set('x-kds-admin', '1')
  } else {
    headers.set('x-kds-device-id', who.deviceId)
    headers.set('x-kds-device-secret', who.secret)
  }
  return venueRoom(c.env).fetch(new Request(c.req.raw, { headers }))
})

app.get('/api/board', async (c) =>
  reply(c, await venueRoom(c.env).getBoard(await credentials(c))),
)
app.get('/api/menu', async (c) =>
  reply(c, await venueRoom(c.env).getMenu(await credentials(c))),
)
app.get('/api/tables', async (c) =>
  reply(c, await venueRoom(c.env).getTables(await credentials(c))),
)

app.post('/api/orders', invalidInput('json', createOrderSchema), async (c) => {
  const result = await venueRoom(c.env).createOrder(
    await credentials(c),
    c.req.valid('json'),
    Date.now(),
  )
  return reply(c, result)
})

app.get('/api/orders/:id', invalidInput('param', orderParam), async (c) =>
  reply(
    c,
    await venueRoom(c.env).getOrder(
      await credentials(c),
      c.req.valid('param').id,
    ),
  ),
)

app.post(
  '/api/orders/:id/commands',
  invalidInput('param', orderParam),
  invalidInput('json', commandSchema),
  async (c) => {
    const result = await venueRoom(c.env).command(
      await credentials(c),
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
    const tvControl = await room.getTvControl()
    const next = tvControlSchema.parse(
      body.action === 'page'
        ? { ...tvControl, page: body.page }
        : { ...tvControl, paused: body.action === 'pause' },
    )
    return reply(c, await room.controlTv(await credentials(c), next))
  },
)

app.post(
  '/api/admin/settings',
  requireAdmin,
  invalidInput('json', settingsSchema),
  async (c) =>
    reply(
      c,
      await venueRoom(c.env).updateSettings(
        { kind: 'admin' },
        c.req.valid('json'),
      ),
    ),
)

app.post('/api/manager/service-day/open', requireAdmin, async (c) =>
  reply(c, await venueRoom(c.env).openServiceDay({ kind: 'admin' })),
)

app.post(
  '/api/manager/service-day/close',
  requireAdmin,
  invalidInput('json', z.object({ force: z.boolean().default(false) })),
  async (c) =>
    reply(
      c,
      await venueRoom(c.env).closeServiceDay(
        { kind: 'admin' },
        c.req.valid('json').force,
      ),
    ),
)

export default app
