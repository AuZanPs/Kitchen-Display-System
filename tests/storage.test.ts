import { runDurableObjectAlarm, runInDurableObject } from 'cloudflare:test'
import { env } from 'cloudflare:workers'
import { drizzle } from 'drizzle-orm/durable-sqlite'
import { describe, expect, it } from 'vitest'
import { schema } from '../src/worker/db'
import { createOrder } from '../src/worker/orders'
import { nextCleanupAt } from '../src/worker/venue-room'
import { orderBody } from './helpers'

const DAY = 24 * 60 * 60 * 1000

function count(sql: SqlStorage, table: string) {
  return Number(sql.exec(`SELECT count(*) AS n FROM ${table}`).one().n)
}

describe('atomic commit', () => {
  it('leaves no order, operation or rev bump when the commit throws', async () => {
    const stub = env.VENUE_ROOM.getByName('atomic-test')
    await runInDurableObject(stub, (_, state) => {
      const db = drizzle(state.storage, { schema })
      const { sql } = state.storage
      const rev = () =>
        sql.exec("SELECT value FROM meta WHERE key = 'rev'").toArray()
      const before = {
        orders: count(sql, 'orders'),
        lines: count(sql, 'order_lines'),
        operations: count(sql, 'operations'),
        events: count(sql, 'order_events'),
        rev: rev(),
      }

      expect(() =>
        state.storage.transactionSync(() => {
          const result = createOrder(
            db,
            { role: 'waiter', deviceId: 'd', staffId: null, managerUser: null },
            orderBody(),
            { payloadHash: 'h', now: Date.now(), receivedAt: Date.now() },
          )
          expect(result.ok).toBe(true)
          expect(count(sql, 'orders')).toBe(before.orders + 1)
          throw new Error('abort commit')
        }),
      ).toThrow('abort commit')

      expect({
        orders: count(sql, 'orders'),
        lines: count(sql, 'order_lines'),
        operations: count(sql, 'operations'),
        events: count(sql, 'order_events'),
        rev: rev(),
      }).toEqual(before)
    })
  })
})

describe('daily cleanup', () => {
  it('schedules the next run at 04:00 Jakarta time', () => {
    const at = Date.UTC(2026, 9, 14, 10, 0)
    expect(nextCleanupAt(at)).toBe(Date.UTC(2026, 9, 14, 21, 0))
    expect(nextCleanupAt(Date.UTC(2026, 9, 14, 21, 0))).toBe(
      Date.UTC(2026, 9, 15, 21, 0),
    )
  })

  it('deletes closed orders after 90 days and events after 180, never active ones', async () => {
    const stub = env.VENUE_ROOM.getByName('cleanup-test')
    const now = Date.now()
    await runInDurableObject(stub, (_, state) => {
      const { sql } = state.storage
      const insert = (id: string, status: string, age: number) => {
        sql.exec(
          `INSERT INTO orders (id, ticket_no, service_day, destination, status, version, created_by, created_at)
           VALUES (?, 1, '2020-01-01', 'takeaway', ?, 1, 'test', ?)`,
          id,
          status,
          now - age,
        )
        sql.exec(
          `INSERT INTO order_lines (id, order_id, menu_item_id, name_snapshot, price_snapshot, qty, added_in_version)
           VALUES (?, ?, 'x', 'x', 0, 1, 1)`,
          `${id}-line`,
          id,
        )
        sql.exec(
          'INSERT INTO order_events (order_id, version, type, at) VALUES (?, 1, ?, ?)',
          id,
          'created',
          now - age,
        )
      }
      insert('old-served', 'served', 91 * DAY)
      insert('old-active', 'accepted', 200 * DAY)
      insert('recent-served', 'served', 10 * DAY)
    })

    expect(await runDurableObjectAlarm(stub)).toBe(true)

    await runInDurableObject(stub, (_, state) => {
      const { sql } = state.storage
      const ids = sql
        .exec('SELECT id FROM orders ORDER BY id')
        .toArray()
        .map((r) => r.id)
      expect(ids).toEqual(['old-active', 'recent-served'])
      expect(
        sql
          .exec(
            "SELECT count(*) AS n FROM order_lines WHERE order_id = 'old-served'",
          )
          .one().n,
      ).toBe(0)
      // Events follow the audit retention, not the order retention.
      const events = sql
        .exec('SELECT order_id FROM order_events ORDER BY order_id')
        .toArray()
        .map((r) => r.order_id)
      expect(events).toEqual(['old-served', 'recent-served'])
    })
    expect(
      await runInDurableObject(stub, (_, s) => s.storage.getAlarm()),
    ).not.toBeNull()
  })
})
