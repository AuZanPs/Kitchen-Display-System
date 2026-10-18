import { zValidator } from '@hono/zod-validator'
import { type Context, Hono, type MiddlewareHandler } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { secureHeaders } from 'hono/secure-headers'
import { z } from 'zod'
import { settingsSchema, tvControlSchema } from '../shared/board'
import { commandSchema } from '../shared/commands'
import { exportQuerySchema, historyQuerySchema } from '../shared/history'
import { menuItemInputSchema, tableInputSchema } from '../shared/menu'
import { createOrderSchema } from '../shared/order'
import { staffInputSchema, staffLoginSchema } from '../shared/staff'
import {
  adminPasswordSchema,
  FIRST_SLUG,
  ownerEmailSchema,
  type Place,
  placeFromHost,
  roomFor,
  SLUG_PATTERN,
  venueCreateSchema,
} from '../shared/venue'
import { randomHex, sha256Hex } from './auth/crypto'
import {
  adminEpoch,
  canSignSessions,
  clearAdminSession,
  clearDeviceCookie,
  clearOwnerSession,
  clearStaffSession,
  clearSuperSession,
  credentials,
  hasSuperSession,
  ipHash,
  isSuperPassword,
  ownerEmail,
  setAdminSession,
  setDeviceCookie,
  setOwnerSession,
  setStaffSession,
  setSuperSession,
} from './auth/session'
import { approveSchema, type Credentials, pollSchema } from './devices'
import { sendSignInLink } from './email'
import { toCsv } from './history'
import type { Result } from './orders'

export { Directory } from './directory'
export { VenueRoom } from './venue-room'

const MAX_BODY_BYTES = 64 * 1024

type AppEnv = { Bindings: Env }

/** This request's dapur room; the hostname decides it (see `placeFromHost`). */
function roomOf(c: Context<AppEnv>) {
  const place = placeOf(c)
  // `scope` already turned every other host away from dapur routes.
  return place.kind === 'venue' ? place.room : roomFor(FIRST_SLUG)
}

function venueRoom(c: Context<AppEnv>) {
  // Placement hint only applies when the object is first created.
  return c.env.VENUE_ROOM.getByName(roomOf(c), { locationHint: 'apac-se' })
}

function directory(env: Env) {
  return env.DIRECTORY.getByName('directory', { locationHint: 'apac-se' })
}

function placeOf(c: Context<AppEnv>): Place {
  return placeFromHost(new URL(c.req.url).hostname, c.env.BASE_HOST)
}

const notFound = (c: Context) =>
  c.json({ error: { code: 'not_found', message: 'Tidak ditemukan.' } }, 404)

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
  if ((await adminEpoch(c, roomOf(c))) === null) {
    return refuse(c, 401, 'Masuk sebagai admin.')
  }
  await next()
}

/** Admin credentials from the cookie; the room checks the epoch is current. */
async function adminCredentials(c: Context<AppEnv>): Promise<Credentials> {
  const epoch = await adminEpoch(c, roomOf(c))
  return epoch === null ? { kind: 'none' } : { kind: 'admin', epoch }
}

const requireSuper: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (!(await hasSuperSession(c)))
    return refuse(c, 401, 'Masuk sebagai super admin.')
  await next()
}

/**
 * Dapur routes answer only on a dapur's host, console routes only on the
 * console host, so a cookie or request can never cross between them.
 */
const scope: MiddlewareHandler<AppEnv> = async (c, next) => {
  const path = new URL(c.req.url).pathname
  if (path === '/api/health' || path === '/api/place') return next()
  const place = placeOf(c)
  const kind = path.startsWith('/api/super/')
    ? 'console'
    : path.startsWith('/api/site/')
      ? 'site'
      : 'venue'
  if (place.kind !== kind) return notFound(c)
  await next()
}

const idParam = z.object({ id: z.string().min(1).max(64) })
const deviceParam = z.object({ id: z.uuid() })

const app = new Hono<AppEnv>()

// Static pages get theirs from public/_headers; API answers are never cached.
const apiHeaders = secureHeaders({ xFrameOptions: 'DENY' })
app.use('/api/*', async (c, next) => {
  // A socket upgrade's 101 response cannot take extra headers.
  if (c.req.header('Upgrade') === 'websocket') return next()
  await apiHeaders(c, next)
  c.header('Cache-Control', 'no-store')
})
app.use('/api/*', scope)
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

// An unexpected failure answers without internals; only its name reaches the logs.
app.onError((err, c) => {
  console.error('unhandled', err.name)
  return c.json(
    { error: { code: 'internal', message: 'Terjadi kesalahan. Coba lagi.' } },
    500,
  )
})

app.get('/api/health', (c) =>
  c.json({ ok: true, environment: c.env.ENVIRONMENT }),
)

// Admin: each dapur has its own password, checked in its room; a signed 12-hour cookie.
app.post(
  '/api/admin/login',
  invalidInput('json', z.object({ password: z.string().min(1).max(200) })),
  async (c) => {
    if (!canSignSessions(c.env)) return refuse(c, 401, 'Admin belum disiapkan.')
    const result = await venueRoom(c).adminLogin(
      await ipHash(c),
      c.req.valid('json').password,
    )
    if (!result.ok) return reply(c, result)
    await setAdminSession(c, roomOf(c), result.body.epoch)
    return c.body(null, 204)
  },
)

app.post('/api/admin/logout', (c) => {
  clearAdminSession(c)
  return c.body(null, 204)
})

app.get('/api/admin/session', requireAdmin, async (c) =>
  reply(c, await venueRoom(c).adminSession(await adminCredentials(c))),
)

// Pairing: the device shows a code, the admin approves it, the device polls.
app.post('/api/devices/enroll/start', async (c) =>
  reply(c, await venueRoom(c).startEnrollment(await ipHash(c))),
)

app.post(
  '/api/devices/enroll/poll',
  invalidInput('json', pollSchema),
  async (c) => {
    const result = await venueRoom(c).pollEnrollment(c.req.valid('json'))
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
      await venueRoom(c).approveEnrollment(
        await adminCredentials(c),
        c.req.valid('json'),
      ),
    ),
)

app.get('/api/devices', requireAdmin, async (c) =>
  reply(c, await venueRoom(c).listDevices(await adminCredentials(c))),
)

app.post(
  '/api/devices/:id/revoke',
  requireAdmin,
  invalidInput('param', deviceParam),
  async (c) =>
    reply(
      c,
      await venueRoom(c).revokeDevice(
        await adminCredentials(c),
        c.req.valid('param').id,
      ),
    ),
)

/** Forgets this browser's pairing (the device row stays until revoked). */
app.post('/api/devices/forget', (c) => {
  clearDeviceCookie(c)
  return c.body(null, 204)
})

// Staff PINs: the room checks the PIN, the Worker signs the cookie.
app.get('/api/staff', async (c) =>
  reply(c, await venueRoom(c).listStaff(await credentials(c, roomOf(c)))),
)
app.post(
  '/api/staff/login',
  invalidInput('json', staffLoginSchema),
  async (c) => {
    const result = await venueRoom(c).staffLogin(
      await credentials(c, roomOf(c)),
      c.req.valid('json'),
    )
    if (!result.ok) return reply(c, result)
    await setStaffSession(c, {
      staffId: result.body.staff.id,
      deviceId: result.body.deviceId,
      pinTag: result.body.pinTag,
    })
    return c.json({ staff: result.body.staff })
  },
)
app.post('/api/staff/logout', (c) => {
  clearStaffSession(c)
  return c.body(null, 204)
})

app.get('/api/session', async (c) =>
  reply(c, await venueRoom(c).session(await credentials(c, roomOf(c)))),
)

app.get('/api/ws', async (c) => {
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

app.get('/api/board', async (c) =>
  reply(c, await venueRoom(c).getBoard(await credentials(c, roomOf(c)))),
)
app.get('/api/menu', async (c) =>
  reply(c, await venueRoom(c).getMenu(await credentials(c, roomOf(c)))),
)
app.get('/api/tables', async (c) =>
  reply(c, await venueRoom(c).getTables(await credentials(c, roomOf(c)))),
)

app.post('/api/orders', invalidInput('json', createOrderSchema), async (c) => {
  const result = await venueRoom(c).createOrder(
    await credentials(c, roomOf(c)),
    c.req.valid('json'),
    Date.now(),
  )
  return reply(c, result)
})

app.get('/api/orders/:id', invalidInput('param', idParam), async (c) =>
  reply(
    c,
    await venueRoom(c).getOrder(
      await credentials(c, roomOf(c)),
      c.req.valid('param').id,
    ),
  ),
)

app.post(
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

app.post(
  '/api/admin/settings',
  requireAdmin,
  invalidInput('json', settingsSchema),
  async (c) =>
    reply(
      c,
      await venueRoom(c).updateSettings(
        await adminCredentials(c),
        c.req.valid('json'),
      ),
    ),
)

// Menu and tables: changes bump menuVersion on the board so tablets refetch.
app.get('/api/manager/menu', requireAdmin, async (c) =>
  reply(c, await venueRoom(c).adminMenu(await adminCredentials(c))),
)
app.post(
  '/api/manager/menu',
  requireAdmin,
  invalidInput('json', menuItemInputSchema),
  async (c) =>
    reply(
      c,
      await venueRoom(c).saveMenuItem(
        await adminCredentials(c),
        null,
        c.req.valid('json'),
      ),
    ),
)
app.put(
  '/api/manager/menu/:id',
  requireAdmin,
  invalidInput('param', idParam),
  invalidInput('json', menuItemInputSchema),
  async (c) =>
    reply(
      c,
      await venueRoom(c).saveMenuItem(
        await adminCredentials(c),
        c.req.valid('param').id,
        c.req.valid('json'),
      ),
    ),
)

app.get('/api/manager/tables', requireAdmin, async (c) =>
  reply(c, await venueRoom(c).adminTables(await adminCredentials(c))),
)
app.post(
  '/api/manager/tables',
  requireAdmin,
  invalidInput('json', tableInputSchema),
  async (c) =>
    reply(
      c,
      await venueRoom(c).saveTable(
        await adminCredentials(c),
        null,
        c.req.valid('json'),
      ),
    ),
)
app.put(
  '/api/manager/tables/:id',
  requireAdmin,
  invalidInput('param', idParam),
  invalidInput('json', tableInputSchema),
  async (c) =>
    reply(
      c,
      await venueRoom(c).saveTable(
        await adminCredentials(c),
        c.req.valid('param').id,
        c.req.valid('json'),
      ),
    ),
)

app.get(
  '/api/manager/history',
  requireAdmin,
  invalidInput('query', historyQuerySchema),
  async (c) =>
    reply(
      c,
      await venueRoom(c).history(
        await adminCredentials(c),
        c.req.valid('query').day,
      ),
    ),
)

app.get(
  '/api/manager/export',
  requireAdmin,
  invalidInput('query', exportQuerySchema),
  async (c) => {
    const { from, to, format } = c.req.valid('query')
    const result = await venueRoom(c).exportRows(
      await adminCredentials(c),
      from,
      to,
    )
    if (!result.ok) return reply(c, result)
    const file = `kds-${from}_${to}.${format}`
    c.header('Content-Disposition', `attachment; filename="${file}"`)
    if (format === 'json') return c.json(result.body.rows)
    c.header('Content-Type', 'text/csv; charset=utf-8')
    return c.body(toCsv(result.body.rows))
  },
)

app.get('/api/manager/staff', requireAdmin, async (c) =>
  reply(c, await venueRoom(c).adminStaff(await adminCredentials(c))),
)
app.post(
  '/api/manager/staff',
  requireAdmin,
  invalidInput('json', staffInputSchema),
  async (c) =>
    reply(
      c,
      await venueRoom(c).saveStaff(
        await adminCredentials(c),
        null,
        c.req.valid('json'),
      ),
    ),
)
app.put(
  '/api/manager/staff/:id',
  requireAdmin,
  invalidInput('param', idParam),
  invalidInput('json', staffInputSchema),
  async (c) =>
    reply(
      c,
      await venueRoom(c).saveStaff(
        await adminCredentials(c),
        c.req.valid('param').id,
        c.req.valid('json'),
      ),
    ),
)

app.post('/api/manager/service-day/open', requireAdmin, async (c) =>
  reply(c, await venueRoom(c).openServiceDay(await adminCredentials(c))),
)

app.post(
  '/api/manager/service-day/close',
  requireAdmin,
  invalidInput('json', z.object({ force: z.boolean().default(false) })),
  async (c) =>
    reply(
      c,
      await venueRoom(c).closeServiceDay(
        await adminCredentials(c),
        c.req.valid('json').force,
      ),
    ),
)

// Which kind of host this is, so one app can show the site, a dapur or the console.
app.get('/api/place', (c) => c.json({ kind: placeOf(c).kind }))

// Site (bare domain): owners sign in with an emailed link and open their dapur.
const LOGIN_TTL_MS = 15 * 60 * 1000
const HANDOFF_TTL_MS = 60 * 1000
const tokenSchema = z.object({ token: z.string().regex(/^[0-9a-f]{64}$/) })

function rateLimited(c: Context, message: string) {
  return c.json({ error: { code: 'rate_limited', message } }, 429)
}

app.post(
  '/api/site/login/start',
  invalidInput('json', z.object({ email: ownerEmailSchema })),
  async (c) => {
    const { email } = c.req.valid('json')
    const dir = directory(c.env)
    const window = 15 * 60 * 1000
    if (!(await dir.allowAttempt(`site-login:${await ipHash(c)}`, 5, window))) {
      return rateLimited(c, 'Terlalu banyak permintaan. Tunggu 15 menit.')
    }
    const token = randomHex(32)
    const link = `${new URL(c.req.url).origin}/masuk#token=${token}`
    // The same answer whether or not the email owns a dapur, so nobody can probe emails.
    const issued = await dir.issueToken(
      'login',
      await sha256Hex(token),
      email,
      null,
      LOGIN_TTL_MS,
    )
    // Only real owners count against the inbox cap. Past the cap new mail is
    // skipped silently; links already sent keep working, so nobody else can
    // lock the owner out. Sending runs after the reply so timing reveals nothing.
    if (
      issued &&
      c.env.ENVIRONMENT !== 'development' &&
      (await dir.allowAttempt(`site-login-email:${email}`, 5, window))
    ) {
      c.executionCtx.waitUntil(
        sendSignInLink(c.env, email, link).catch((err: Error) =>
          console.error('sign-in email failed', err.name),
        ),
      )
    }
    // Development has no mailbox: the page shows the link instead.
    return c.json(
      c.env.ENVIRONMENT === 'development' && issued ? { devLink: link } : {},
    )
  },
)

app.post(
  '/api/site/login/verify',
  invalidInput('json', tokenSchema),
  async (c) => {
    const dir = directory(c.env)
    const key = `site-verify:${await ipHash(c)}`
    if (!(await dir.allowAttempt(key, 10, 15 * 60 * 1000))) {
      return rateLimited(c, 'Terlalu banyak percobaan. Tunggu 15 menit.')
    }
    if (!canSignSessions(c.env)) return refuse(c, 401, 'Belum disiapkan.')
    const email = await dir.takeToken(
      'login',
      await sha256Hex(c.req.valid('json').token),
      null,
    )
    if (!email) {
      return refuse(c, 401, 'Tautan ini sudah dipakai atau kedaluwarsa.')
    }
    await setOwnerSession(c, email)
    return c.body(null, 204)
  },
)

app.get('/api/site/session', async (c) => {
  const email = await ownerEmail(c)
  if (!email) return refuse(c, 401, 'Masuk dulu.')
  const venues = await directory(c.env).venuesOf(email)
  return c.json({
    email,
    venues: venues.map(({ slug, name, disabled }) => ({
      slug,
      name,
      disabled,
    })),
  })
})

app.post('/api/site/logout', (c) => {
  clearOwnerSession(c)
  return c.body(null, 204)
})

/** A one-minute, one-time pass from the site into one of the owner's dapur. */
app.post(
  '/api/site/handoff',
  invalidInput('json', z.object({ slug: z.string().regex(SLUG_PATTERN) })),
  async (c) => {
    const email = await ownerEmail(c)
    if (!email) return refuse(c, 401, 'Masuk dulu.')
    const { slug } = c.req.valid('json')
    const token = randomHex(32)
    const issued = await directory(c.env).issueToken(
      'handoff',
      await sha256Hex(token),
      email,
      slug,
      HANDOFF_TTL_MS,
    )
    if (!issued) return refuse(c, 403, 'Dapur ini tidak bisa dibuka.')
    const url = new URL(c.req.url)
    url.hostname = `${slug}.${c.env.BASE_HOST}`
    url.pathname = '/admin'
    url.search = ''
    url.hash = `handoff=${token}`
    return c.json({ url: url.toString() })
  },
)

/** The dapur side of the handoff: a valid pass signs the owner in as admin. */
app.post('/api/admin/handoff', invalidInput('json', tokenSchema), async (c) => {
  if (!canSignSessions(c.env)) return refuse(c, 401, 'Admin belum disiapkan.')
  const place = placeOf(c)
  const slug = place.kind === 'venue' ? place.slug : null
  const email = await directory(c.env).takeToken(
    'handoff',
    await sha256Hex(c.req.valid('json').token),
    slug,
  )
  if (!email)
    return refuse(c, 401, 'Tautan ini sudah dipakai atau kedaluwarsa.')
  const result = await venueRoom(c).adminHandoff()
  if (!result.ok) return reply(c, result)
  await setAdminSession(c, roomOf(c), result.body.epoch)
  return c.body(null, 204)
})

// Super admin console (console.<base domain>): creates and manages every dapur.
const slugParam = z.object({ slug: z.string().regex(SLUG_PATTERN) })
const SUPER_LOGIN_WINDOW_MS = 15 * 60 * 1000

app.post(
  '/api/super/login',
  invalidInput('json', z.object({ password: z.string().min(1).max(200) })),
  async (c) => {
    const key = `super-login:${await ipHash(c)}`
    // Counted before checking, so a correct guess after the limit still fails.
    // No console-wide cap: that would let anyone lock the owner out. Guesses
    // from many addresses are answered by the minimum password length instead.
    if (!(await directory(c.env).allowAttempt(key, 5, SUPER_LOGIN_WINDOW_MS))) {
      return c.json(
        {
          error: {
            code: 'rate_limited',
            message: 'Terlalu banyak percobaan. Tunggu 15 menit.',
          },
        },
        429,
      )
    }
    if (!(await isSuperPassword(c.env, c.req.valid('json').password))) {
      return refuse(c, 401, 'Kata sandi salah.')
    }
    await setSuperSession(c)
    return c.body(null, 204)
  },
)

app.post('/api/super/logout', (c) => {
  clearSuperSession(c)
  return c.body(null, 204)
})

app.get('/api/super/session', requireSuper, (c) => c.body(null, 204))

app.get('/api/super/venues', requireSuper, async (c) =>
  c.json({ venues: await directory(c.env).list() }),
)

app.post(
  '/api/super/venues',
  requireSuper,
  invalidInput('json', venueCreateSchema),
  async (c) => {
    const { slug, name, adminPassword, ownerEmail } = c.req.valid('json')
    const dir = directory(c.env)
    if (!(await dir.add(slug, name, ownerEmail ?? null))) {
      return c.json(
        {
          error: {
            code: 'operation_conflict',
            message: 'Alamat ini sudah dipakai dapur lain.',
          },
        },
        409,
      )
    }
    const result = await c.env.VENUE_ROOM.getByName(roomFor(slug), {
      locationHint: 'apac-se',
    }).provision({ name, adminPassword })
    if (!result.ok) {
      await dir.remove(slug)
      return reply(c, result)
    }
    return c.json({ slug, name }, 201)
  },
)

/** The room of a dapur the directory knows, or null. */
async function knownRoom(env: Env, slug: string) {
  if (!(await directory(env).has(slug))) return null
  return env.VENUE_ROOM.getByName(roomFor(slug))
}

app.put(
  '/api/super/venues/:slug/password',
  requireSuper,
  invalidInput('param', slugParam),
  invalidInput('json', z.object({ adminPassword: adminPasswordSchema })),
  async (c) => {
    const room = await knownRoom(c.env, c.req.valid('param').slug)
    if (!room) return notFound(c)
    return reply(
      c,
      await room.setAdminPassword(c.req.valid('json').adminPassword),
    )
  },
)

app.put(
  '/api/super/venues/:slug/status',
  requireSuper,
  invalidInput('param', slugParam),
  invalidInput('json', z.object({ disabled: z.boolean() })),
  async (c) => {
    const { slug } = c.req.valid('param')
    const { disabled } = c.req.valid('json')
    const room = await knownRoom(c.env, slug)
    if (!room) return notFound(c)
    const result = await room.setDisabled(disabled)
    if (result.ok) await directory(c.env).setDisabled(slug, disabled)
    return reply(c, result)
  },
)

app.put(
  '/api/super/venues/:slug/owner',
  requireSuper,
  invalidInput('param', slugParam),
  invalidInput('json', z.object({ ownerEmail: ownerEmailSchema.nullable() })),
  async (c) => {
    const { slug } = c.req.valid('param')
    const dir = directory(c.env)
    if (!(await dir.has(slug))) return notFound(c)
    await dir.setOwner(slug, c.req.valid('json').ownerEmail)
    // A new owner means the old one's admin sessions end too.
    const signedOut = await c.env.VENUE_ROOM.getByName(
      roomFor(slug),
    ).signOutAdmins()
    if (!signedOut.ok) return reply(c, signedOut)
    return c.body(null, 204)
  },
)

export default app
