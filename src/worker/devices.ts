import { and, desc, eq, gt, isNull } from 'drizzle-orm'
import { z } from 'zod'
import { safeEqual } from './auth/crypto'
import { type Db, schema } from './db'
import { type Failure, fail, type Result } from './orders'

export const ENROLL_ROLES = ['waiter', 'kitchen', 'tv'] as const
export const ENROLL_TTL_MS = 5 * 60 * 1000
const MAX_POLL_ATTEMPTS = 5

export const approveSchema = z.object({
  code: z.string().regex(/^\d{6}$/),
  role: z.enum(ENROLL_ROLES),
  label: z.string().trim().min(1).max(40),
})
export type Approve = z.infer<typeof approveSchema>

export const pollSchema = z.object({
  challengeId: z.uuid(),
  pollSecret: z.string().regex(/^[0-9a-f]{64}$/),
})
export type Poll = z.infer<typeof pollSchema>

/** Who is calling, as the Worker understood the request. */
export type Credentials =
  | { kind: 'none' }
  | { kind: 'admin' }
  | {
      kind: 'device'
      deviceId: string
      secret: string
      /** Signed staff sign-in bound to this device; the room still checks the row. */
      staffId?: string
      /** Ties the sign-in to the PIN it used, so a new PIN signs everyone out. */
      pinTag?: string
    }

export function unauthenticated(): Failure {
  return fail(401, 'unauthenticated', 'Perangkat belum terdaftar.')
}

/** True while `key` has used up `limit` inside its window; counts nothing. */
export function isLockedOut(
  db: Db,
  key: string,
  limit: number,
  windowMs: number,
  now: number,
): boolean {
  const row = db
    .select()
    .from(schema.rateLimits)
    .where(eq(schema.rateLimits.key, key))
    .get()
  return (
    row !== undefined && row.windowStart > now - windowMs && row.count >= limit
  )
}

/**
 * Fixed-window counter in `rate_limits`. Counts this attempt and returns
 * false once `limit` attempts happened inside the window.
 */
export function allowAttempt(
  db: Db,
  key: string,
  limit: number,
  windowMs: number,
  now: number,
): boolean {
  const row = db
    .select()
    .from(schema.rateLimits)
    .where(eq(schema.rateLimits.key, key))
    .get()
  if (!row || row.windowStart <= now - windowMs) {
    db.insert(schema.rateLimits)
      .values({ key, windowStart: now, count: 1 })
      .onConflictDoUpdate({
        target: schema.rateLimits.key,
        set: { windowStart: now, count: 1 },
      })
      .run()
    return true
  }
  if (row.count >= limit) return false
  db.update(schema.rateLimits)
    .set({ count: row.count + 1 })
    .where(eq(schema.rateLimits.key, key))
    .run()
  return true
}

/** Stores a new challenge unless its code collides with a live one. */
export function insertChallenge(
  db: Db,
  challenge: {
    id: string
    codeHash: string
    secretHash: string
    ipHash: string
  },
  now: number,
): boolean {
  const clash = db
    .select({ id: schema.enrollChallenges.id })
    .from(schema.enrollChallenges)
    .where(
      and(
        eq(schema.enrollChallenges.codeHash, challenge.codeHash),
        isNull(schema.enrollChallenges.consumedAt),
        gt(schema.enrollChallenges.expiresAt, now),
      ),
    )
    .get()
  if (clash) return false
  db.insert(schema.enrollChallenges)
    .values({
      id: challenge.id,
      codeHash: challenge.codeHash,
      secretHash: challenge.secretHash,
      expiresAt: now + ENROLL_TTL_MS,
      createdIpHash: challenge.ipHash,
    })
    .run()
  return true
}

export function approveChallenge(
  db: Db,
  codeHash: string,
  input: Approve,
  now: number,
): Result<{ role: Approve['role']; label: string }> {
  const challenge = db
    .select({ id: schema.enrollChallenges.id })
    .from(schema.enrollChallenges)
    .where(
      and(
        eq(schema.enrollChallenges.codeHash, codeHash),
        isNull(schema.enrollChallenges.consumedAt),
        isNull(schema.enrollChallenges.approvedRole),
        gt(schema.enrollChallenges.expiresAt, now),
      ),
    )
    .get()
  if (!challenge) {
    return fail(404, 'not_found', 'Kode salah atau sudah kedaluwarsa.')
  }
  db.update(schema.enrollChallenges)
    .set({ approvedRole: input.role, approvedLabel: input.label })
    .where(eq(schema.enrollChallenges.id, challenge.id))
    .run()
  return {
    ok: true,
    status: 200,
    body: { role: input.role, label: input.label },
  }
}

export type PollResult =
  | { status: 'pending' }
  | { status: 'approved'; role: string; label: string; token: string }

/**
 * The device asks whether its code was approved. A wrong secret counts
 * against the challenge and burns it after five tries. The new device's
 * secret is made by the caller so this stays synchronous.
 */
export function pollChallenge(
  db: Db,
  input: { challengeId: string; secretHash: string },
  device: { id: string; secret: string; tokenHash: string },
  now: number,
): Result<PollResult> {
  const challenge = db
    .select()
    .from(schema.enrollChallenges)
    .where(eq(schema.enrollChallenges.id, input.challengeId))
    .get()
  if (!challenge || challenge.consumedAt || challenge.expiresAt <= now) {
    return fail(404, 'not_found', 'Kode sudah kedaluwarsa. Minta kode baru.')
  }
  if (!safeEqual(challenge.secretHash, input.secretHash)) {
    const attempts = challenge.attempts + 1
    db.update(schema.enrollChallenges)
      .set({
        attempts,
        consumedAt: attempts >= MAX_POLL_ATTEMPTS ? now : null,
      })
      .where(eq(schema.enrollChallenges.id, challenge.id))
      .run()
    return unauthenticated()
  }
  if (!challenge.approvedRole) {
    return { ok: true, status: 200, body: { status: 'pending' } }
  }
  db.update(schema.enrollChallenges)
    .set({ consumedAt: now })
    .where(eq(schema.enrollChallenges.id, challenge.id))
    .run()
  const label = challenge.approvedLabel ?? challenge.approvedRole
  db.insert(schema.devices)
    .values({
      id: device.id,
      label,
      role: challenge.approvedRole,
      tokenHash: device.tokenHash,
      createdAt: now,
    })
    .run()
  return {
    ok: true,
    status: 200,
    body: {
      status: 'approved',
      role: challenge.approvedRole,
      label,
      token: `main.${device.id}.${device.secret}`,
    },
  }
}

export function listDevices(db: Db) {
  return db
    .select({
      id: schema.devices.id,
      label: schema.devices.label,
      role: schema.devices.role,
      createdAt: schema.devices.createdAt,
      lastSeenAt: schema.devices.lastSeenAt,
      revokedAt: schema.devices.revokedAt,
    })
    .from(schema.devices)
    .orderBy(desc(schema.devices.createdAt))
    .all()
}

export function revokeDevice(db: Db, deviceId: string, now: number): boolean {
  const revoked = db
    .update(schema.devices)
    .set({ revokedAt: now })
    .where(
      and(eq(schema.devices.id, deviceId), isNull(schema.devices.revokedAt)),
    )
    .returning({ id: schema.devices.id })
    .all()
  return revoked.length > 0
}

/** Connect and disconnect only: heartbeats never write (free-tier row budget). */
export function touchDevice(db: Db, deviceId: string, now: number) {
  db.update(schema.devices)
    .set({ lastSeenAt: now })
    .where(eq(schema.devices.id, deviceId))
    .run()
}
