import { Hono, type MiddlewareHandler } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { secureHeaders } from 'hono/secure-headers'
import { logEvent } from './log'
import { admin } from './routes/admin'
import { type AppEnv, notFound, placeOf, refuse } from './routes/common'
import { superConsole } from './routes/console'
import { devices } from './routes/devices'
import { manager } from './routes/manager'
import { screens } from './routes/screens'
import { site } from './routes/site'
import { staff } from './routes/staff'

export { Directory } from './directory'
export { VenueRoom } from './venue-room'

const MAX_BODY_BYTES = 64 * 1024

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
  logEvent('error', 'unhandled', {
    error: err.name,
    method: c.req.method,
    path: new URL(c.req.url).pathname,
    ray: c.req.header('cf-ray') ?? null,
  })
  return c.json(
    { error: { code: 'internal', message: 'Terjadi kesalahan. Coba lagi.' } },
    500,
  )
})

app.get('/api/health', (c) =>
  c.json({ ok: true, environment: c.env.ENVIRONMENT }),
)

// Which kind of host this is, so one app can show the site, a dapur or the console.
app.get('/api/place', (c) => c.json({ kind: placeOf(c).kind }))

// Each group carries its full paths; `scope` above decides which host answers.
app.route('/', admin)
app.route('/', devices)
app.route('/', staff)
app.route('/', screens)
app.route('/', manager)
app.route('/', site)
app.route('/', superConsole)

export default app
