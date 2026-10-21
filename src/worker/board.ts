import {
  and,
  asc,
  eq,
  gt,
  inArray,
  isNull,
  max,
  or,
  type SQL,
  sql,
} from 'drizzle-orm'
import { z } from 'zod'
import {
  ACTIVE_STATUSES,
  type BoardMessage,
  type BoardOrder,
  type TvControl,
} from '../shared/board'
import { type Db, getMeta, getRev, getSettings, schema } from './db'

const BOARD_LIMIT = 50
const RECENTLY_CLOSED_MS = 2 * 60 * 1000

const stringList = z.array(z.string())

export const changePayloadSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('add_lines'),
    lines: z.array(
      z.object({
        qty: z.number(),
        name: z.string(),
        allergy: z.string().nullable(),
      }),
    ),
  }),
  z.object({
    kind: z.literal('move_table'),
    from: z.string().nullable(),
    to: z.string(),
  }),
])
export type ChangePayload = z.infer<typeof changePayloadSchema>

export function summarizeChange(change: ChangePayload): string {
  if (change.kind === 'move_table') {
    return `Pindah dari ${change.from ?? 'Bawa pulang'} ke ${change.to}`
  }
  const items = change.lines.map((l) => `${l.qty}× ${l.name}`).join(', ')
  return `Tambah ${items}`
}

type OrderRow = typeof schema.orders.$inferSelect

/**
 * Turns order rows into board orders. `filter` selects the same orders as a
 * subquery, so related rows load without long IN lists (Durable Object SQLite
 * allows at most 100 bound parameters per query).
 */
export function toBoardOrders(
  db: Db,
  rows: OrderRow[],
  filter: SQL | undefined,
): BoardOrder[] {
  if (rows.length === 0) return []
  const ids = db
    .select({ id: schema.orders.id })
    .from(schema.orders)
    .where(filter)
  const lines = db
    .select()
    .from(schema.orderLines)
    .where(inArray(schema.orderLines.orderId, ids))
    // rowid keeps lines in the order they were entered.
    .orderBy(sql`rowid`)
    .all()
  const changes = db
    .select()
    .from(schema.orderChanges)
    .where(
      and(
        inArray(schema.orderChanges.orderId, ids),
        isNull(schema.orderChanges.ackedAt),
      ),
    )
    .orderBy(asc(schema.orderChanges.version))
    .all()
  const linesOf = Map.groupBy(lines, (l) => l.orderId)
  const changesOf = Map.groupBy(changes, (c) => c.orderId)
  const receipts = new Map(
    db
      .select({
        orderId: schema.displayReceipts.orderId,
        version: max(schema.displayReceipts.version),
      })
      .from(schema.displayReceipts)
      .where(inArray(schema.displayReceipts.orderId, ids))
      .groupBy(schema.displayReceipts.orderId)
      .all()
      .map((r) => [r.orderId, r.version ?? 0]),
  )
  const names = new Map(
    db
      .select({ id: schema.staff.id, name: schema.staff.name })
      .from(schema.staff)
      .where(
        inArray(
          schema.staff.id,
          db
            .select({ id: schema.orders.createdBy })
            .from(schema.orders)
            .where(filter),
        ),
      )
      .all()
      .map((s) => [s.id, s.name]),
  )

  return rows.map((order) => ({
    id: order.id,
    ticketNo: order.ticketNo,
    status: order.status,
    version: order.version,
    takeaway: order.destination === 'takeaway',
    table: order.tableLabel,
    orderNote: order.orderNote,
    changePending: order.changePending,
    cancelRequested: order.cancelRequested,
    cancelReason: order.cancelReason,
    linkedTo: order.linkedTo,
    pendingChanges: (changesOf.get(order.id) ?? []).map((c) => ({
      version: c.version,
      kind: c.kind,
      summary: summarizeChange(
        changePayloadSchema.parse(JSON.parse(c.payloadJson)),
      ),
    })),
    createdAt: order.createdAt,
    acceptedAt: order.acceptedAt,
    readyAt: order.readyAt,
    servedAt: order.servedAt,
    cancelledAt: order.cancelledAt,
    createdByName: names.get(order.createdBy) ?? null,
    shownOnTv: (receipts.get(order.id) ?? 0) >= order.version,
    lines: (linesOf.get(order.id) ?? []).map((l) => ({
      id: l.id,
      name: l.nameSnapshot,
      qty: l.qty,
      modifiers: stringList.parse(JSON.parse(l.modifiersJson)),
      note: l.note,
      allergy: l.allergy,
      addedInVersion: l.addedInVersion,
    })),
  }))
}

export type Live = {
  instanceStartedAt: number
  tvCount: number
  tvControl: TvControl
}

export function buildBoard(db: Db, live: Live, now: number): BoardMessage {
  const cutoff = now - RECENTLY_CLOSED_MS
  const filter = or(
    inArray(schema.orders.status, ACTIVE_STATUSES),
    gt(schema.orders.servedAt, cutoff),
    gt(schema.orders.cancelledAt, cutoff),
  )
  const rows = db
    .select()
    .from(schema.orders)
    .where(filter)
    .orderBy(asc(schema.orders.createdAt))
    .all()
  // Active tickets are never dropped; the cap only trims recently closed ones.
  const active = rows.filter(
    (r) => r.servedAt === null && r.cancelledAt === null,
  )
  const closed = rows.filter((r) => !active.includes(r))
  const keep = new Set([
    ...active,
    ...closed.slice(Math.max(0, closed.length - (BOARD_LIMIT - active.length))),
  ])
  return {
    type: 'board',
    rev: getRev(db),
    serverTime: now,
    serviceDay: getMeta(db, 'service_day') ?? '',
    serviceOpen: getMeta(db, 'service_open') === '1',
    instanceStartedAt: live.instanceStartedAt,
    tvCount: live.tvCount,
    tvControl: live.tvControl,
    settings: getSettings(db),
    menuVersion: Number(getMeta(db, 'menu_version') ?? 0),
    orders: toBoardOrders(
      db,
      rows.filter((r) => keep.has(r)),
      filter,
    ),
  }
}

export function boardOrder(db: Db, orderId: string): BoardOrder | undefined {
  const filter = eq(schema.orders.id, orderId)
  const rows = db.select().from(schema.orders).where(filter).all()
  return toBoardOrders(db, rows, filter)[0]
}

/** Stores render receipts that move a TV forward; ignores stale or bogus ones. */
export function applyReceipts(
  db: Db,
  deviceId: string,
  items: { id: string; version: number }[],
  now: number,
): boolean {
  let changed = false
  for (const item of items) {
    const order = db
      .select({ version: schema.orders.version })
      .from(schema.orders)
      .where(eq(schema.orders.id, item.id))
      .get()
    if (!order || item.version > order.version) continue
    const current = db
      .select({ version: schema.displayReceipts.version })
      .from(schema.displayReceipts)
      .where(
        and(
          eq(schema.displayReceipts.orderId, item.id),
          eq(schema.displayReceipts.deviceId, deviceId),
        ),
      )
      .get()
    if (current && current.version >= item.version) continue
    db.insert(schema.displayReceipts)
      .values({
        orderId: item.id,
        deviceId,
        version: item.version,
        renderedAt: now,
      })
      .onConflictDoUpdate({
        target: [
          schema.displayReceipts.orderId,
          schema.displayReceipts.deviceId,
        ],
        set: { version: item.version, renderedAt: now },
      })
      .run()
    changed = true
  }
  return changed
}
