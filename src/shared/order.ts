import { z } from 'zod'

export const createOrderSchema = z.object({
  tableLabel: z.string().trim().min(1).max(20),
})

export type CreateOrder = z.infer<typeof createOrderSchema>

export type CreateOrderResult = {
  orderId: string
  ticketNo: number
  rev: number
}
