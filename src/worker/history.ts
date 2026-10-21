import { and, asc, between, eq, inArray, sql } from 'drizzle-orm'
import { FINISHED_STATUSES } from '../shared/board'
import { EXPORT_COLUMNS, type ExportRow, type History } from '../shared/history'
import { ticketLabel } from '../shared/order'
import { toBoardOrders } from './board'
import { type Db, schema } from './db'

const MINUTE_MS = 60 * 1000

/** Every order of one service day, oldest first, with the day's totals. */
export function dayHistory(db: Db, day: string): History {
  const filter = eq(schema.orders.serviceDay, day)
  const rows = db
    .select()
    .from(schema.orders)
    .where(filter)
    .orderBy(asc(schema.orders.createdAt))
    .all()
  const ready = rows.flatMap((r) =>
    r.readyAt === null ? [] : [r.readyAt - r.createdAt],
  )
  const totals = new Map(
    db
      .select({
        id: schema.orderLines.orderId,
        total: sql<number>`sum(${schema.orderLines.priceSnapshot} * ${schema.orderLines.qty})`,
      })
      .from(schema.orderLines)
      .innerJoin(schema.orders, eq(schema.orders.id, schema.orderLines.orderId))
      .where(filter)
      .groupBy(schema.orderLines.orderId)
      .all()
      .map((r) => [r.id, Number(r.total)]),
  )
  const totalOf = (id: string) => totals.get(id) ?? 0
  return {
    day,
    stats: {
      orders: rows.length,
      served: rows.filter((r) => r.status === 'served').length,
      cancelled: rows.filter((r) => r.status === 'cancelled').length,
      avgReadyMinutes: ready.length
        ? Math.round(
            ready.reduce((a, b) => a + b, 0) / ready.length / MINUTE_MS,
          )
        : null,
      // Cancelled orders never count as sales.
      revenueIdr: rows
        .filter((r) => r.status !== 'cancelled')
        .reduce((sum, r) => sum + totalOf(r.id), 0),
    },
    orders: toBoardOrders(db, rows, filter).map((order) => ({
      ...order,
      totalIdr: totalOf(order.id),
    })),
  }
}

/**
 * Deletes a day's served and cancelled orders, or one of them, with their
 * lines and records. Orders still in progress are never touched.
 */
export function deleteFinished(db: Db, day: string, orderId?: string) {
  const target = and(
    eq(schema.orders.serviceDay, day),
    inArray(schema.orders.status, FINISHED_STATUSES),
    orderId === undefined ? undefined : eq(schema.orders.id, orderId),
  )
  const ids = db
    .select({ id: schema.orders.id })
    .from(schema.orders)
    .where(target)
  db.delete(schema.orderLines)
    .where(inArray(schema.orderLines.orderId, ids))
    .run()
  db.delete(schema.orderChanges)
    .where(inArray(schema.orderChanges.orderId, ids))
    .run()
  db.delete(schema.orderEvents)
    .where(inArray(schema.orderEvents.orderId, ids))
    .run()
  db.delete(schema.displayReceipts)
    .where(inArray(schema.displayReceipts.orderId, ids))
    .run()
  return db
    .delete(schema.orders)
    .where(target)
    .returning({ id: schema.orders.id })
    .all().length
}

/** Order lines between two service days, inclusive, in the order they were sent. */
export function exportRows(db: Db, from: string, to: string): ExportRow[] {
  return db
    .select({
      day: schema.orders.serviceDay,
      ticketNo: schema.orders.ticketNo,
      status: schema.orders.status,
      destination: schema.orders.destination,
      table: schema.orders.tableLabel,
      createdAt: schema.orders.createdAt,
      staff: schema.staff.name,
      item: schema.orderLines.nameSnapshot,
      modifiers: schema.orderLines.modifiersJson,
      qty: schema.orderLines.qty,
      price: schema.orderLines.priceSnapshot,
    })
    .from(schema.orderLines)
    .innerJoin(schema.orders, eq(schema.orders.id, schema.orderLines.orderId))
    .leftJoin(schema.staff, eq(schema.staff.id, schema.orders.createdBy))
    .where(between(schema.orders.serviceDay, from, to))
    .orderBy(asc(schema.orders.createdAt), sql`${schema.orderLines}.rowid`)
    .all()
    .map((r) => ({
      service_day: r.day,
      ticket: ticketLabel(r.ticketNo),
      status: r.status,
      destination: r.destination === 'takeaway' ? 'takeaway' : (r.table ?? ''),
      created_at: new Date(r.createdAt).toISOString(),
      created_by: r.staff ?? '',
      item: r.item,
      modifiers: modifierList(r.modifiers),
      qty: r.qty,
      unit_price_idr: r.price,
      line_total_idr: r.price * r.qty,
    }))
}

function modifierList(json: string) {
  try {
    const parsed: unknown = JSON.parse(json)
    return Array.isArray(parsed) ? parsed.join('; ') : ''
  } catch {
    return ''
  }
}

/**
 * RFC 4180 CSV. A cell that starts with = + - @ (or a tab/CR) would run as a
 * formula in a spreadsheet, so it gets a leading quote mark.
 */
export function toCsv(rows: ExportRow[]) {
  const cell = (value: string | number) => {
    let text = String(value)
    if (typeof value === 'string' && /^[=+\-@\t\r]/.test(text))
      text = `'${text}`
    return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
  }
  const lines = [
    EXPORT_COLUMNS.join(','),
    ...rows.map((row) => EXPORT_COLUMNS.map((key) => cell(row[key])).join(',')),
  ]
  return `${lines.join('\r\n')}\r\n`
}
