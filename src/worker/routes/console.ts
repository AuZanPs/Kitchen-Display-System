import { Hono, type MiddlewareHandler } from 'hono'
import { z } from 'zod'
import {
  adminPasswordSchema,
  ownerEmailSchema,
  roomFor,
  venueCreateSchema,
  venueNameSchema,
} from '../../shared/venue'
import {
  clearSuperSession,
  hasSuperSession,
  ipHash,
  isSuperPassword,
  setSuperSession,
} from '../auth/session'
import {
  type AppEnv,
  directory,
  invalidInput,
  notFound,
  refuse,
  reply,
  slugParam,
} from './common'

// Super admin console (console.<base domain>): creates and manages every dapur.
const SUPER_LOGIN_WINDOW_MS = 15 * 60 * 1000

const requireSuper: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (!(await hasSuperSession(c)))
    return refuse(c, 401, 'Masuk sebagai super admin.')
  await next()
}

/** The room of a dapur the directory knows, or null. */
async function knownRoom(env: Env, slug: string) {
  if (!(await directory(env).has(slug))) return null
  return env.VENUE_ROOM.getByName(roomFor(slug))
}

export const superConsole = new Hono<AppEnv>()

superConsole.post(
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

superConsole.post('/api/super/logout', (c) => {
  clearSuperSession(c)
  return c.body(null, 204)
})

superConsole.get('/api/super/session', requireSuper, (c) => c.body(null, 204))

superConsole.get('/api/super/venues', requireSuper, async (c) =>
  c.json({ venues: await directory(c.env).list() }),
)

superConsole.post(
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

superConsole.put(
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

superConsole.put(
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

superConsole.put(
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

superConsole.put(
  '/api/super/venues/:slug/name',
  requireSuper,
  invalidInput('param', slugParam),
  invalidInput('json', z.object({ name: venueNameSchema })),
  async (c) => {
    const { slug } = c.req.valid('param')
    const { name } = c.req.valid('json')
    const room = await knownRoom(c.env, slug)
    if (!room) return notFound(c)
    const result = await room.rename(name)
    if (!result.ok) return reply(c, result)
    await directory(c.env).rename(slug, name)
    return c.body(null, 204)
  },
)
