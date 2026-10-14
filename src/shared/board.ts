import { z } from 'zod'

export const ORDER_STATUSES = [
  'new',
  'preparing',
  'ready',
  'served',
  'cancelled',
] as const

export const DESTINATIONS = ['table', 'takeaway'] as const

export const boardOrderSchema = z.object({
  id: z.string(),
  ticketNo: z.number().int(),
  destination: z.enum(DESTINATIONS),
  tableLabel: z.string().nullable(),
  status: z.enum(ORDER_STATUSES),
  createdAt: z.number(),
})

export const boardMessageSchema = z.object({
  type: z.literal('board'),
  rev: z.number().int().nonnegative(),
  serverTime: z.number(),
  orders: z.array(boardOrderSchema),
})

export type BoardOrder = z.infer<typeof boardOrderSchema>
export type BoardMessage = z.infer<typeof boardMessageSchema>
