import { eq, sql } from 'drizzle-orm'
import type { DrizzleSqliteDODatabase } from 'drizzle-orm/durable-sqlite'
import {
  DEFAULT_SETTINGS,
  type Settings,
  settingsSchema,
} from '../../shared/board'
import * as schema from './schema'

export { schema }
export type Db = DrizzleSqliteDODatabase<typeof schema>

export function getMeta(db: Db, key: string): string | undefined {
  return db
    .select({ value: schema.meta.value })
    .from(schema.meta)
    .where(eq(schema.meta.key, key))
    .get()?.value
}

export function setMeta(db: Db, key: string, value: string) {
  db.insert(schema.meta)
    .values({ key, value })
    .onConflictDoUpdate({ target: schema.meta.key, set: { value } })
    .run()
}

export function getRev(db: Db): number {
  return Number(getMeta(db, 'rev') ?? 0)
}

/** Every change a client can see moves the board to a new rev. */
export function bumpRev(db: Db): number {
  const rev = getRev(db) + 1
  setMeta(db, 'rev', String(rev))
  return rev
}

/** Calendar date in Asia/Jakarta (UTC+7, no DST). */
export function jakartaDate(at: number): string {
  return new Date(at + 7 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

export function recordMetric(db: Db, name: string, value: number, at: number) {
  const v = Math.max(0, Math.round(value))
  db.insert(schema.metrics)
    .values({ day: jakartaDate(at), name, count: 1, sum: v, max: v })
    .onConflictDoUpdate({
      target: [schema.metrics.day, schema.metrics.name],
      set: {
        count: sql`${schema.metrics.count} + 1`,
        sum: sql`${schema.metrics.sum} + ${v}`,
        max: sql`max(${schema.metrics.max}, ${v})`,
      },
    })
    .run()
}

/** Venue settings, with defaults for anything never saved. */
export function getSettings(db: Db): Settings {
  let stored: unknown = {}
  try {
    stored = JSON.parse(getMeta(db, 'settings') ?? '{}')
  } catch {
    // A corrupt row falls back to the defaults.
  }
  const parsed = settingsSchema.partial().safeParse(stored)
  return { ...DEFAULT_SETTINGS, ...(parsed.success ? parsed.data : {}) }
}

export function setSettings(db: Db, settings: Settings) {
  setMeta(db, 'settings', JSON.stringify(settings))
}
