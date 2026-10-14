import { DurableObject } from 'cloudflare:workers'
import { asc, eq, inArray, max } from 'drizzle-orm'
import {
  type DrizzleSqliteDODatabase,
  drizzle,
} from 'drizzle-orm/durable-sqlite'
import { migrate } from 'drizzle-orm/durable-sqlite/migrator'
import type { BoardMessage } from '../shared/board'
import type { CreateOrder, CreateOrderResult } from '../shared/order'
import migrations from './db/migrations/migrations'
import * as schema from './db/schema'

export class VenueRoom extends DurableObject<Env> {
  private db: DrizzleSqliteDODatabase<typeof schema>

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env)
    this.db = drizzle(ctx.storage, { schema })
    // Answered by the runtime without waking the object.
    ctx.setWebSocketAutoResponse(
      new WebSocketRequestResponsePair('ping', 'pong'),
    )
    ctx.blockConcurrencyWhile(async () => {
      migrate(this.db, migrations)
    })
  }

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get('Upgrade') !== 'websocket') {
      return new Response('Expected websocket', { status: 426 })
    }
    const { 0: client, 1: server } = new WebSocketPair()
    this.ctx.acceptWebSocket(server)
    server.send(JSON.stringify(this.board()))
    return new Response(null, { status: 101, webSocket: client })
  }

  // Clients only ever send "ping", which the auto-response handles.
  async webSocketMessage(ws: WebSocket) {
    ws.close(1003, 'Unsupported message')
  }

  createOrder(input: CreateOrder): CreateOrderResult {
    const now = Date.now()
    const day = serviceDay(now)
    const result = this.ctx.storage.transactionSync(() => {
      const last = this.db
        .select({ ticketNo: max(schema.orders.ticketNo) })
        .from(schema.orders)
        .where(eq(schema.orders.serviceDay, day))
        .get()
      const orderId = crypto.randomUUID()
      const ticketNo = (last?.ticketNo ?? 0) + 1
      this.db
        .insert(schema.orders)
        .values({
          id: orderId,
          ticketNo,
          serviceDay: day,
          destination: 'table',
          tableLabel: input.tableLabel,
          status: 'new',
          version: 1,
          createdBy: 'dev',
          createdAt: now,
        })
        .run()
      const rev = this.bumpRev()
      return { orderId, ticketNo, rev }
    })
    this.broadcast()
    return result
  }

  private broadcast() {
    const message = JSON.stringify(this.board())
    for (const ws of this.ctx.getWebSockets()) {
      if (ws.readyState === WebSocket.OPEN) ws.send(message)
    }
  }

  private board(): BoardMessage {
    const orders = this.db
      .select({
        id: schema.orders.id,
        ticketNo: schema.orders.ticketNo,
        destination: schema.orders.destination,
        tableLabel: schema.orders.tableLabel,
        status: schema.orders.status,
        createdAt: schema.orders.createdAt,
      })
      .from(schema.orders)
      .where(inArray(schema.orders.status, ['new', 'preparing', 'ready']))
      .orderBy(asc(schema.orders.createdAt))
      .all()
    return { type: 'board', rev: this.rev(), serverTime: Date.now(), orders }
  }

  private rev(): number {
    const row = this.db
      .select({ value: schema.meta.value })
      .from(schema.meta)
      .where(eq(schema.meta.key, 'rev'))
      .get()
    return row ? Number(row.value) : 0
  }

  private bumpRev(): number {
    const rev = this.rev() + 1
    this.db
      .insert(schema.meta)
      .values({ key: 'rev', value: String(rev) })
      .onConflictDoUpdate({
        target: schema.meta.key,
        set: { value: String(rev) },
      })
      .run()
    return rev
  }
}

// The service day rolls over at 04:00 Jakarta time (UTC+7, no DST) so late
// service keeps its ticket numbers instead of restarting at midnight.
const SERVICE_DAY_OFFSET_MS = (7 - 4) * 60 * 60 * 1000

function serviceDay(at: number): string {
  return new Date(at + SERVICE_DAY_OFFSET_MS).toISOString().slice(0, 10)
}
