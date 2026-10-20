import { type Context, Hono } from 'hono'
import { z } from 'zod'
import { ownerEmailSchema, roomFor, SLUG_PATTERN } from '../../shared/venue'
import { randomHex, sha256Hex } from '../auth/crypto'
import {
  canSignSessions,
  clearOwnerSession,
  ipHash,
  ownerSession,
  setOwnerSession,
} from '../auth/session'
import { sendSignInLink } from '../email'
import { logEvent } from '../log'
import {
  type AppEnv,
  directory,
  invalidInput,
  refuse,
  reply,
  slugParam,
  tokenSchema,
} from './common'

// Site (bare domain): owners sign in with an emailed link and open their dapur.
const LOGIN_TTL_MS = 15 * 60 * 1000
const HANDOFF_TTL_MS = 60 * 1000

function rateLimited(c: Context, message: string) {
  return c.json({ error: { code: 'rate_limited', message } }, 429)
}

export const site = new Hono<AppEnv>()

site.post(
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
    /**
     * Everything that depends on whether the email owns a dapur happens here.
     * Only real owners count against the inbox cap; past it new mail is skipped,
     * while links already sent keep working, so nobody can lock the owner out.
     */
    const issueAndSend = async () => {
      const issued = await dir.issueToken(
        'login',
        await sha256Hex(token),
        email,
        null,
        LOGIN_TTL_MS,
      )
      if (!issued) return false
      if (c.env.ENVIRONMENT === 'development') return true
      if (await dir.allowAttempt(`site-login-email:${email}`, 5, window)) {
        await sendSignInLink(c.env, email, link)
      }
      return true
    }
    // Development has no mailbox: the page shows the link instead.
    if (c.env.ENVIRONMENT === 'development') {
      return c.json((await issueAndSend()) ? { devLink: link } : {})
    }
    // In production the reply leaves before any of that work, so its timing and
    // body are the same whether or not the email owns a dapur.
    c.executionCtx.waitUntil(
      issueAndSend().catch((err: Error) =>
        logEvent('error', 'sign_in_email_failed', { error: err.name }),
      ),
    )
    return c.json({})
  },
)

site.post(
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

site.get('/api/site/session', async (c) => {
  const session = await ownerSession(c)
  if (!session) return refuse(c, 401, 'Masuk dulu.')
  const venues = await directory(c.env).account(session.email, session.issuedAt)
  if (!venues) {
    clearOwnerSession(c)
    return refuse(c, 401, 'Masuk dulu.')
  }
  return c.json({ email: session.email, venues })
})

site.post('/api/site/logout', (c) => {
  clearOwnerSession(c)
  return c.body(null, 204)
})

/** Ends this owner's sign-in on every browser, this one included. */
site.post('/api/site/logout-everywhere', async (c) => {
  const session = await ownerSession(c)
  if (!session) return refuse(c, 401, 'Masuk dulu.')
  await directory(c.env).signOutOwner(session.email)
  clearOwnerSession(c)
  return c.body(null, 204)
})

/** A one-minute, one-time pass from the site into one of the owner's dapur. */
site.post(
  '/api/site/handoff',
  invalidInput('json', z.object({ slug: z.string().regex(SLUG_PATTERN) })),
  async (c) => {
    const session = await ownerSession(c)
    if (!session) return refuse(c, 401, 'Masuk dulu.')
    const { slug } = c.req.valid('json')
    const token = randomHex(32)
    const issued = await directory(c.env).issueToken(
      'handoff',
      await sha256Hex(token),
      session.email,
      slug,
      HANDOFF_TTL_MS,
      session.issuedAt,
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

// The owner of a dapur invites up to three more admins, who sign in on the
// site with their own email.
const adminEmailBody = z.object({ email: ownerEmailSchema })

site.post(
  '/api/site/venues/:slug/admins',
  invalidInput('param', slugParam),
  invalidInput('json', adminEmailBody),
  async (c) => {
    const session = await ownerSession(c)
    if (!session) return refuse(c, 401, 'Masuk dulu.')
    const result = await directory(c.env).inviteAdmin(
      session.email,
      session.issuedAt,
      c.req.valid('param').slug,
      c.req.valid('json').email,
    )
    if (result === 'forbidden') {
      return refuse(c, 403, 'Hanya pemilik yang bisa mengatur admin.')
    }
    if (result === 'self') {
      return c.json(
        { error: { code: 'invalid_input', message: 'Ini email pemilik.' } },
        422,
      )
    }
    if (result === 'full') {
      return c.json(
        {
          error: {
            code: 'operation_conflict',
            message: 'Paling banyak 3 admin lain.',
          },
        },
        409,
      )
    }
    return c.body(null, 204)
  },
)

site.post(
  '/api/site/venues/:slug/admins/remove',
  invalidInput('param', slugParam),
  invalidInput('json', adminEmailBody),
  async (c) => {
    const session = await ownerSession(c)
    if (!session) return refuse(c, 401, 'Masuk dulu.')
    const { slug } = c.req.valid('param')
    const removed = await directory(c.env).revokeAdmin(
      session.email,
      session.issuedAt,
      slug,
      c.req.valid('json').email,
    )
    if (!removed) {
      return refuse(c, 403, 'Hanya pemilik yang bisa mengatur admin.')
    }
    // Their admin sign-in on the dapur ends now; the owner opens it again from the site.
    const signedOut = await c.env.VENUE_ROOM.getByName(
      roomFor(slug),
    ).signOutAdmins()
    if (!signedOut.ok) return reply(c, signedOut)
    return c.body(null, 204)
  },
)
