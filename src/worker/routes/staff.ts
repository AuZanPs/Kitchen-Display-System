import { Hono } from 'hono'
import { staffLoginSchema } from '../../shared/staff'
import {
  clearStaffSession,
  credentials,
  setStaffSession,
} from '../auth/session'
import { type AppEnv, invalidInput, reply, roomOf, venueRoom } from './common'

export const staff = new Hono<AppEnv>()

// Staff PINs: the room checks the PIN, the Worker signs the cookie.
staff.get('/api/staff', async (c) =>
  reply(c, await venueRoom(c).listStaff(await credentials(c, roomOf(c)))),
)
staff.post(
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
staff.post('/api/staff/logout', (c) => {
  clearStaffSession(c)
  return c.body(null, 204)
})
