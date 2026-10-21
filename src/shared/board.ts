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
export const FINISHED_STATUSES = ['served', 'cancelled'] as const

/** Served and cancelled orders are done; every other status is still active. */
export function isFinished(status: OrderStatus) {
  return status === 'served' || status === 'cancelled'
}

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

/** What the kitchen asks of the TV: stop or restart paging, or show one page. */
export const tvActionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('pause') }),
  z.object({ action: z.literal('resume') }),
  z.object({ action: z.literal('page'), page: z.number().int().min(0) }),
])
export type TvAction = z.infer<typeof tvActionSchema>

/** What the waiter is asked per order; each venue picks how detailed. */
export const settingsSchema = z.object({
  allergy: z.boolean(),
  lineNotes: z.boolean(),
  orderNote: z.boolean(),
  /** Waiters and kitchen staff sign in with a PIN before they act. */
  staffPins: z.boolean(),
})
export type Settings = z.infer<typeof settingsSchema>

// The owner asked for a clean default: no allergy field until a venue turns it on.
export const DEFAULT_SETTINGS: Settings = {
  allergy: false,
  lineNotes: true,
  orderNote: true,
  staffPins: false,
}

export const boardMessageSchema = z.object({
  type: z.literal('board'),
  rev: z.number().int().nonnegative(),
  serverTime: z.number(),
  serviceDay: z.string(),
  serviceOpen: z.boolean(),
  instanceStartedAt: z.number(),
  tvCount: z.number().int(),
  tvControl: tvControlSchema,
  settings: settingsSchema,
  /** Moves whenever the admin edits the menu or tables, so tablets refetch. */
  menuVersion: z.number().int().nonnegative(),
  orders: z.array(boardOrderSchema),
})

export const revokedMessageSchema = z.object({ type: z.literal('revoked') })

export const serverMessageSchema = z.discriminatedUnion('type', [
  boardMessageSchema,
  revokedMessageSchema,
])

/** The only message a client sends besides "ping": the TV's render receipt. */
/** Orders one TV receipt may report. */
export const RECEIPT_ITEMS_MAX = 200

export const renderedMessageSchema = z.object({
  type: z.literal('rendered'),
  items: z
    .array(z.object({ id: z.string().max(64), version: z.number().int() }))
    .max(RECEIPT_ITEMS_MAX),
})

export type BoardOrder = z.infer<typeof boardOrderSchema>
export type BoardMessage = z.infer<typeof boardMessageSchema>
export type TvControl = z.infer<typeof tvControlSchema>
export type ServerMessage = z.infer<typeof serverMessageSchema>
export type RenderedMessage = z.infer<typeof renderedMessageSchema>
