import { runInDurableObject } from 'cloudflare:test'
import { env } from 'cloudflare:workers'
import { expect, it } from 'vitest'

it('rolls back every write in transactionSync when the callback throws', async () => {
  const stub = env.VENUE_ROOM.getByName('main')
  await runInDurableObject(stub, (_room, state) => {
    const { sql } = state.storage
    const count = () => sql.exec('SELECT count(*) AS n FROM orders').one().n
    const before = count()

    expect(() =>
      state.storage.transactionSync(() => {
        sql.exec(
          `INSERT INTO orders (id, ticket_no, service_day, destination, status, version, created_by, created_at)
           VALUES ('rollback-test', 1, '2026-01-01', 'table', 'new', 1, 'test', 0)`,
        )
        expect(count()).toBe(Number(before) + 1)
        throw new Error('abort commit')
      }),
    ).toThrow('abort commit')

    expect(count()).toBe(before)
  })
})
