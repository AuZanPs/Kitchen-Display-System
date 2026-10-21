import { z } from 'zod'
import { ROLES } from './order'

/** The roles a device pairs as; the manager signs in with a password instead. */
export const PAIR_ROLES = ['waiter', 'kitchen', 'tv'] as const
export type PairRole = (typeof PAIR_ROLES)[number]

export const PAIR_CODE_DIGITS = 6
export const PAIR_CODE = new RegExp(`^\\d{${PAIR_CODE_DIGITS}}$`)
export const DEVICE_LABEL_MAX = 40

/** A new device's pairing code and the secret it polls with. */
export const challengeSchema = z.object({
  challengeId: z.string(),
  code: z.string().regex(PAIR_CODE),
  pollSecret: z.string(),
  expiresAt: z.number(),
})
export type Challenge = z.infer<typeof challengeSchema>

/** The device asks whether its code was approved yet. */
export const pollSchema = z.object({
  challengeId: z.uuid(),
  pollSecret: z.string().regex(/^[0-9a-f]{64}$/),
})
export type Poll = z.infer<typeof pollSchema>

/** The admin approves the code a device shows, as one role. */
export const approveSchema = z.object({
  code: z.string().regex(PAIR_CODE),
  role: z.enum(PAIR_ROLES),
  label: z.string().trim().min(1).max(DEVICE_LABEL_MAX),
})
export type Approve = z.infer<typeof approveSchema>

/** A paired device as the admin sees it. */
export const deviceSchema = z.object({
  id: z.string(),
  label: z.string(),
  role: z.enum(ROLES),
  createdAt: z.number(),
  lastSeenAt: z.number().nullable(),
  revokedAt: z.number().nullable(),
  online: z.boolean(),
})
export type Device = z.infer<typeof deviceSchema>
export const devicesSchema = z.object({ devices: z.array(deviceSchema) })
