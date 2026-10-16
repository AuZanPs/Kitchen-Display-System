import { and, asc, eq, gt, inArray, isNull } from 'drizzle-orm'
import { z } from 'zod'
import type { OrderStatus } from '../shared/board'
import {
  COMMAND_ROLES,
  type Command,
  type CommandResult,
  commandResultSchema,
  decide,
} from '../shared/commands'
import { chooseOptions, modifierGroupsSchema } from '../shared/menu'
import {
  type ApiError,
  type CreateOrder,
  type CreateOrderResult,
  createOrderResultSchema,
  type Destination,
  type ErrorCode,
  type OrderLineInput,
  type Role,
  ticketLabel,
} from '../shared/order'
import {
  boardOrder,
  type ChangePayload,
  changePayloadSchema,
  summarizeChange,
} from './board'
import {
  bumpRev,
  type Db,
  getMeta,
  getRev,
  recordMetric,
  rollServiceDay,
  schema,
  setMeta,
} from './db'

export type Actor = {
  role: Role
  deviceId: string
  staffId: string | null
  managerUser: string | null
}

export type Failure = {
  ok: false
  status: 401 | 403 | 404 | 409 | 422 | 429
  body: ApiError
}
export type Result<T> = { ok: true; status: 200 | 201; body: T } | Failure

/** Timing and idempotency inputs computed outside the transaction. */
export type WriteContext = {
  payloadHash: string
  now: number
  receivedAt: number
}

export function fail(
  status: Failure['status'],
  code: ErrorCode,
  message: string,
  details?: unknown,
): Failure {
  return { ok: false, status, body: { error: { code, message, details } } }
}

function actorKey(actor: Actor) {
  return [actor.deviceId, actor.staffId ?? '', actor.managerUser ?? ''].join(
    ':',
  )
}

function actorName(actor: Actor) {
  return actor.staffId ?? actor.managerUser ?? actor.deviceId
}

function forbidden(): Failure {
  return fail(403, 'forbidden', 'Peran ini tidak boleh melakukan itu.')
}

// --- idempotency -----------------------------------------------------------

type Previous =
  | { kind: 'none' }
  | { kind: 'conflict'; failure: Failure }
  | { kind: 'replay'; response: unknown }

function previousOperation(
  db: Db,
  operationId: string,
  key: string,
  hash: string,
): Previous {
  const row = db
    .select()
    .from(schema.operations)
    .where(eq(schema.operations.operationId, operationId))
    .get()
  if (!row) return { kind: 'none' }
  if (row.actorKey !== key || row.payloadHash !== hash) {
    return {
      kind: 'conflict',
      failure: fail(
        409,
        'operation_conflict',
        'Permintaan ini sudah dikirim dengan isi berbeda.',
      ),
    }
  }
  return { kind: 'replay', response: JSON.parse(row.responseJson) }
}

function saveOperation(
  db: Db,
  operationId: string,
  key: string,
  ctx: WriteContext,
  body: unknown,
) {
  db.insert(schema.operations)
    .values({
      operationId,
      actorKey: key,
      payloadHash: ctx.payloadHash,
      responseJson: JSON.stringify(body),
      createdAt: ctx.now,
    })
    .run()
}

// --- menu and tables ---------------------------------------------------------

type LineRow = {
  menuItemId: string
  nameSnapshot: string
  priceSnapshot: number
  qty: number
  modifiersJson: string
  note: string | null
  allergy: string | null
}

type LineProblem = { index: number; code: ErrorCode; message: string }

function resolveLines(
  db: Db,
  lines: OrderLineInput[],
): { ok: true; rows: LineRow[] } | Failure {
  const ids = [...new Set(lines.map((l) => l.menuItemId))]
  const items = new Map(
    db
      .select()
      .from(schema.menuItems)
      .where(inArray(schema.menuItems.id, ids))
      .all()
      .map((item) => [item.id, item]),
  )
  const problems: LineProblem[] = []
  const rows: LineRow[] = []
  lines.forEach((line, index) => {
    const item = items.get(line.menuItemId)
    if (!item || item.hidden) {
      problems.push({ index, code: 'unknown_item', message: 'Menu tidak ada.' })
      return
    }
    if (!item.available) {
      problems.push({
        index,
        code: 'item_unavailable',
        message: `${item.name} sedang habis.`,
      })
      return
    }
    const groups = modifierGroupsSchema.parse(
      JSON.parse(item.modifierGroupsJson),
    )
    const chosen = chooseOptions(groups, line.optionIds)
    if (!chosen.ok) {
      problems.push({
        index,
        code: 'invalid_modifier',
        message: `${item.name}: ${chosen.message}`,
      })
      return
    }
    // Prices always come from the server's menu, never from the client.
    rows.push({
      menuItemId: item.id,
      nameSnapshot: item.name,
      priceSnapshot: item.priceIdr + chosen.priceDeltaIdr,
      qty: line.qty,
      modifiersJson: JSON.stringify(chosen.names),
      note: line.note || null,
      allergy: line.allergy || null,
    })
  })
  const first = problems[0]
  if (first) return fail(422, first.code, first.message, { lines: problems })
  return { ok: true, rows }
}

function resolveTable(db: Db, tableId: string): string | Failure {
  const table = db
    .select()
    .from(schema.tables)
    .where(eq(schema.tables.id, tableId))
    .get()
  if (!table?.active) {
    return fail(422, 'invalid_input', 'Meja tidak ditemukan.', {
      field: 'tableId',
    })
  }
  return table.label
}

function serviceClosed(db: Db): Failure | null {
  return getMeta(db, 'service_open') === '1'
    ? null
    : fail(422, 'service_closed', 'Hari layanan belum dibuka.')
}

// --- writes ------------------------------------------------------------------

const eventPayloadSchema = z.object({ summary: z.string() })

function addEvent(
  db: Db,
  actor: Actor,
  orderId: string,
  version: number,
  type: string,
  payload: { summary: string } & Record<string, unknown>,
  at: number,
) {
  db.insert(schema.orderEvents)
    .values({
      orderId,
      version,
      type,
      staffId: actor.staffId,
      deviceId: actor.deviceId,
      managerUser: actor.managerUser,
      payloadJson: JSON.stringify(payload),
      at,
    })
    .run()
}

function insertLines(
  db: Db,
  orderId: string,
  rows: LineRow[],
  version: number,
) {
  // One row per statement: a 25-line multi-row insert would pass the 100
  // bound parameter limit of Durable Object SQLite.
  for (const row of rows) {
    db.insert(schema.orderLines)
      .values({
        ...row,
        id: crypto.randomUUID(),
        orderId,
        addedInVersion: version,
      })
      .run()
  }
}

function insertOrder(
  db: Db,
  actor: Actor,
  order: {
    destination: Destination['type']
    tableLabel: string | null
    orderNote: string | null
    lines: LineRow[]
    linkedTo: string | null
  },
  now: number,
) {
  // A day left open past midnight rolls over with its first new ticket.
  const serviceDay = rollServiceDay(db, now)
  const ticketNo = Number(getMeta(db, 'ticket_counter') ?? 0) + 1
  setMeta(db, 'ticket_counter', String(ticketNo))
  const orderId = crypto.randomUUID()
  db.insert(schema.orders)
    .values({
      id: orderId,
      ticketNo,
      serviceDay,
      destination: order.destination,
      tableLabel: order.tableLabel,
      orderNote: order.orderNote,
      status: 'new',
      version: 1,
      createdBy: actorName(actor),
      createdAt: now,
      linkedTo: order.linkedTo,
    })
    .run()
  insertLines(db, orderId, order.lines, 1)
  addEvent(
    db,
    actor,
    orderId,
    1,
    'created',
    {
      summary: `Pesanan ${ticketLabel(ticketNo)} dibuat`,
      linkedTo: order.linkedTo,
    },
    now,
  )
  return { orderId, ticketNo }
}

export function createOrder(
  db: Db,
  actor: Actor,
  input: CreateOrder,
  ctx: WriteContext,
): Result<CreateOrderResult> {
  if (!COMMAND_ROLES.create.includes(actor.role)) return forbidden()
  const key = actorKey(actor)
  const previous = previousOperation(
    db,
    input.operationId,
    key,
    ctx.payloadHash,
  )
  if (previous.kind === 'conflict') return previous.failure
  if (previous.kind === 'replay') {
    const body = createOrderResultSchema.parse(previous.response)
    return { ok: true, status: 201, body: { ...body, replayed: true } }
  }

  const closed = serviceClosed(db)
  if (closed) return closed
  let tableLabel: string | null = null
  if (input.destination.type === 'table') {
    const label = resolveTable(db, input.destination.tableId)
    if (typeof label !== 'string') return label
    tableLabel = label
  }
  const lines = resolveLines(db, input.lines)
  if (!lines.ok) return lines

  const { orderId, ticketNo } = insertOrder(
    db,
    actor,
    {
      destination: input.destination.type,
      tableLabel,
      orderNote: input.orderNote || null,
      lines: lines.rows,
      linkedTo: null,
    },
    ctx.now,
  )
  const body = { orderId, ticketNo, version: 1, rev: bumpRev(db) }
  saveOperation(db, input.operationId, key, ctx, body)
  recordMetric(db, 'order_commit_ms', ctx.now - ctx.receivedAt, ctx.now)
  return { ok: true, status: 201, body }
}

type OrderRow = typeof schema.orders.$inferSelect

function pendingChanges(db: Db, orderId: string): ChangePayload[] {
  return db
    .select({ payloadJson: schema.orderChanges.payloadJson })
    .from(schema.orderChanges)
    .where(
      and(
        eq(schema.orderChanges.orderId, orderId),
        isNull(schema.orderChanges.ackedAt),
      ),
    )
    .all()
    .map((c) => changePayloadSchema.parse(JSON.parse(c.payloadJson)))
}

function orderState(db: Db, order: OrderRow) {
  const lines = db
    .select({ allergy: schema.orderLines.allergy })
    .from(schema.orderLines)
    .where(eq(schema.orderLines.orderId, order.id))
    .all()
  return {
    status: order.status,
    version: order.version,
    changePending: order.changePending,
    cancelRequested: order.cancelRequested,
    hasAllergy: lines.some((l) => l.allergy),
    pendingChangeHasAllergy: pendingChanges(db, order.id).some(
      (c) => c.kind === 'add_lines' && c.lines.some((l) => l.allergy),
    ),
    lineCount: lines.length,
  }
}

/** Readable list of what happened to an order after `version`. */
function changesSince(db: Db, orderId: string, version: number): string[] {
  return db
    .select({ payloadJson: schema.orderEvents.payloadJson })
    .from(schema.orderEvents)
    .where(
      and(
        eq(schema.orderEvents.orderId, orderId),
        gt(schema.orderEvents.version, version),
      ),
    )
    .orderBy(asc(schema.orderEvents.seq))
    .all()
    .map(
      (e) =>
        eventPayloadSchema.parse(JSON.parse(e.payloadJson ?? '{}')).summary,
    )
}

const SUMMARIES: Record<Command['type'], string> = {
  accept: 'Diterima dapur',
  ackChange: 'Perubahan diterima dapur',
  ready: 'Siap diantar',
  serve: 'Sudah diantar',
  addLines: 'Tambah item',
  moveTable: 'Pindah meja',
  requestCancel: 'Minta pembatalan',
  ackCancel: 'Pembatalan dikonfirmasi',
  managerCancel: 'Dibatalkan manajer',
}

const STATUS_TIME: Partial<
  Record<OrderStatus, 'acceptedAt' | 'readyAt' | 'servedAt' | 'cancelledAt'>
> = {
  accepted: 'acceptedAt',
  ready: 'readyAt',
  served: 'servedAt',
  cancelled: 'cancelledAt',
}

export function runCommand(
  db: Db,
  actor: Actor,
  orderId: string,
  command: Command,
  ctx: WriteContext,
): Result<CommandResult> {
  if (!COMMAND_ROLES[command.type].includes(actor.role)) return forbidden()
  const key = actorKey(actor)
  const previous = previousOperation(
    db,
    command.operationId,
    key,
    ctx.payloadHash,
  )
  if (previous.kind === 'conflict') return previous.failure
  if (previous.kind === 'replay') {
    const body = commandResultSchema.parse(previous.response)
    return { ok: true, status: 200, body: { ...body, replayed: true } }
  }

  const order = db
    .select()
    .from(schema.orders)
    .where(eq(schema.orders.id, orderId))
    .get()
  if (!order) return fail(404, 'not_found', 'Pesanan tidak ditemukan.')

  const decision = decide(orderState(db, order), command)

  if (decision.kind === 'reject') {
    if (decision.code === 'stale_version') {
      return fail(409, 'stale_version', decision.message, {
        current: boardOrder(db, order.id),
        changes: changesSince(db, order.id, command.expectedVersion),
      })
    }
    return fail(422, decision.code, decision.message)
  }

  if (decision.kind === 'noop') {
    const body = {
      orderId,
      version: order.version,
      status: order.status,
      noop: true,
      rev: getRev(db),
    }
    saveOperation(db, command.operationId, key, ctx, body)
    return { ok: true, status: 200, body }
  }

  if (decision.kind === 'linked') {
    if (command.type !== 'addLines') throw new Error('linked without addLines')
    const closed = serviceClosed(db)
    if (closed) return closed
    const lines = resolveLines(db, command.lines)
    if (!lines.ok) return lines
    const linked = insertOrder(
      db,
      actor,
      {
        destination: order.destination,
        tableLabel: order.tableLabel,
        orderNote: null,
        lines: lines.rows,
        linkedTo: order.id,
      },
      ctx.now,
    )
    addEvent(
      db,
      actor,
      order.id,
      order.version,
      'addLines',
      {
        summary: `Tambahan dibuat sebagai ${ticketLabel(linked.ticketNo)}`,
        linkedOrderId: linked.orderId,
      },
      ctx.now,
    )
    const body = {
      orderId,
      version: order.version,
      status: order.status,
      noop: false,
      linkedOrderId: linked.orderId,
      linkedTicketNo: linked.ticketNo,
      rev: bumpRev(db),
    }
    saveOperation(db, command.operationId, key, ctx, body)
    return { ok: true, status: 200, body }
  }

  // Validate everything the command needs before the first write.
  const version = order.version + 1
  const patch: Partial<OrderRow> = { ...decision.patch }
  let change: ChangePayload | null = null
  let newLines: LineRow[] = []
  let summary = SUMMARIES[command.type]

  switch (command.type) {
    case 'addLines': {
      const lines = resolveLines(db, command.lines)
      if (!lines.ok) return lines
      newLines = lines.rows
      change = {
        kind: 'add_lines',
        lines: newLines.map((l) => ({
          qty: l.qty,
          name: l.nameSnapshot,
          allergy: l.allergy,
        })),
      }
      summary = summarizeChange(change)
      break
    }
    case 'moveTable': {
      const label = resolveTable(db, command.tableId)
      if (typeof label !== 'string') return label
      if (label === order.tableLabel) {
        return fail(422, 'invalid_input', 'Pesanan sudah di meja itu.')
      }
      patch.destination = 'table'
      patch.tableLabel = label
      summary = summarizeChange({
        kind: 'move_table',
        from: order.tableLabel,
        to: label,
      })
      // Ready food has nothing left to cook, so no kitchen acknowledgement.
      if (decision.patch.changePending) {
        change = { kind: 'move_table', from: order.tableLabel, to: label }
      }
      break
    }
    case 'requestCancel':
    case 'managerCancel':
      patch.cancelReason = command.reason
      summary = `${summary}: ${command.reason}`
      break
  }

  const statusTime = patch.status ? STATUS_TIME[patch.status] : undefined
  if (statusTime) patch[statusTime] = ctx.now
  const update = { ...patch, version }
  const before = Object.fromEntries(
    Object.keys(update).map((k) => [k, order[k as keyof OrderRow]]),
  )
  db.update(schema.orders)
    .set(update)
    .where(eq(schema.orders.id, order.id))
    .run()

  if (newLines.length) insertLines(db, order.id, newLines, version)
  if (change) {
    db.insert(schema.orderChanges)
      .values({
        id: crypto.randomUUID(),
        orderId: order.id,
        version,
        kind: change.kind,
        payloadJson: JSON.stringify(change),
        createdAt: ctx.now,
      })
      .run()
  }
  if (decision.patch.changePending === false) {
    // Accepting or acknowledging covers every change made so far.
    db.update(schema.orderChanges)
      .set({ ackedAt: ctx.now, ackedBy: actorName(actor) })
      .where(
        and(
          eq(schema.orderChanges.orderId, order.id),
          isNull(schema.orderChanges.ackedAt),
        ),
      )
      .run()
  }
  addEvent(
    db,
    actor,
    order.id,
    version,
    command.type,
    {
      summary,
      before,
      after: update,
      ...(command.type === 'managerCancel' ? { override: true } : {}),
    },
    ctx.now,
  )

  const body = {
    orderId,
    version,
    status: patch.status ?? order.status,
    noop: false,
    rev: bumpRev(db),
  }
  saveOperation(db, command.operationId, key, ctx, body)
  return { ok: true, status: 200, body }
}

export function orderHistory(db: Db, orderId: string) {
  const order = boardOrder(db, orderId)
  if (!order) return fail(404, 'not_found', 'Pesanan tidak ditemukan.')
  const events = db
    .select()
    .from(schema.orderEvents)
    .where(eq(schema.orderEvents.orderId, orderId))
    .orderBy(asc(schema.orderEvents.seq))
    .all()
    .map((e) => ({
      seq: e.seq,
      version: e.version,
      type: e.type,
      summary: eventPayloadSchema.parse(JSON.parse(e.payloadJson ?? '{}'))
        .summary,
      staffId: e.staffId,
      deviceId: e.deviceId,
      managerUser: e.managerUser,
      at: e.at,
    }))
  return { ok: true as const, status: 200 as const, body: { order, events } }
}
