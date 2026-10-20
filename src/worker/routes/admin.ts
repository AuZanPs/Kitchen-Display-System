import { Hono } from 'hono'
import { z } from 'zod'
import { settingsSchema } from '../../shared/board'
import { sha256Hex } from '../auth/crypto'
import {
  canSignSessions,
  clearAdminSession,
  ipHash,
  setAdminSession,
} from '../auth/session'
import {
  type AppEnv,
  adminCredentials,
  directory,
  invalidInput,
  placeOf,
  refuse,
  reply,
  requireAdmin,
  roomOf,
  tokenSchema,
  venueRoom,
} from './common'

export const admin = new Hono<AppEnv>()

// Admin: each dapur has its own password, checked in its room; a signed 12-hour cookie.
admin.post(
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

admin.post('/api/admin/logout', (c) => {
  clearAdminSession(c)
  return c.body(null, 204)
})

admin.get('/api/admin/session', requireAdmin, async (c) =>
  reply(c, await venueRoom(c).adminSession(await adminCredentials(c))),
)

admin.post(
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

/** The dapur side of the handoff: a valid pass signs the owner in as admin. */
admin.post(
  '/api/admin/handoff',
  invalidInput('json', tokenSchema),
  async (c) => {
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
  },
)
