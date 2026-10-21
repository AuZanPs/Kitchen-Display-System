import { zValidator } from '@hono/zod-validator'
import type { Context, MiddlewareHandler } from 'hono'
import { z } from 'zod'
import {
  FIRST_SLUG,
  type Place,
  placeFromHost,
  roomFor,
  SLUG_PATTERN,
} from '../../shared/venue'
import { adminEpoch, credentials } from '../auth/session'
import type { Credentials } from '../devices'
import type { Result } from '../orders'

export type AppEnv = { Bindings: Env }

// Placement hint only applies when an object is first created.
const PLACEMENT = { locationHint: 'apac-se' } as const

/** This request's dapur room; the hostname decides it (see `placeFromHost`). */
export function roomOf(c: Context<AppEnv>) {
  const place = placeOf(c)
  // `scope` already turned every other host away from dapur routes.
  return place.kind === 'venue' ? place.room : roomFor(FIRST_SLUG)
}

export function venueRoom(c: Context<AppEnv>) {
  return c.env.VENUE_ROOM.getByName(roomOf(c), PLACEMENT)
}

/** The room of the dapur at `slug`, for routes that name a dapur themselves. */
export function roomBySlug(env: Env, slug: string) {
  return env.VENUE_ROOM.getByName(roomFor(slug), PLACEMENT)
}

export function directory(env: Env) {
  return env.DIRECTORY.getByName('directory', PLACEMENT)
}

export function placeOf(c: Context<AppEnv>): Place {
  return placeFromHost(new URL(c.req.url).hostname, c.env.BASE_HOST)
}

export const notFound = (c: Context) =>
  c.json({ error: { code: 'not_found', message: 'Tidak ditemukan.' } }, 404)

export function invalidInput<T extends z.ZodType>(
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

export function reply<T>(
  c: { json: (body: unknown, status: Result<T>['status']) => Response },
  result: Result<T>,
) {
  return c.json(result.body, result.status)
}

export function refuse(c: Context, status: 401 | 403, message: string) {
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

export const requireAdmin: MiddlewareHandler<AppEnv> = async (c, next) => {
  if ((await adminEpoch(c, roomOf(c))) === null) {
    return refuse(c, 401, 'Masuk sebagai admin.')
  }
  await next()
}

/** Device or admin credentials from the cookies; the room checks them. */
export function callerCredentials(c: Context<AppEnv>): Promise<Credentials> {
  return credentials(c, roomOf(c))
}

/** Admin credentials from the cookie; the room checks the epoch is current. */
export async function adminCredentials(
  c: Context<AppEnv>,
): Promise<Credentials> {
  const epoch = await adminEpoch(c, roomOf(c))
  return epoch === null ? { kind: 'none' } : { kind: 'admin', epoch }
}

export const passwordBody = z.object({ password: z.string().min(1).max(200) })
export const idParam = z.object({ id: z.string().min(1).max(64) })
export const slugParam = z.object({ slug: z.string().regex(SLUG_PATTERN) })
export const tokenSchema = z.object({
  token: z.string().regex(/^[0-9a-f]{64}$/),
})
