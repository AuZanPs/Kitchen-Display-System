import { and, eq, isNotNull, isNull } from 'drizzle-orm'
import type { Role } from '../shared/order'
import type { AdminStaff, StaffInput, StaffMember } from '../shared/staff'
import { pbkdf2Hex, randomHex, safeEqual } from './auth/crypto'
import { type Db, schema } from './db'

type StaffRow = typeof schema.staff.$inferSelect

export const PIN_TRIES = {
  staff: 5,
  staffWindowMs: 5 * 60 * 1000,
  device: 10,
  // Daily caps count wrong PINs only; a new PIN from the admin lifts them.
  staffWrongPerDay: 20,
  deviceWrongPerDay: 50,
}

export const pinKeys = (staffId: string, deviceId: string) => ({
  staff: `pin-staff:${staffId}`,
  device: `pin-device:${deviceId}`,
  staffDay: `pin-wrong-day:${staffId}`,
  deviceDay: `pin-wrong-day-device:${deviceId}`,
})

/** A short piece of the PIN's salt: it changes whenever the PIN does. */
export function pinTag(row: StaffRow) {
  return row.pinSalt?.slice(0, 16) ?? ''
}

/** Only staff with a PIN, enabled, and of the device's role can sign in. */
export function canSignIn(row: StaffRow | undefined, role: Role) {
  return (
    row !== undefined &&
    row.disabledAt === null &&
    row.pinHash !== null &&
    row.role === role
  )
}

export function staffRow(db: Db, id: string) {
  return db.select().from(schema.staff).where(eq(schema.staff.id, id)).get()
}

export function staffForRole(db: Db, role: Role): StaffMember[] {
  return db
    .select({ id: schema.staff.id, name: schema.staff.name })
    .from(schema.staff)
    .where(
      and(
        eq(schema.staff.role, role),
        isNull(schema.staff.disabledAt),
        isNotNull(schema.staff.pinHash),
      ),
    )
    .orderBy(schema.staff.name)
    .all()
}

function toAdminStaff(row: StaffRow): AdminStaff {
  return {
    id: row.id,
    name: row.name,
    role: row.role === 'kitchen' ? 'kitchen' : 'waiter',
    hasPin: row.pinHash !== null,
    disabled: row.disabledAt !== null,
  }
}

export function adminStaff(db: Db): AdminStaff[] {
  return db
    .select()
    .from(schema.staff)
    .orderBy(schema.staff.name)
    .all()
    .filter((row) => row.role === 'waiter' || row.role === 'kitchen')
    .map(toAdminStaff)
}

/** Hashing is async, so it happens before the write transaction. */
export async function hashPin(pin: string) {
  const salt = randomHex(16)
  return { pinSalt: salt, pinHash: await pbkdf2Hex(pin, salt) }
}

export async function pinMatches(row: StaffRow, pin: string) {
  if (!row.pinHash || !row.pinSalt) return false
  return safeEqual(row.pinHash, await pbkdf2Hex(pin, row.pinSalt))
}

/** Creates (`id` null) or replaces a staff member; null when `id` is unknown. */
export function saveStaff(
  db: Db,
  id: string | null,
  input: Omit<StaffInput, 'pin'>,
  pin: { pinHash: string; pinSalt: string } | null,
  now: number,
): AdminStaff | null {
  const values = {
    name: input.name,
    role: input.role,
    disabledAt: input.disabled ? now : null,
    ...(pin ?? {}),
  }
  const staffId = id ?? crypto.randomUUID()
  if (id === null) {
    db.insert(schema.staff)
      .values({ id: staffId, ...values })
      .run()
  } else {
    if (!staffRow(db, id)) return null
    db.update(schema.staff).set(values).where(eq(schema.staff.id, id)).run()
  }
  if (pin) {
    // A fresh PIN from the admin also lifts any lockout on this person.
    const keys = pinKeys(staffId, '')
    for (const key of [keys.staff, keys.staffDay]) {
      db.delete(schema.rateLimits).where(eq(schema.rateLimits.key, key)).run()
    }
  }
  const row = staffRow(db, staffId)
  return row ? toAdminStaff(row) : null
}
