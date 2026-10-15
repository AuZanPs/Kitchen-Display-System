import type { Context } from 'hono'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'
import type { Credentials } from '../devices'
import { hmacHex, safeEqual, sha256Hex } from './crypto'

export const ADMIN_COOKIE = 'kds_admin'
export const DEVICE_COOKIE = 'kds_device'
const ADMIN_TTL_S = 12 * 60 * 60
const DEVICE_TTL_S = 400 * 24 * 60 * 60 // browsers cap cookie lifetime at 400 days
const DEVICE_TOKEN = /^main\.([0-9a-f-]{36})\.([0-9a-f]{64})$/
// Short secrets would make the session signature guessable.
const MIN_SECRET_LENGTH = 32

type Ctx = Context<{ Bindings: Env }>

function cookieOptions(c: Ctx, maxAge: number) {
  return {
    path: '/',
    httpOnly: true,
    sameSite: 'Lax',
    // Plain http on the LAN is how the TV box reaches a local dev server.
    secure: new URL(c.req.url).protocol === 'https:',
    maxAge,
  } as const
}

function sessionSecret(env: Env): string | null {
  const secret = env.SESSION_SECRET
  return secret && secret.length >= MIN_SECRET_LENGTH ? secret : null
}

/** Constant-time password check; false when no password is configured. */
export async function isAdminPassword(env: Env, candidate: string) {
  if (!env.ADMIN_PASSWORD || !sessionSecret(env)) return false
  const [a, b] = await Promise.all([
    sha256Hex(candidate),
    sha256Hex(env.ADMIN_PASSWORD),
  ])
  return safeEqual(a, b)
}

export async function setAdminSession(c: Ctx) {
  const secret = sessionSecret(c.env)
  if (!secret) throw new Error('SESSION_SECRET is not configured')
  const exp = Date.now() + ADMIN_TTL_S * 1000
  const signature = await hmacHex(secret, `admin.${exp}`)
  setCookie(
    c,
    ADMIN_COOKIE,
    `${exp}.${signature}`,
    cookieOptions(c, ADMIN_TTL_S),
  )
}

export function clearAdminSession(c: Ctx) {
  deleteCookie(c, ADMIN_COOKIE, { path: '/' })
}

export async function hasAdminSession(c: Ctx): Promise<boolean> {
  const secret = sessionSecret(c.env)
  const value = getCookie(c, ADMIN_COOKIE)
  if (!secret || !value) return false
  const [exp, signature] = value.split('.')
  if (!exp || !signature || !(Number(exp) > Date.now())) return false
  return safeEqual(signature, await hmacHex(secret, `admin.${exp}`))
}

export function setDeviceCookie(c: Ctx, token: string) {
  setCookie(c, DEVICE_COOKIE, token, cookieOptions(c, DEVICE_TTL_S))
}

export function clearDeviceCookie(c: Ctx) {
  deleteCookie(c, DEVICE_COOKIE, { path: '/' })
}

/** The paired device's cookie, unchecked; the room verifies the secret. */
export function deviceCredentials(c: Ctx): Credentials {
  const match = DEVICE_TOKEN.exec(getCookie(c, DEVICE_COOKIE) ?? '')
  if (!match?.[1] || !match[2]) return { kind: 'none' }
  return { kind: 'device', deviceId: match[1], secret: match[2] }
}

/**
 * Device pages act as the device even in a browser that is also logged in
 * as admin, so a TV tab on the admin's laptop still reports as a TV.
 */
export async function credentials(c: Ctx): Promise<Credentials> {
  const device = deviceCredentials(c)
  if (device.kind === 'device') return device
  return (await hasAdminSession(c)) ? { kind: 'admin' } : { kind: 'none' }
}

/** Hashed so raw client addresses never reach storage. */
export async function ipHash(c: Ctx) {
  const ip = c.req.header('cf-connecting-ip') ?? 'unknown'
  return (await sha256Hex(ip)).slice(0, 16)
}
