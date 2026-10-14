import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { DESTINATIONS, ORDER_STATUSES } from '../../shared/board'

export const meta = sqliteTable('meta', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
})

export const orders = sqliteTable(
  'orders',
  {
    id: text('id').primaryKey(),
    ticketNo: integer('ticket_no').notNull(),
    serviceDay: text('service_day').notNull(),
    destination: text('destination', { enum: DESTINATIONS }).notNull(),
    tableLabel: text('table_label'),
    status: text('status', { enum: ORDER_STATUSES }).notNull(),
    version: integer('version').notNull(),
    changePending: integer('change_pending', { mode: 'boolean' })
      .notNull()
      .default(false),
    cancelRequested: integer('cancel_requested', { mode: 'boolean' })
      .notNull()
      .default(false),
    cancelReason: text('cancel_reason'),
    createdBy: text('created_by').notNull(),
    createdAt: integer('created_at').notNull(),
    acceptedAt: integer('accepted_at'),
    readyAt: integer('ready_at'),
    servedAt: integer('served_at'),
    linkedTo: text('linked_to'),
  },
  (t) => [index('orders_status_service_day_idx').on(t.status, t.serviceDay)],
)
