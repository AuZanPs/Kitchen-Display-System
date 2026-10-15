import { and, asc, between, eq, ne, sql } from 'drizzle-orm'
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
  const revenue = db
    .select({
      total: sql<number>`coalesce(sum(${schema.orderLines.priceSnapshot} * ${schema.orderLines.qty}), 0)`,
    })
    .from(schema.orderLines)
    .innerJoin(schema.orders, eq(schema.orders.id, schema.orderLines.orderId))
    .where(and(filter, ne(schema.orders.status, 'cancelled')))
    .get()
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
      revenueIdr: Number(revenue?.total ?? 0),
    },
    orders: toBoardOrders(db, rows, filter),
  }
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
