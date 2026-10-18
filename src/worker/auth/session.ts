import type { Context } from 'hono'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'
import type { Credentials } from '../devices'
import { hmacHex, safeEqual, sha256Hex } from './crypto'

export const ADMIN_COOKIE = 'kds_admin'
export const DEVICE_COOKIE = 'kds_device'
export const STAFF_COOKIE = 'kds_staff'
export const SUPER_COOKIE = 'kds_super'
export const OWNER_COOKIE = 'kds_owner'
const ADMIN_TTL_S = 12 * 60 * 60
const STAFF_TTL_S = 12 * 60 * 60
const SUPER_TTL_S = 4 * 60 * 60
const OWNER_TTL_S = 14 * 24 * 60 * 60
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

/** Without a long enough SESSION_SECRET nobody can sign in anywhere. */
export function canSignSessions(env: Env) {
  return sessionSecret(env) !== null
}

/** Too short to survive guessing from many addresses; the console stays locked. */
const MIN_SUPER_PASSWORD_LENGTH = 16

/** Constant-time super admin password check; false when none is configured. */
export async function isSuperPassword(env: Env, candidate: string) {
  const configured = env.SUPER_ADMIN_PASSWORD
  if (!configured || configured.length < MIN_SUPER_PASSWORD_LENGTH) return false
  if (!sessionSecret(env)) return false
  const [a, b] = await Promise.all([
    sha256Hex(candidate),
    sha256Hex(env.SUPER_ADMIN_PASSWORD),
  ])
  return safeEqual(a, b)
}

/**
 * The admin cookie names its dapur, so it never works at another one, and the
 * dapur's session epoch, so a password change or switch-off signs it out.
 */
export async function setAdminSession(c: Ctx, room: string, epoch: string) {
  const secret = sessionSecret(c.env)
  if (!secret) throw new Error('SESSION_SECRET is not configured')
  const exp = Date.now() + ADMIN_TTL_S * 1000
  const signature = await hmacHex(secret, `admin.${room}.${epoch}.${exp}`)
  setCookie(
    c,
    ADMIN_COOKIE,
    `${exp}.${epoch}.${signature}`,
    cookieOptions(c, ADMIN_TTL_S),
  )
}

export function clearAdminSession(c: Ctx) {
  deleteCookie(c, ADMIN_COOKIE, { path: '/' })
}

/** The signed epoch of a valid admin cookie for `room`; the room checks it is current. */
export async function adminEpoch(c: Ctx, room: string): Promise<string | null> {
  const secret = sessionSecret(c.env)
  const value = getCookie(c, ADMIN_COOKIE)
  if (!secret || !value) return null
  const [exp, epoch, signature] = value.split('.')
  if (!exp || !epoch || !signature || !(Number(exp) > Date.now())) return null
  const expected = await hmacHex(secret, `admin.${room}.${epoch}.${exp}`)
  return safeEqual(signature, expected) ? epoch : null
}

export async function setSuperSession(c: Ctx) {
  const secret = sessionSecret(c.env)
  if (!secret) throw new Error('SESSION_SECRET is not configured')
  const exp = Date.now() + SUPER_TTL_S * 1000
  const signature = await hmacHex(secret, `super.${exp}`)
  setCookie(c, SUPER_COOKIE, `${exp}.${signature}`, {
    ...cookieOptions(c, SUPER_TTL_S),
    sameSite: 'Strict',
  })
}

export function clearSuperSession(c: Ctx) {
  deleteCookie(c, SUPER_COOKIE, { path: '/' })
}

export async function hasSuperSession(c: Ctx): Promise<boolean> {
  const secret = sessionSecret(c.env)
  const value = getCookie(c, SUPER_COOKIE)
  if (!secret || !value || !c.env.SUPER_ADMIN_PASSWORD) return false
  const [exp, signature] = value.split('.')
  if (!exp || !signature || !(Number(exp) > Date.now())) return false
  return safeEqual(signature, await hmacHex(secret, `super.${exp}`))
}

/** An owner signed in on the site (bare domain) with an emailed link. */
export async function setOwnerSession(c: Ctx, email: string) {
  const secret = sessionSecret(c.env)
  if (!secret) throw new Error('SESSION_SECRET is not configured')
  const iat = Date.now()
  const exp = iat + OWNER_TTL_S * 1000
  const encoded = encodeEmail(email)
  const signature = await hmacHex(secret, ownerMessage(encoded, iat, exp))
  setCookie(
    c,
    OWNER_COOKIE,
    `${encoded}.${iat}.${exp}.${signature}`,
    cookieOptions(c, OWNER_TTL_S),
  )
}

export function clearOwnerSession(c: Ctx) {
  deleteCookie(c, OWNER_COOKIE, { path: '/' })
}

/**
 * The signed-in owner and when this sign-in began; the Directory still checks
 * that it began after the owner's last "sign out everywhere".
 */
export async function ownerSession(
  c: Ctx,
): Promise<{ email: string; issuedAt: number } | null> {
  const secret = sessionSecret(c.env)
  const [encoded, iat, exp, signature] = (
    getCookie(c, OWNER_COOKIE) ?? ''
  ).split('.')
  if (!secret || !encoded || !iat || !exp || !signature) return null
  if (!DIGITS.test(iat) || !DIGITS.test(exp)) return null
  if (!(Number(exp) > Date.now())) return null
  // The issue time is signed, never worked out from the lifetime.
  const expected = await hmacHex(secret, ownerMessage(encoded, iat, exp))
  if (!safeEqual(signature, expected)) return null
  const email = decodeEmail(encoded)
  return email ? { email, issuedAt: Number(iat) } : null
}

const DIGITS = /^\d{1,15}$/

/** Versioned, and the email signed encoded, so no two cookies sign the same text. */
function ownerMessage(
  encodedEmail: string,
  iat: string | number,
  exp: string | number,
) {
  return `owner.v2.${encodedEmail}.${iat}.${exp}`
}

// Emails contain dots, the cookie's separator; base64url has none.
function encodeEmail(email: string) {
  return btoa(email)
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '')
}

function decodeEmail(encoded: string): string | null {
  try {
    return atob(encoded.replaceAll('-', '+').replaceAll('_', '/'))
  } catch {
    return null
  }
}

export function setDeviceCookie(c: Ctx, token: string) {
  setCookie(c, DEVICE_COOKIE, token, cookieOptions(c, DEVICE_TTL_S))
}

export function clearDeviceCookie(c: Ctx) {
  deleteCookie(c, DEVICE_COOKIE, { path: '/' })
}

/** A staff sign-in, signed and bound to one device so it cannot be moved. */
export async function setStaffSession(
  c: Ctx,
  staff: { staffId: string; deviceId: string; pinTag: string },
) {
  const secret = sessionSecret(c.env)
  if (!secret) throw new Error('SESSION_SECRET is not configured')
  const exp = Date.now() + STAFF_TTL_S * 1000
  const payload = `${staff.staffId}.${staff.deviceId}.${staff.pinTag}.${exp}`
  const signature = await hmacHex(secret, `staff.${payload}`)
  setCookie(
    c,
    STAFF_COOKIE,
    `${payload}.${signature}`,
    cookieOptions(c, STAFF_TTL_S),
  )
}

export function clearStaffSession(c: Ctx) {
  deleteCookie(c, STAFF_COOKIE, { path: '/' })
}

async function staffSession(c: Ctx, deviceId: string) {
  const secret = sessionSecret(c.env)
  const [staffId, boundTo, pinTag, exp, signature] = (
    getCookie(c, STAFF_COOKIE) ?? ''
  ).split('.')
  if (!secret || !staffId || !pinTag || !exp || !signature) return undefined
  if (boundTo !== deviceId || !(Number(exp) > Date.now())) return undefined
  const expected = await hmacHex(
    secret,
    `staff.${staffId}.${boundTo}.${pinTag}.${exp}`,
  )
  return safeEqual(signature, expected) ? { staffId, pinTag } : undefined
}

/** The paired device's cookie, unchecked; the room verifies the secret. */
async function deviceCredentials(c: Ctx): Promise<Credentials> {
  const match = DEVICE_TOKEN.exec(getCookie(c, DEVICE_COOKIE) ?? '')
  if (!match?.[1] || !match[2]) return { kind: 'none' }
  const staff = await staffSession(c, match[1])
  return {
    kind: 'device',
    deviceId: match[1],
    secret: match[2],
    ...staff,
  }
}

/**
 * Device pages act as the device even in a browser that is also logged in
 * as admin, so a TV tab on the admin's laptop still reports as a TV.
 */
export async function credentials(c: Ctx, room: string): Promise<Credentials> {
  const device = await deviceCredentials(c)
  if (device.kind === 'device') return device
  const epoch = await adminEpoch(c, room)
  return epoch === null ? { kind: 'none' } : { kind: 'admin', epoch }
}

/**
 * The part of an address one client controls: IPv4 as is, IPv6 by its /64,
 * since one connection usually owns a whole /64 and could rotate through it.
 */
export function clientNetwork(ip: string) {
  if (!ip.includes(':')) return ip
  const [head = '', tail = ''] = ip.toLowerCase().split('::')
  const left = head ? head.split(':') : []
  const right = tail ? tail.split(':') : []
  const groups = ip.includes('::')
    ? [...left, ...Array(8 - left.length - right.length).fill('0'), ...right]
    : left
  return `${groups
    .slice(0, 4)
    .map((g) => g.replace(/^0+(?=.)/, ''))
    .join(':')}::/64`
}

/** Hashed so raw client addresses never reach storage. */
export async function ipHash(c: Ctx) {
  const ip = c.req.header('cf-connecting-ip') ?? 'unknown'
  return (await sha256Hex(clientNetwork(ip))).slice(0, 16)
}
