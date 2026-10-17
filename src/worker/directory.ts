import { DurableObject } from 'cloudflare:workers'
import { MAIN_SLUG, type Venue } from '../shared/venue'

/**
 * The list of dapur the super admin manages. Each dapur's data lives in its
 * own VenueRoom; this only holds names, status and console sign-in limits.
 */
export class Directory extends DurableObject<Env> {
  private sql: SqlStorage

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env)
    this.sql = ctx.storage.sql
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS venues (
        slug TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        disabled INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS attempts (
        key TEXT PRIMARY KEY,
        window_start INTEGER NOT NULL,
        count INTEGER NOT NULL
      );
      INSERT OR IGNORE INTO venues (slug, name, created_at)
        VALUES ('${MAIN_SLUG}', 'Dapur utama', 0);
    `)
  }

  /** Fixed-window counter; true while `key` is under `limit`. */
  allowAttempt(key: string, limit: number, windowMs: number): boolean {
    const now = Date.now()
    return this.ctx.storage.transactionSync(() => {
      // Old counters go first so the table never grows.
      this.sql.exec(
        'DELETE FROM attempts WHERE window_start < ?',
        now - 24 * 60 * 60 * 1000,
      )
      const row = this.sql
        .exec<{ window_start: number; count: number }>(
          'SELECT window_start, count FROM attempts WHERE key = ?',
          key,
        )
        .toArray()[0]
      if (!row || now - row.window_start >= windowMs) {
        this.sql.exec(
          'INSERT OR REPLACE INTO attempts (key, window_start, count) VALUES (?, ?, 1)',
          key,
          now,
        )
        return true
      }
      this.sql.exec('UPDATE attempts SET count = count + 1 WHERE key = ?', key)
      return row.count < limit
    })
  }

  list(): Venue[] {
    return this.sql
      .exec<{
        slug: string
        name: string
        created_at: number
        disabled: number
      }>(
        'SELECT slug, name, created_at, disabled FROM venues ORDER BY created_at',
      )
      .toArray()
      .map((row) => ({
        slug: row.slug,
        name: row.name,
        createdAt: row.created_at,
        disabled: row.disabled === 1,
      }))
  }

  /** False when the address is already taken. */
  add(slug: string, name: string): boolean {
    const taken = this.sql
      .exec('SELECT 1 FROM venues WHERE slug = ?', slug)
      .toArray().length
    if (taken) return false
    this.sql.exec(
      'INSERT INTO venues (slug, name, created_at) VALUES (?, ?, ?)',
      slug,
      name,
      Date.now(),
    )
    return true
  }

  remove(slug: string) {
    this.sql.exec('DELETE FROM venues WHERE slug = ?', slug)
  }

  has(slug: string): boolean {
    return (
      this.sql.exec('SELECT 1 FROM venues WHERE slug = ?', slug).toArray()
        .length > 0
    )
  }

  setDisabled(slug: string, disabled: boolean) {
    this.sql.exec(
      'UPDATE venues SET disabled = ? WHERE slug = ?',
      disabled ? 1 : 0,
      slug,
    )
  }
}
