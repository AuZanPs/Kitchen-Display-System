import { z } from 'zod'

export const createOrderSchema = z.object({
  tableLabel: z.string().trim().min(1).max(20),
})

export type CreateOrder = z.infer<typeof createOrderSchema>

export const createOrderResultSchema = z.object({
  orderId: z.string(),
  ticketNo: z.number().int(),
  rev: z.number().int(),
})

export type CreateOrderResult = z.infer<typeof createOrderResultSchema>
