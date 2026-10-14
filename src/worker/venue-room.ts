import { DurableObject } from 'cloudflare:workers'
import { asc, eq, inArray } from 'drizzle-orm'
import {
  type DrizzleSqliteDODatabase,
  drizzle,
} from 'drizzle-orm/durable-sqlite'
import { migrate } from 'drizzle-orm/durable-sqlite/migrator'
import type { BoardMessage } from '../shared/board'
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
}
