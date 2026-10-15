import { z } from 'zod'

export const STAFF_ROLES = ['waiter', 'kitchen'] as const
export const pinSchema = z.string().regex(/^\d{4,6}$/)

/** What the admin sends; a PIN only when setting or changing it. */
export const staffInputSchema = z.object({
  name: z.string().trim().min(1).max(40),
  role: z.enum(STAFF_ROLES),
  disabled: z.boolean().default(false),
  pin: pinSchema.optional(),
})
export type StaffInput = z.infer<typeof staffInputSchema>

export const adminStaffSchema = z.object({
  id: z.string(),
  name: z.string(),
  role: z.enum(STAFF_ROLES),
  hasPin: z.boolean(),
  disabled: z.boolean(),
})
export type AdminStaff = z.infer<typeof adminStaffSchema>
export const adminStaffListSchema = z.object({
  staff: z.array(adminStaffSchema),
})

/** Who can sign in on this device: names only. */
export const staffMemberSchema = z.object({ id: z.string(), name: z.string() })
export type StaffMember = z.infer<typeof staffMemberSchema>
export const staffListSchema = z.object({ staff: z.array(staffMemberSchema) })

export const staffLoginSchema = z.object({
  staffId: z.string().min(1).max(64),
  pin: pinSchema,
})
export type StaffLogin = z.infer<typeof staffLoginSchema>
