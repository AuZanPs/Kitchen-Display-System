import { Hono } from 'hono'
import { z } from 'zod'
import { clearDeviceCookie, ipHash, setDeviceCookie } from '../auth/session'
import { approveSchema, pollSchema } from '../devices'
import {
  type AppEnv,
  adminCredentials,
  invalidInput,
  reply,
  requireAdmin,
  venueRoom,
} from './common'

const deviceParam = z.object({ id: z.uuid() })

export const devices = new Hono<AppEnv>()

// Pairing: the device shows a code, the admin approves it, the device polls.
devices.post('/api/devices/enroll/start', async (c) =>
  reply(c, await venueRoom(c).startEnrollment(await ipHash(c))),
)

devices.post(
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

devices.post(
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

devices.get('/api/devices', requireAdmin, async (c) =>
  reply(c, await venueRoom(c).listDevices(await adminCredentials(c))),
)

devices.post(
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
devices.post('/api/devices/forget', (c) => {
  clearDeviceCookie(c)
  return c.body(null, 204)
})
