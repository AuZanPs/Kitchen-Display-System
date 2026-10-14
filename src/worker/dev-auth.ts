// TEMP-AUTH: one shared dev key until device enrollment and staff PINs exist.
import { env } from 'cloudflare:workers'
import type { Context, MiddlewareHandler } from 'hono'
import { getCookie, setCookie } from 'hono/cookie'
import { z } from 'zod'

export const DEV_KEY_HEADER = 'x-dev-key'
const DEV_KEY_COOKIE = 'kds_dev_key'
const ALLOWED_ENVIRONMENTS = ['development', 'staging']

// TEMP-AUTH: fail closed, so a missing ENVIRONMENT counts as production too.
export function assertDevAuthAllowed(environment: string | undefined) {
  if (!environment || !ALLOWED_ENVIRONMENTS.includes(environment)) {
    throw new Error(
      `Dev key auth refused to start (ENVIRONMENT=${environment || 'unset'})`,
    )
  }
}

assertDevAuthAllowed(env.ENVIRONMENT)

async function digest(value: string) {
  return crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
}

async function isDevKey(candidate: string, expected: string | undefined) {
  if (!expected) return false
  const [a, b] = await Promise.all([digest(candidate), digest(expected)])
  return crypto.subtle.timingSafeEqual(a, b)
}

// TEMP-AUTH
export const requireDevKey: MiddlewareHandler<{ Bindings: Env }> = async (
  c,
  next,
) => {
  const key = c.req.header(DEV_KEY_HEADER) ?? getCookie(c, DEV_KEY_COOKIE)
  if (!key || !(await isDevKey(key, c.env.DEV_KEY))) {
    return c.json({ error: 'unauthenticated' }, 401)
  }
  await next()
}

export const devLoginSchema = z.object({ key: z.string().min(1).max(200) })

// TEMP-AUTH
export async function devLogin(
  c: Context<{ Bindings: Env }>,
  key: string,
): Promise<Response> {
  if (!(await isDevKey(key, c.env.DEV_KEY))) {
    return c.json({ error: 'unauthenticated' }, 401)
  }
  setCookie(c, DEV_KEY_COOKIE, key, {
    path: '/api',
    httpOnly: true,
    sameSite: 'Strict',
    // Plain http on the LAN is how the TV box reaches the dev server.
    secure: new URL(c.req.url).protocol === 'https:',
    maxAge: 60 * 60 * 12,
  })
  return c.body(null, 204)
}
