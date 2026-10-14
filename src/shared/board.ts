import { z } from 'zod'

export const ORDER_STATUSES = [
  'new',
  'accepted',
  'ready',
  'served',
  'cancelled',
] as const
export type OrderStatus = (typeof ORDER_STATUSES)[number]

export const ACTIVE_STATUSES = ['new', 'accepted', 'ready'] as const

export const DESTINATIONS = ['table', 'takeaway'] as const

export const CHANGE_KINDS = ['add_lines', 'move_table'] as const

export const boardLineSchema = z.object({
  id: z.string(),
  name: z.string(),
  qty: z.number().int(),
  modifiers: z.array(z.string()),
  note: z.string().nullable(),
  allergy: z.string().nullable(),
  addedInVersion: z.number().int(),
})

export const pendingChangeSchema = z.object({
  version: z.number().int(),
  kind: z.enum(CHANGE_KINDS),
  summary: z.string(),
})

export const boardOrderSchema = z.object({
  id: z.string(),
  ticketNo: z.number().int(),
  status: z.enum(ORDER_STATUSES),
  version: z.number().int(),
  takeaway: z.boolean(),
  table: z.string().nullable(),
  orderNote: z.string().nullable(),
  changePending: z.boolean(),
  cancelRequested: z.boolean(),
  cancelReason: z.string().nullable(),
  linkedTo: z.string().nullable(),
  pendingChanges: z.array(pendingChangeSchema),
  createdAt: z.number(),
  acceptedAt: z.number().nullable(),
  readyAt: z.number().nullable(),
  servedAt: z.number().nullable(),
  cancelledAt: z.number().nullable(),
  createdByName: z.string().nullable(),
  /** A TV reported rendering this order at its current version. */
  shownOnTv: z.boolean(),
  lines: z.array(boardLineSchema),
})

export const tvControlSchema = z.object({
  paused: z.boolean(),
  page: z.number().int().min(0),
})

export const boardMessageSchema = z.object({
  type: z.literal('board'),
  rev: z.number().int().nonnegative(),
  serverTime: z.number(),
  serviceDay: z.string(),
  serviceOpen: z.boolean(),
  instanceStartedAt: z.number(),
  tvCount: z.number().int(),
  tvControl: tvControlSchema,
  orders: z.array(boardOrderSchema),
})

export const revokedMessageSchema = z.object({ type: z.literal('revoked') })

export const serverMessageSchema = z.discriminatedUnion('type', [
  boardMessageSchema,
  revokedMessageSchema,
])

/** The only message a client sends besides "ping": the TV's render receipt. */
export const renderedMessageSchema = z.object({
  type: z.literal('rendered'),
  items: z
    .array(z.object({ id: z.string().max(64), version: z.number().int() }))
    .max(200),
})

export type BoardLine = z.infer<typeof boardLineSchema>
export type BoardOrder = z.infer<typeof boardOrderSchema>
export type BoardMessage = z.infer<typeof boardMessageSchema>
export type TvControl = z.infer<typeof tvControlSchema>
export type ServerMessage = z.infer<typeof serverMessageSchema>
export type RenderedMessage = z.infer<typeof renderedMessageSchema>
