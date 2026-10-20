import { z } from 'zod'
import { boardOrderSchema } from './board'

export const daySchema = z.iso.date()
export const MAX_EXPORT_DAYS = 31

export const historyQuerySchema = z.object({ day: daySchema.optional() })

/** A day's finished orders, or only one of them when `orderId` is given. */
export const deleteHistorySchema = z.object({
  day: daySchema,
  orderId: z.string().min(1).max(64).optional(),
})
export type DeleteHistory = z.infer<typeof deleteHistorySchema>

export const historyStatsSchema = z.object({
  orders: z.number().int(),
  served: z.number().int(),
  cancelled: z.number().int(),
  /** Average minutes from sending to ready, over orders that got there. */
  avgReadyMinutes: z.number().nullable(),
  /** Sum of line prices on orders that were not cancelled. */
  revenueIdr: z.number().int(),
})
export type HistoryStats = z.infer<typeof historyStatsSchema>

/** An order as the history shows it: with what its lines add up to. */
export const historyOrderSchema = boardOrderSchema.extend({
  totalIdr: z.number().int(),
})
export type HistoryOrder = z.infer<typeof historyOrderSchema>

export const historySchema = z.object({
  day: daySchema,
  stats: historyStatsSchema,
  orders: z.array(historyOrderSchema),
})
export type History = z.infer<typeof historySchema>

export const exportQuerySchema = z
  .object({
    from: daySchema,
    to: daySchema,
    format: z.enum(['csv', 'json']).default('csv'),
  })
  .refine(
    ({ from, to }) => {
      const days = (Date.parse(to) - Date.parse(from)) / 86_400_000
      return days >= 0 && days < MAX_EXPORT_DAYS
    },
    { message: `At most ${MAX_EXPORT_DAYS} days, from before to` },
  )

/** One exported row per order line; notes and allergies stay out. */
export const exportRowSchema = z.object({
  service_day: z.string(),
  ticket: z.string(),
  status: z.string(),
  destination: z.string(),
  created_at: z.string(),
  created_by: z.string(),
  item: z.string(),
  modifiers: z.string(),
  qty: z.number().int(),
  unit_price_idr: z.number().int(),
  line_total_idr: z.number().int(),
})
export type ExportRow = z.infer<typeof exportRowSchema>
export const EXPORT_COLUMNS = Object.keys(exportRowSchema.shape) as Array<
  keyof ExportRow
>
