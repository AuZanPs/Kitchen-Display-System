import { z } from 'zod'

// Over-limit text is rejected, never truncated.
export const LIMITS = {
  lines: 25,
  qty: 20,
  lineNote: 120,
  allergy: 120,
  orderNote: 200,
  reason: 200,
} as const

export const ROLES = ['waiter', 'kitchen', 'tv', 'manager'] as const
export type Role = (typeof ROLES)[number]

export const ERROR_CODES = [
  'unauthenticated',
  'forbidden',
  'not_found',
  'stale_version',
  'operation_conflict',
  'invalid_input',
  'item_unavailable',
  'unknown_item',
  'invalid_modifier',
  'too_many_lines',
  'service_closed',
  'invalid_transition',
  'allergy_ack_required',
  'rate_limited',
  'pin_required',
  'internal',
] as const
export type ErrorCode = (typeof ERROR_CODES)[number]

export const apiErrorSchema = z.object({
  error: z.object({
    code: z.enum(ERROR_CODES),
    message: z.string(),
    details: z.unknown().optional(),
  }),
})
export type ApiError = z.infer<typeof apiErrorSchema>

/** Calendar date in Asia/Jakarta (UTC+7, no DST): the service day. */
export function jakartaDate(at: number): string {
  return new Date(at + 7 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

/** Ticket numbers restart each service day and read like `A-007`. */
export function ticketLabel(ticketNo: number) {
  return `A-${String(ticketNo).padStart(3, '0')}`
}

export const orderLineInputSchema = z.object({
  menuItemId: z.string().min(1).max(64),
  qty: z.number().int().min(1).max(LIMITS.qty),
  optionIds: z.array(z.string().min(1).max(40)).max(20),
  note: z.string().trim().max(LIMITS.lineNote),
  allergy: z.string().trim().max(LIMITS.allergy),
})
export type OrderLineInput = z.infer<typeof orderLineInputSchema>

export const destinationSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('table'), tableId: z.string().min(1).max(64) }),
  z.object({ type: z.literal('takeaway') }),
])
export type Destination = z.infer<typeof destinationSchema>

export const createOrderSchema = z.object({
  operationId: z.uuid(),
  destination: destinationSchema,
  lines: z.array(orderLineInputSchema).min(1).max(LIMITS.lines),
  orderNote: z.string().trim().max(LIMITS.orderNote),
})
export type CreateOrder = z.infer<typeof createOrderSchema>

export const createOrderResultSchema = z.object({
  orderId: z.string(),
  ticketNo: z.number().int(),
  version: z.number().int(),
  rev: z.number().int(),
  replayed: z.boolean().optional(),
})
export type CreateOrderResult = z.infer<typeof createOrderResultSchema>
