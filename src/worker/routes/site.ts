import { Hono } from 'hono'
import { z } from 'zod'
import {
  ownedVenueCreateSchema,
  ownerEmailSchema,
  SLUG_PATTERN,
  VENUE_LIMITS,
} from '../../shared/venue'
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
import { fail } from '../orders'
import {
  type AppEnv,
  directory,
  invalidInput,
  refuse,
  reply,
  roomBySlug,
  slugParam,
  tokenSchema,
} from './common'

// Site (bare domain): owners sign in with an emailed link and open their dapur.
const LOGIN_TTL_MS = 15 * 60 * 1000
const HANDOFF_TTL_MS = 60 * 1000
const DAY_MS = 24 * 60 * 60 * 1000
const SIGNUPS_PER_DAY = 100

export const site = new Hono<AppEnv>()

site.post(
  '/api/site/login/start',
  invalidInput('json', z.object({ email: ownerEmailSchema })),
  async (c) => {
    const { email } = c.req.valid('json')
    const dir = directory(c.env)
    const window = 15 * 60 * 1000
    if (!(await dir.allowAttempt(`site-login:${await ipHash(c)}`, 5, window))) {
      return reply(
        c,
        fail(429, 'rate_limited', 'Too many requests. Wait 15 minutes.'),
      )
    }
    const token = randomHex(32)
    const link = `${new URL(c.req.url).origin}/sign-in#token=${token}`
    /**
     * Any email may sign in; that is how a new owner signs up. Past the inbox
     * cap new mail is skipped while links already sent keep working, so nobody
     * can lock an owner out. Emails without a dapur also share a daily cap, so
     * sign-up spam cannot use up the month's email allowance.
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
      if (!(await dir.allowAttempt(`site-login-email:${email}`, 5, window))) {
        return true
      }
      if (
        !(await dir.knownEmail(email)) &&
        !(await dir.allowAttempt('site-signup-day', SIGNUPS_PER_DAY, DAY_MS))
      ) {
        logEvent('info', 'sign_up_cap_reached', {})
        return true
      }
      await sendSignInLink(c.env, email, link)
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
      return reply(
        c,
        fail(429, 'rate_limited', 'Too many attempts. Wait 15 minutes.'),
      )
    }
    if (!canSignSessions(c.env)) return refuse(c, 401, 'Not configured yet.')
    const email = await dir.takeToken(
      'login',
      await sha256Hex(c.req.valid('json').token),
      null,
    )
    if (!email) {
      return refuse(c, 401, 'This link has already been used or has expired.')
    }
    await setOwnerSession(c, email)
    return c.body(null, 204)
  },
)

site.get('/api/site/session', async (c) => {
  const session = await ownerSession(c)
  if (!session) return refuse(c, 401, 'Sign in first.')
  const venues = await directory(c.env).account(session.email, session.issuedAt)
  if (!venues) {
    clearOwnerSession(c)
    return refuse(c, 401, 'Sign in first.')
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
  if (!session) return refuse(c, 401, 'Sign in first.')
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
    if (!session) return refuse(c, 401, 'Sign in first.')
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
    if (!issued) return refuse(c, 403, 'This kitchen cannot be opened.')
    const url = new URL(c.req.url)
    url.hostname = `${slug}.${c.env.BASE_HOST}`
    url.pathname = '/admin'
    url.search = ''
    url.hash = `handoff=${token}`
    return c.json({ url: url.toString() })
  },
)

/** A signed-in owner creates a dapur of their own, then opens its admin. */
site.post(
  '/api/site/venues',
  invalidInput('json', ownedVenueCreateSchema),
  async (c) => {
    const session = await ownerSession(c)
    if (!session) return refuse(c, 401, 'Sign in first.')
    const dir = directory(c.env)
    const hour = 60 * 60 * 1000
    if (!(await dir.allowAttempt(`site-create:${await ipHash(c)}`, 5, hour))) {
      return reply(
        c,
        fail(429, 'rate_limited', 'Too many attempts. Wait one hour.'),
      )
    }
    const { slug, name, adminPassword } = c.req.valid('json')
    const added = await dir.addOwned(
      slug,
      name,
      session.email,
      session.issuedAt,
      VENUE_LIMITS.ownedVenues,
    )
    if (added === 'signed_out') return refuse(c, 401, 'Sign in first.')
    if (added === 'full') {
      return reply(
        c,
        fail(
          409,
          'operation_conflict',
          `One account can create ${VENUE_LIMITS.ownedVenues} kitchens. Contact us if you need more.`,
        ),
      )
    }
    if (added === 'taken') {
      return reply(
        c,
        fail(
          409,
          'operation_conflict',
          'This address is already taken by another kitchen.',
        ),
      )
    }
    const result = await roomBySlug(c.env, slug).provision({
      name,
      adminPassword,
    })
    if (!result.ok) {
      await dir.remove(slug)
      return reply(c, result)
    }
    logEvent('info', 'venue_created_by_owner', { slug })
    return c.json({ slug, name }, 201)
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
    if (!session) return refuse(c, 401, 'Sign in first.')
    const result = await directory(c.env).inviteAdmin(
      session.email,
      session.issuedAt,
      c.req.valid('param').slug,
      c.req.valid('json').email,
    )
    if (result === 'forbidden') {
      return refuse(c, 403, 'Only the owner can manage admins.')
    }
    if (result === 'self') {
      return reply(c, fail(422, 'invalid_input', 'This is the owner email.'))
    }
    if (result === 'full') {
      return reply(
        c,
        fail(
          409,
          'operation_conflict',
          `At most ${VENUE_LIMITS.invitedAdmins} additional admins.`,
        ),
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
    if (!session) return refuse(c, 401, 'Sign in first.')
    const { slug } = c.req.valid('param')
    const removed = await directory(c.env).revokeAdmin(
      session.email,
      session.issuedAt,
      slug,
      c.req.valid('json').email,
    )
    if (!removed) {
      return refuse(c, 403, 'Only the owner can manage admins.')
    }
    // Their admin sign-in on the dapur ends now; the owner opens it again from the site.
    const signedOut = await roomBySlug(c.env, slug).signOutAdmins()
    if (!signedOut.ok) return reply(c, signedOut)
    return c.body(null, 204)
  },
)
