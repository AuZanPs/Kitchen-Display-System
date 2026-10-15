import { DurableObject } from 'cloudflare:workers'
import { and, eq, inArray, lt } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/durable-sqlite'
import { migrate } from 'drizzle-orm/durable-sqlite/migrator'
import { z } from 'zod'
import {
  type BoardMessage,
  renderedMessageSchema,
  type Settings,
  type TvControl,
} from '../shared/board'
import type { Command, CommandResult } from '../shared/commands'
import type { ExportRow, History } from '../shared/history'
import type {
  AdminMenuItem,
  AdminTable,
  MenuItem,
  MenuItemInput,
  Table,
  TableInput,
} from '../shared/menu'
import { modifierGroupsSchema } from '../shared/menu'
import {
  type CreateOrder,
  type CreateOrderResult,
  ROLES,
  type Role,
} from '../shared/order'
import type {
  AdminStaff,
  StaffInput,
  StaffLogin,
  StaffMember,
} from '../shared/staff'
import { randomCode, randomHex, safeEqual, sha256Hex } from './auth/crypto'
import { buildBoard } from './board'
import {
  bumpRev,
  type Db,
  getMeta,
  getRev,
  getSettings,
  jakartaDate,
  schema,
  setMeta,
  setSettings,
} from './db'
import migrations from './db/migrations/migrations'
import {
  type Approve,
  allowAttempt,
  approveChallenge,
  type Credentials,
  ENROLL_TTL_MS,
  insertChallenge,
  isLockedOut,
  listDevices,
  type Poll,
  pollChallenge,
  revokeDevice,
  touchDevice,
  unauthenticated,
} from './devices'
import { dayHistory, exportRows } from './history'
import { adminMenu, adminTables, saveMenuItem, saveTable } from './menu'
import {
  type Actor,
  createOrder,
  fail,
  orderHistory,
  type Result,
  runCommand,
} from './orders'
import {
  adminStaff,
  canSignIn,
  hashPin,
  PIN_TRIES,
  pinKeys,
  pinMatches,
  pinTag,
  saveStaff,
  staffForRole,
  staffRow,
} from './staff'

const DAY_MS = 24 * 60 * 60 * 1000
const MINUTE_MS = 60 * 1000
const MAX_CLIENT_MESSAGE = 16 * 1024
/** WebSocket close code sent to a revoked device. */
export const CLOSE_REVOKED = 4001

const attachmentSchema = z.object({
  deviceId: z.string(),
  role: z.enum(ROLES),
})

const ADMIN_ACTOR: Actor = {
  role: 'manager',
  deviceId: 'admin',
  staffId: null,
  managerUser: 'admin',
}

/** The Worker forwards socket credentials in headers only it can set. */
function socketCredentials(headers: Headers): Credentials {
  if (headers.get('x-kds-admin') === '1') return { kind: 'admin' }
  const deviceId = headers.get('x-kds-device-id')
  const secret = headers.get('x-kds-device-secret')
  return deviceId && secret
    ? { kind: 'device', deviceId, secret }
    : { kind: 'none' }
}

function ok<T>(body: T): Result<T> {
  return { ok: true, status: 200, body }
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

  /** WebSocket upgrade. The Worker checked the origin; the room checks who it is. */
  async fetch(request: Request): Promise<Response> {
    if (request.headers.get('Upgrade') !== 'websocket') {
      return new Response('Expected websocket', { status: 426 })
    }
    const actor = await this.authenticate(socketCredentials(request.headers))
    if (!actor) return new Response('Unauthenticated', { status: 401 })

    const { 0: client, 1: server } = new WebSocketPair()
    this.ctx.acceptWebSocket(server, [actor.role, `device:${actor.deviceId}`])
    server.serializeAttachment({ deviceId: actor.deviceId, role: actor.role })
    this.ctx.storage.transactionSync(() =>
      touchDevice(this.db, actor.deviceId, Date.now()),
    )
    if (actor.role === 'tv') {
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
    if (attachment.success) {
      const { deviceId } = attachment.data
      this.ctx.storage.transactionSync(() =>
        touchDevice(this.db, deviceId, Date.now()),
      )
    }
    if (attachment.success && attachment.data.role === 'tv') {
      this.write(() => bumpRev(this.db))
    }
  }

  async session(
    credentials: Credentials,
  ): Promise<Result<{ role: Role; label: string; staff: StaffMember | null }>> {
    const actor = await this.authenticate(credentials)
    if (!actor) return unauthenticated()
    const device = this.db
      .select({ label: schema.devices.label })
      .from(schema.devices)
      .where(eq(schema.devices.id, actor.deviceId))
      .get()
    const staff = actor.staffId ? staffRow(this.db, actor.staffId) : undefined
    return ok({
      role: actor.role,
      label: device?.label ?? 'Admin',
      staff: staff ? { id: staff.id, name: staff.name } : null,
    })
  }

  /** Names a device may sign in as; empty for the TV. */
  async listStaff(
    credentials: Credentials,
  ): Promise<Result<{ staff: StaffMember[] }>> {
    const actor = await this.authenticate(credentials)
    if (!actor || credentials.kind !== 'device') return unauthenticated()
    return ok({ staff: staffForRole(this.db, actor.role) })
  }

  /** Checks a PIN; the Worker turns success into a device-bound cookie. */
  async staffLogin(
    credentials: Credentials,
    input: StaffLogin,
  ): Promise<Result<{ staff: StaffMember; deviceId: string; pinTag: string }>> {
    const actor = await this.authenticate(credentials)
    if (!actor || credentials.kind !== 'device') return unauthenticated()
    const keys = pinKeys(input.staffId, actor.deviceId)
    const now = Date.now()
    // Only a device that could sign this person in spends their attempts, so
    // a kitchen phone cannot lock out a waiter and made-up ids write nothing.
    const row = staffRow(this.db, input.staffId)
    const target = row && canSignIn(row, actor.role) ? row : undefined
    const locked = (key: string, limit: number) =>
      isLockedOut(this.db, key, limit, DAY_MS, now)
    // Short windows count every try, before the hash; daily caps count misses.
    const allowed =
      !locked(keys.deviceDay, PIN_TRIES.deviceWrongPerDay) &&
      !(target && locked(keys.staffDay, PIN_TRIES.staffWrongPerDay)) &&
      this.allowAttempt(keys.device, PIN_TRIES.device, MINUTE_MS) &&
      (!target ||
        this.allowAttempt(keys.staff, PIN_TRIES.staff, PIN_TRIES.staffWindowMs))
    if (!allowed) {
      return fail(429, 'rate_limited', 'Terlalu banyak percobaan. Tunggu.')
    }
    if (!target || !(await pinMatches(target, input.pin))) {
      this.ctx.storage.transactionSync(() => {
        const miss = (key: string, limit: number) =>
          allowAttempt(this.db, key, limit, DAY_MS, now)
        miss(keys.deviceDay, PIN_TRIES.deviceWrongPerDay)
        if (target) miss(keys.staffDay, PIN_TRIES.staffWrongPerDay)
      })
      return fail(401, 'unauthenticated', 'Nama atau PIN salah.')
    }
    this.ctx.storage.transactionSync(() =>
      this.db
        .delete(schema.rateLimits)
        .where(eq(schema.rateLimits.key, keys.staff))
        .run(),
    )
    return ok({
      staff: { id: target.id, name: target.name },
      deviceId: actor.deviceId,
      pinTag: pinTag(target),
    })
  }

  /** One service day for the admin; today (Jakarta) when no day is given. */
  history(credentials: Credentials, day: string | undefined): Result<History> {
    if (credentials.kind !== 'admin') return unauthenticated()
    return ok(dayHistory(this.db, day ?? jakartaDate(Date.now())))
  }

  exportRows(
    credentials: Credentials,
    from: string,
    to: string,
  ): Result<{ rows: ExportRow[] }> {
    if (credentials.kind !== 'admin') return unauthenticated()
    return ok({ rows: exportRows(this.db, from, to) })
  }

  adminStaff(credentials: Credentials): Result<{ staff: AdminStaff[] }> {
    if (credentials.kind !== 'admin') return unauthenticated()
    return ok({ staff: adminStaff(this.db) })
  }

  /** Creates the staff member when `id` is null, otherwise replaces it. */
  async saveStaff(
    credentials: Credentials,
    id: string | null,
    input: StaffInput,
  ): Promise<Result<{ staff: AdminStaff }>> {
    if (credentials.kind !== 'admin') return unauthenticated()
    const pin = input.pin ? await hashPin(input.pin) : null
    const staff = this.ctx.storage.transactionSync(() =>
      saveStaff(this.db, id, input, pin, Date.now()),
    )
    if (!staff) return fail(404, 'not_found', 'Staf tidak ditemukan.')
    return { ok: true, status: id === null ? 201 : 200, body: { staff } }
  }

  async getBoard(credentials: Credentials): Promise<Result<BoardMessage>> {
    if (!(await this.authenticate(credentials))) return unauthenticated()
    return ok(this.board())
  }

  async getMenu(
    credentials: Credentials,
  ): Promise<Result<{ items: MenuItem[] }>> {
    if (!(await this.authenticate(credentials))) return unauthenticated()
    const items = this.db
      .select()
      .from(schema.menuItems)
      .where(eq(schema.menuItems.hidden, false))
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
    return ok({ items })
  }

  async getTables(
    credentials: Credentials,
  ): Promise<Result<{ tables: Table[] }>> {
    if (!(await this.authenticate(credentials))) return unauthenticated()
    const tables = this.db
      .select({ id: schema.tables.id, label: schema.tables.label })
      .from(schema.tables)
      .where(eq(schema.tables.active, true))
      .orderBy(schema.tables.sort, schema.tables.label)
      .all()
    return ok({ tables })
  }

  async createOrder(
    credentials: Credentials,
    input: CreateOrder,
    receivedAt: number,
  ): Promise<Result<CreateOrderResult>> {
    const actor = await this.authenticate(credentials)
    if (!actor) return unauthenticated()
    const signedOut = this.staffRequired(actor)
    if (signedOut) return signedOut
    const payloadHash = await sha256Hex(JSON.stringify(input))
    return this.write(() =>
      createOrder(this.db, actor, input, {
        payloadHash,
        now: Date.now(),
        receivedAt,
      }),
    )
  }

  async command(
    credentials: Credentials,
    orderId: string,
    command: Command,
    receivedAt: number,
  ): Promise<Result<CommandResult>> {
    const actor = await this.authenticate(credentials)
    if (!actor) return unauthenticated()
    const signedOut = this.staffRequired(actor)
    if (signedOut) return signedOut
    const payloadHash = await sha256Hex(JSON.stringify({ orderId, command }))
    return this.write(() =>
      runCommand(this.db, actor, orderId, command, {
        payloadHash,
        now: Date.now(),
        receivedAt,
      }),
    )
  }

  async getOrder(credentials: Credentials, orderId: string) {
    if (!(await this.authenticate(credentials))) return unauthenticated()
    return orderHistory(this.db, orderId)
  }

  async controlTv(
    credentials: Credentials,
    control: TvControl,
  ): Promise<Result<{ tvControl: TvControl; rev: number }>> {
    const actor = await this.authenticate(credentials)
    if (!actor) return unauthenticated()
    if (actor.role !== 'kitchen' && actor.role !== 'manager') {
      return fail(403, 'forbidden', 'Peran ini tidak boleh mengatur TV.')
    }
    const signedOut = this.staffRequired(actor)
    if (signedOut) return signedOut
    this.tvControl = control
    const rev = this.write(() => bumpRev(this.db))
    return { ok: true, status: 200, body: { tvControl: control, rev } }
  }

  getTvControl(): TvControl {
    return this.tvControl
  }

  /** Opening on a new date restarts ticket numbers at A-001. */
  async openServiceDay(
    credentials: Credentials,
  ): Promise<Result<{ serviceDay: string; rev: number }>> {
    const actor = await this.authenticate(credentials)
    if (!actor) return unauthenticated()
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

  async closeServiceDay(
    credentials: Credentials,
    force: boolean,
  ): Promise<Result<{ serviceDay: string; rev: number }>> {
    const actor = await this.authenticate(credentials)
    if (!actor) return unauthenticated()
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

  updateSettings(
    credentials: Credentials,
    settings: Settings,
  ): Result<{ settings: Settings; rev: number }> {
    if (credentials.kind !== 'admin') return unauthenticated()
    return this.write(() => {
      setSettings(this.db, settings)
      return ok({ settings, rev: bumpRev(this.db) })
    })
  }

  adminMenu(credentials: Credentials): Result<{ items: AdminMenuItem[] }> {
    if (credentials.kind !== 'admin') return unauthenticated()
    return ok({ items: adminMenu(this.db) })
  }

  /** Creates the item when `id` is null, otherwise replaces it. */
  saveMenuItem(
    credentials: Credentials,
    id: string | null,
    input: MenuItemInput,
  ): Result<{ item: AdminMenuItem }> {
    if (credentials.kind !== 'admin') return unauthenticated()
    const item = this.write(() => saveMenuItem(this.db, id, input, Date.now()))
    if (!item) return fail(404, 'not_found', 'Menu tidak ditemukan.')
    return { ok: true, status: id === null ? 201 : 200, body: { item } }
  }

  adminTables(credentials: Credentials): Result<{ tables: AdminTable[] }> {
    if (credentials.kind !== 'admin') return unauthenticated()
    return ok({ tables: adminTables(this.db) })
  }

  /** Creates the table when `id` is null, otherwise replaces it. */
  saveTable(
    credentials: Credentials,
    id: string | null,
    input: TableInput,
  ): Result<{ table: AdminTable }> {
    if (credentials.kind !== 'admin') return unauthenticated()
    const table = this.write(() => saveTable(this.db, id, input))
    if (!table) return fail(404, 'not_found', 'Meja tidak ditemukan.')
    return { ok: true, status: id === null ? 201 : 200, body: { table } }
  }

  /** Counts one attempt against `key`; false once the limit is reached. */
  allowAttempt(key: string, limit: number, windowMs: number): boolean {
    return this.ctx.storage.transactionSync(() =>
      allowAttempt(this.db, key, limit, windowMs, Date.now()),
    )
  }

  /** A new device asks for a pairing code. */
  async startEnrollment(ipHash: string): Promise<
    Result<{
      challengeId: string
      code: string
      pollSecret: string
      expiresAt: number
    }>
  > {
    if (!this.allowAttempt(`enroll:${ipHash}`, 10, 10 * MINUTE_MS)) {
      return fail(429, 'rate_limited', 'Terlalu banyak percobaan. Tunggu.')
    }
    const pollSecret = randomHex(32)
    const secretHash = await sha256Hex(pollSecret)
    // A code that collides with a live challenge is rare; draw again.
    for (let i = 0; i < 5; i++) {
      const id = crypto.randomUUID()
      const code = randomCode()
      const codeHash = await sha256Hex(code)
      const now = Date.now()
      const stored = this.ctx.storage.transactionSync(() =>
        insertChallenge(this.db, { id, codeHash, secretHash, ipHash }, now),
      )
      if (stored) {
        return ok({
          challengeId: id,
          code,
          pollSecret,
          expiresAt: now + ENROLL_TTL_MS,
        })
      }
    }
    return fail(429, 'rate_limited', 'Coba lagi sebentar lagi.')
  }

  async approveEnrollment(credentials: Credentials, input: Approve) {
    if (credentials.kind !== 'admin') return unauthenticated()
    const codeHash = await sha256Hex(input.code)
    return this.ctx.storage.transactionSync(() =>
      approveChallenge(this.db, codeHash, input, Date.now()),
    )
  }

  async pollEnrollment(input: Poll) {
    const secretHash = await sha256Hex(input.pollSecret)
    const secret = randomHex(32)
    const device = {
      id: crypto.randomUUID(),
      secret,
      tokenHash: await sha256Hex(secret),
    }
    return this.ctx.storage.transactionSync(() =>
      pollChallenge(
        this.db,
        { challengeId: input.challengeId, secretHash },
        device,
        Date.now(),
      ),
    )
  }

  listDevices(credentials: Credentials) {
    if (credentials.kind !== 'admin') return unauthenticated()
    // Online = holds an open socket right now; no extra storage needed.
    const devices = listDevices(this.db).map((device) => ({
      ...device,
      online: this.ctx
        .getWebSockets(`device:${device.id}`)
        .some((ws) => ws.readyState === WebSocket.OPEN),
    }))
    return ok({ devices })
  }

  /** Refuses the device from now on and drops its open sockets. */
  revokeDevice(
    credentials: Credentials,
    deviceId: string,
  ): Result<{ revoked: boolean }> {
    if (credentials.kind !== 'admin') return unauthenticated()
    const revoked = this.ctx.storage.transactionSync(() =>
      revokeDevice(this.db, deviceId, Date.now()),
    )
    for (const ws of this.ctx.getWebSockets(`device:${deviceId}`)) {
      try {
        ws.send(JSON.stringify({ type: 'revoked' }))
        ws.close(CLOSE_REVOKED, 'Revoked')
      } catch {
        // Already closing.
      }
    }
    // A revoked TV no longer counts towards tvCount.
    this.write(() => bumpRev(this.db))
    return ok({ revoked })
  }

  /** The Worker vouches for the admin; devices are checked against their row. */
  private async authenticate(credentials: Credentials): Promise<Actor | null> {
    if (credentials.kind === 'admin') return ADMIN_ACTOR
    if (credentials.kind === 'none') return null
    const tokenHash = await sha256Hex(credentials.secret)
    const device = this.db
      .select()
      .from(schema.devices)
      .where(eq(schema.devices.id, credentials.deviceId))
      .get()
    if (!device || device.revokedAt !== null) return null
    if (!safeEqual(device.tokenHash, tokenHash)) return null
    // A disabled or re-roled staff member is signed out on the next request.
    const staff = credentials.staffId
      ? staffRow(this.db, credentials.staffId)
      : undefined
    const signedIn =
      staff !== undefined &&
      canSignIn(staff, device.role) &&
      pinTag(staff) === credentials.pinTag
    return {
      role: device.role,
      deviceId: device.id,
      staffId: signedIn ? staff.id : null,
      managerUser: null,
    }
  }

  /** With staff PINs on, waiter and kitchen devices act only as a person. */
  private staffRequired(actor: Actor) {
    if (
      actor.staffId ||
      (actor.role !== 'waiter' && actor.role !== 'kitchen')
    ) {
      return null
    }
    if (!getSettings(this.db).staffPins) return null
    return fail(401, 'pin_required', 'Masuk dengan PIN dulu.')
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
