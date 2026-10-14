import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import { createOrderSchema } from '../shared/order'

export { VenueRoom } from './venue-room'

// Single restaurant pilot: every device talks to the same room.
const VENUE_ID = 'main'

function venueRoom(env: Env) {
  // Placement hint only applies when the object is first created.
  return env.VENUE_ROOM.getByName(VENUE_ID, { locationHint: 'apac-se' })
}

const app = new Hono<{ Bindings: Env }>()

app.get('/api/health', (c) => c.json({ ok: true }))

app.get('/api/ws', (c) => {
  if (c.req.header('Upgrade') !== 'websocket') {
    return c.text('Expected websocket', 426)
  }
  const origin = c.req.header('Origin')
  if (origin !== new URL(c.req.url).origin) {
    return c.text('Forbidden', 403)
  }
  return venueRoom(c.env).fetch(c.req.raw)
})

app.post(
  '/api/orders',
  zValidator('json', createOrderSchema, (result, c) => {
    if (!result.success) {
      return c.json({ error: 'invalid_body', issues: result.error.issues }, 422)
    }
  }),
  async (c) => {
    const result = await venueRoom(c.env).createOrder(c.req.valid('json'))
    return c.json(result, 201)
  },
)

export default app
