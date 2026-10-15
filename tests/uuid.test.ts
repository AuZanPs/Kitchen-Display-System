import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { uuid } from '../src/client/lib/uuid'

describe('client uuid', () => {
  it('builds valid, distinct v4 UUIDs without randomUUID (plain http on the LAN)', () => {
    const ids = Array.from({ length: 200 }, () => uuid(false))
    for (const id of ids) expect(z.uuid().safeParse(id).success).toBe(true)
    expect(new Set(ids).size).toBe(ids.length)
  })
})
