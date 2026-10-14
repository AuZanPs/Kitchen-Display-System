import {
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
} from 'drizzle-orm/sqlite-core'
import { CHANGE_KINDS, DESTINATIONS, ORDER_STATUSES } from '../../shared/board'
import { ROLES } from '../../shared/order'

export const meta = sqliteTable('meta', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
})

export const staff = sqliteTable('staff', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  role: text('role', { enum: ROLES }).notNull(),
  pinHash: text('pin_hash'),
  pinSalt: text('pin_salt'),
  disabledAt: integer('disabled_at'),
})

export const devices = sqliteTable('devices', {
  id: text('id').primaryKey(),
  label: text('label').notNull(),
  role: text('role', { enum: ROLES }).notNull(),
  tokenHash: text('token_hash').notNull(),
  createdAt: integer('created_at').notNull(),
  lastSeenAt: integer('last_seen_at'),
  revokedAt: integer('revoked_at'),
})

export const enrollChallenges = sqliteTable('enroll_challenges', {
  id: text('id').primaryKey(),
  codeHash: text('code_hash').notNull(),
  secretHash: text('secret_hash').notNull(),
  expiresAt: integer('expires_at').notNull(),
  attempts: integer('attempts').notNull().default(0),
  consumedAt: integer('consumed_at'),
  approvedRole: text('approved_role', { enum: ROLES }),
  approvedLabel: text('approved_label'),
  createdIpHash: text('created_ip_hash').notNull(),
})

export const tables = sqliteTable('tables', {
  id: text('id').primaryKey(),
  label: text('label').notNull(),
  active: integer('active', { mode: 'boolean' }).notNull().default(true),
  sort: integer('sort').notNull().default(0),
})

export const menuItems = sqliteTable('menu_items', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  priceIdr: integer('price_idr').notNull(),
  category: text('category').notNull(),
  available: integer('available', { mode: 'boolean' }).notNull().default(true),
  sort: integer('sort').notNull().default(0),
  modifierGroupsJson: text('modifier_groups_json').notNull().default('[]'),
  updatedAt: integer('updated_at').notNull(),
})

export const orders = sqliteTable(
  'orders',
  {
    id: text('id').primaryKey(),
    ticketNo: integer('ticket_no').notNull(),
    serviceDay: text('service_day').notNull(),
    destination: text('destination', { enum: DESTINATIONS }).notNull(),
    tableLabel: text('table_label'),
    orderNote: text('order_note'),
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
    cancelledAt: integer('cancelled_at'),
    linkedTo: text('linked_to'),
  },
  (t) => [
    index('orders_status_service_day_idx').on(t.status, t.serviceDay),
    index('orders_served_at_idx').on(t.servedAt),
    index('orders_cancelled_at_idx').on(t.cancelledAt),
  ],
)

export const orderLines = sqliteTable(
  'order_lines',
  {
    id: text('id').primaryKey(),
    orderId: text('order_id').notNull(),
    menuItemId: text('menu_item_id').notNull(),
    nameSnapshot: text('name_snapshot').notNull(),
    priceSnapshot: integer('price_snapshot').notNull(),
    qty: integer('qty').notNull(),
    modifiersJson: text('modifiers_json').notNull().default('[]'),
    note: text('note'),
    allergy: text('allergy'),
    addedInVersion: integer('added_in_version').notNull(),
  },
  (t) => [index('order_lines_order_id_idx').on(t.orderId)],
)

export const orderChanges = sqliteTable(
  'order_changes',
  {
    id: text('id').primaryKey(),
    orderId: text('order_id').notNull(),
    version: integer('version').notNull(),
    kind: text('kind', { enum: CHANGE_KINDS }).notNull(),
    payloadJson: text('payload_json').notNull(),
    createdAt: integer('created_at').notNull(),
    ackedAt: integer('acked_at'),
    ackedBy: text('acked_by'),
  },
  (t) => [index('order_changes_order_id_idx').on(t.orderId)],
)

export const orderEvents = sqliteTable(
  'order_events',
  {
    seq: integer('seq').primaryKey({ autoIncrement: true }),
    orderId: text('order_id').notNull(),
    version: integer('version').notNull(),
    type: text('type').notNull(),
    staffId: text('staff_id'),
    deviceId: text('device_id'),
    managerUser: text('manager_user'),
    payloadJson: text('payload_json'),
    at: integer('at').notNull(),
  },
  (t) => [index('order_events_order_id_idx').on(t.orderId)],
)

export const operations = sqliteTable('operations', {
  operationId: text('operation_id').primaryKey(),
  actorKey: text('actor_key').notNull(),
  payloadHash: text('payload_hash').notNull(),
  responseJson: text('response_json').notNull(),
  createdAt: integer('created_at').notNull(),
})

export const displayReceipts = sqliteTable(
  'display_receipts',
  {
    orderId: text('order_id').notNull(),
    deviceId: text('device_id').notNull(),
    version: integer('version').notNull(),
    renderedAt: integer('rendered_at').notNull(),
  },
  (t) => [primaryKey({ columns: [t.orderId, t.deviceId] })],
)

export const rateLimits = sqliteTable('rate_limits', {
  key: text('key').primaryKey(),
  windowStart: integer('window_start').notNull(),
  count: integer('count').notNull(),
})

export const metrics = sqliteTable(
  'metrics',
  {
    day: text('day').notNull(),
    name: text('name').notNull(),
    count: integer('count').notNull(),
    sum: integer('sum').notNull(),
    max: integer('max').notNull(),
  },
  (t) => [primaryKey({ columns: [t.day, t.name] })],
)
