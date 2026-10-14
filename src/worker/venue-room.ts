import { DurableObject } from 'cloudflare:workers'
import { and, eq, inArray, lt } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/durable-sqlite'
import { migrate } from 'drizzle-orm/durable-sqlite/migrator'
import { z } from 'zod'
import {
  type BoardMessage,
  renderedMessageSchema,
  type TvControl,
} from '../shared/board'
import type { Command, CommandResult } from '../shared/commands'
import type { MenuItem, Table } from '../shared/menu'
import { modifierGroupsSchema } from '../shared/menu'
import {
  type CreateOrder,
  type CreateOrderResult,
  ROLES,
} from '../shared/order'
import { buildBoard } from './board'
import {
  bumpRev,
  type Db,
  getMeta,
  getRev,
  jakartaDate,
  schema,
  setMeta,
} from './db'
import migrations from './db/migrations/migrations'
import {
  type Actor,
  createOrder,
  fail,
  orderHistory,
  type Result,
  runCommand,
} from './orders'

const DAY_MS = 24 * 60 * 60 * 1000
const MAX_CLIENT_MESSAGE = 16 * 1024

const attachmentSchema = z.object({
  deviceId: z.string(),
  role: z.enum(ROLES),
})

async function sha256(text: string) {
  const hash = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(text),
  )
  return Array.from(new Uint8Array(hash), (b) =>
    b.toString(16).padStart(2, '0'),
  ).join('')
}

/** Cleanup runs daily at 04:00 Jakarta time (21:00 UTC), outside service. */
export function nextCleanupAt(now: number) {
  const next = new Date(now)
  next.setUTCHours(21, 0, 0, 0)
  if (next.getTime() <= now) next.setTime(next.getTime() + DAY_MS)
  return next.getTime()
}

export function cleanup(db: Db, now: number) {
  const orderDays = Number(getMeta(db, 'retention_orders_days') ?? 90)
  const auditDays = Number(getMeta(db, 'retention_audit_days') ?? 180)
  const orderCutoff = now - orderDays * DAY_MS
  const auditCutoff = now - auditDays * DAY_MS
  // Active tickets are never deleted, however old.
  const old = and(
    inArray(schema.orders.status, ['served', 'cancelled']),
    lt(schema.orders.createdAt, orderCutoff),
  )
  const oldIds = db
    .select({ id: schema.orders.id })
    .from(schema.orders)
    .where(old)
  db.delete(schema.orderLines)
    .where(inArray(schema.orderLines.orderId, oldIds))
    .run()
  db.delete(schema.orderChanges)
    .where(inArray(schema.orderChanges.orderId, oldIds))
    .run()
  db.delete(schema.displayReceipts)
    .where(inArray(schema.displayReceipts.orderId, oldIds))
    .run()
  db.delete(schema.orders).where(old).run()
  db.delete(schema.operations)
    .where(lt(schema.operations.createdAt, orderCutoff))
    .run()
  db.delete(schema.orderEvents)
    .where(lt(schema.orderEvents.at, auditCutoff))
    .run()
  db.delete(schema.metrics)
    .where(lt(schema.metrics.day, jakartaDate(auditCutoff)))
    .run()
  db.delete(schema.rateLimits)
    .where(lt(schema.rateLimits.windowStart, now - DAY_MS))
    .run()
  db.delete(schema.enrollChallenges)
    .where(lt(schema.enrollChallenges.expiresAt, now - DAY_MS))
    .run()
}

export class VenueRoom extends DurableObject<Env> {
  private db: Db
  private instanceStartedAt = Date.now()
  // Lost on hibernation, which only resets the TV to page 1 and unpaused.
  private tvControl: TvControl = { paused: false, page: 0 }

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env)
    this.db = drizzle(ctx.storage, { schema })
    // Answered by the runtime without waking the object.
    ctx.setWebSocketAutoResponse(
      new WebSocketRequestResponsePair('ping', 'pong'),
    )
    ctx.blockConcurrencyWhile(async () => {
      migrate(this.db, migrations)
      if ((await ctx.storage.getAlarm()) === null) {
        await ctx.storage.setAlarm(nextCleanupAt(Date.now()))
      }
    })
  }

  async alarm() {
    this.ctx.storage.transactionSync(() => cleanup(this.db, Date.now()))
    await this.ctx.storage.setAlarm(nextCleanupAt(Date.now()))
  }

  /** WebSocket upgrade. The Worker has already authenticated the device. */
  async fetch(request: Request): Promise<Response> {
    if (request.headers.get('Upgrade') !== 'websocket') {
      return new Response('Expected websocket', { status: 426 })
    }
    const attachment = attachmentSchema.safeParse({
      deviceId: request.headers.get('x-kds-device'),
      role: request.headers.get('x-kds-role'),
    })
    if (!attachment.success) return new Response('Bad request', { status: 400 })

    const { 0: client, 1: server } = new WebSocketPair()
    this.ctx.acceptWebSocket(server, [attachment.data.role])
    server.serializeAttachment(attachment.data)
    if (attachment.data.role === 'tv') {
      // tvCount changed, so everyone gets a new board (this socket included).
      this.write(() => bumpRev(this.db))
    } else {
      server.send(JSON.stringify(this.board()))
    }
    return new Response(null, { status: 101, webSocket: client })
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
    const attachment = attachmentSchema.safeParse(ws.deserializeAttachment())
    // Only a TV sends anything besides "ping" (answered by the runtime).
    if (!attachment.success || attachment.data.role !== 'tv') {
      ws.close(1003, 'Unsupported message')
      return
    }
    if (typeof message !== 'string' || message.length > MAX_CLIENT_MESSAGE) {
      return
    }
    let parsed: unknown
    try {
      parsed = JSON.parse(message)
    } catch {
      return
    }
    const rendered = renderedMessageSchema.safeParse(parsed)
    if (!rendered.success) return
    const { deviceId } = attachment.data
    this.write(() => {
      if (this.applyReceipts(deviceId, rendered.data.items)) bumpRev(this.db)
    })
  }

  async webSocketClose(ws: WebSocket) {
    const attachment = attachmentSchema.safeParse(ws.deserializeAttachment())
    if (attachment.success && attachment.data.role === 'tv') {
      this.write(() => bumpRev(this.db))
    }
  }

  getBoard(): BoardMessage {
    return this.board()
  }

  getMenu(): { items: MenuItem[] } {
    const items = this.db
      .select()
      .from(schema.menuItems)
      .orderBy(schema.menuItems.sort, schema.menuItems.name)
      .all()
      .map((item) => ({
        id: item.id,
        name: item.name,
        priceIdr: item.priceIdr,
        category: item.category,
        available: item.available,
        modifierGroups: modifierGroupsSchema.parse(
          JSON.parse(item.modifierGroupsJson),
        ),
      }))
    return { items }
  }

  getTables(): { tables: Table[] } {
    const tables = this.db
      .select({ id: schema.tables.id, label: schema.tables.label })
      .from(schema.tables)
      .where(eq(schema.tables.active, true))
      .orderBy(schema.tables.sort, schema.tables.label)
      .all()
    return { tables }
  }

  async createOrder(
    actor: Actor,
    input: CreateOrder,
    receivedAt: number,
  ): Promise<Result<CreateOrderResult>> {
    const payloadHash = await sha256(JSON.stringify(input))
    return this.write(() =>
      createOrder(this.db, actor, input, {
        payloadHash,
        now: Date.now(),
        receivedAt,
      }),
    )
  }

  async command(
    actor: Actor,
    orderId: string,
    command: Command,
    receivedAt: number,
  ): Promise<Result<CommandResult>> {
    const payloadHash = await sha256(JSON.stringify({ orderId, command }))
    return this.write(() =>
      runCommand(this.db, actor, orderId, command, {
        payloadHash,
        now: Date.now(),
        receivedAt,
      }),
    )
  }

  getOrder(orderId: string) {
    return orderHistory(this.db, orderId)
  }

  controlTv(
    actor: Actor,
    control: TvControl,
  ): Result<{ tvControl: TvControl; rev: number }> {
    if (actor.role !== 'kitchen' && actor.role !== 'manager') {
      return fail(403, 'forbidden', 'Peran ini tidak boleh mengatur TV.')
    }
    this.tvControl = control
    const rev = this.write(() => bumpRev(this.db))
    return { ok: true, status: 200, body: { tvControl: control, rev } }
  }

  /** Opening on a new date restarts ticket numbers at A-001. */
  openServiceDay(actor: Actor): Result<{ serviceDay: string; rev: number }> {
    if (actor.role !== 'manager')
      return fail(403, 'forbidden', 'Hanya manajer.')
    return this.write(() => {
      const today = jakartaDate(Date.now())
      if (getMeta(this.db, 'service_day') !== today) {
        setMeta(this.db, 'service_day', today)
        setMeta(this.db, 'ticket_counter', '0')
      }
      setMeta(this.db, 'service_open', '1')
      return {
        ok: true,
        status: 200,
        body: { serviceDay: today, rev: bumpRev(this.db) },
      }
    })
  }

  closeServiceDay(
    actor: Actor,
    force: boolean,
  ): Result<{ serviceDay: string; rev: number }> {
    if (actor.role !== 'manager')
      return fail(403, 'forbidden', 'Hanya manajer.')
    return this.write(() => {
      const active = this.db
        .select({ id: schema.orders.id })
        .from(schema.orders)
        .where(inArray(schema.orders.status, ['new', 'accepted', 'ready']))
        .limit(1)
        .all()
      if (active.length && !force) {
        return fail(
          422,
          'invalid_transition',
          'Masih ada pesanan aktif. Selesaikan dulu atau tutup paksa.',
        )
      }
      setMeta(this.db, 'service_open', '0')
      return {
        ok: true,
        status: 200,
        body: {
          serviceDay: getMeta(this.db, 'service_day') ?? '',
          rev: bumpRev(this.db),
        },
      }
    })
  }

  /** Runs one transaction and broadcasts if it moved the board. */
  private write<T>(fn: () => T): T {
    const before = getRev(this.db)
    const result = this.ctx.storage.transactionSync(fn)
    if (getRev(this.db) !== before) this.broadcast()
    return result
  }

  /** Stores render receipts that move a TV forward; ignores stale or bogus ones. */
  private applyReceipts(
    deviceId: string,
    items: { id: string; version: number }[],
  ): boolean {
    const now = Date.now()
    let changed = false
    for (const item of items) {
      const order = this.db
        .select({ version: schema.orders.version })
        .from(schema.orders)
        .where(eq(schema.orders.id, item.id))
        .get()
      if (!order || item.version > order.version) continue
      const current = this.db
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
      this.db
        .insert(schema.displayReceipts)
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

  private board(): BoardMessage {
    const tvCount = this.ctx
      .getWebSockets('tv')
      .filter((ws) => ws.readyState === WebSocket.OPEN).length
    return buildBoard(
      this.db,
      {
        instanceStartedAt: this.instanceStartedAt,
        tvCount,
        tvControl: this.tvControl,
      },
      Date.now(),
    )
  }

  private broadcast() {
    const message = JSON.stringify(this.board())
    for (const ws of this.ctx.getWebSockets()) {
      if (ws.readyState === WebSocket.OPEN) ws.send(message)
    }
  }
}
