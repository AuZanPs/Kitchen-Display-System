import { DurableObject } from 'cloudflare:workers'
import { FIRST_SLUG, type Venue } from '../shared/venue'

type TokenKind = 'login' | 'handoff'

/** Append only: each step runs once per Directory, in order. */
const MIGRATIONS: ((sql: SqlStorage) => void)[] = [
  (sql) =>
    sql.exec(`
      CREATE TABLE IF NOT EXISTS venues (
        slug TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        disabled INTEGER NOT NULL DEFAULT 0 CHECK (disabled IN (0, 1))
      );
      CREATE TABLE IF NOT EXISTS attempts (
        key TEXT PRIMARY KEY,
        window_start INTEGER NOT NULL,
        count INTEGER NOT NULL
      );
    `),
  (sql) => {
    // Stores made before versioning may already have the column.
    const columns = sql
      .exec<{ name: string }>('PRAGMA table_info(venues)')
      .toArray()
    if (!columns.some((c) => c.name === 'owner_email')) {
      sql.exec('ALTER TABLE venues ADD COLUMN owner_email TEXT')
    }
  },
  (sql) =>
    sql.exec(`
      CREATE TABLE IF NOT EXISTS owners (
        email TEXT PRIMARY KEY,
        valid_after INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS tokens (
        hash TEXT PRIMARY KEY,
        kind TEXT NOT NULL CHECK (kind IN ('login', 'handoff')),
        email TEXT NOT NULL,
        slug TEXT,
        expires_at INTEGER NOT NULL
      );
    `),
  // The pilot's dapur was listed as `main` on the bare domain; it is now one
  // dapur among others, at its own address.
  (sql) => {
    sql.exec(
      "UPDATE venues SET slug = ?, name = CASE name WHEN 'Dapur utama' THEN 'Dapurku' ELSE name END WHERE slug = 'main'",
      FIRST_SLUG,
    )
    sql.exec(
      "INSERT OR IGNORE INTO venues (slug, name, created_at) VALUES (?, 'Dapurku', 0)",
      FIRST_SLUG,
    )
  },
  // Every lookup outside the primary keys: owners, token cleanup, old counters.
  (sql) =>
    sql.exec(`
      CREATE INDEX IF NOT EXISTS venues_owner_email ON venues (owner_email);
      CREATE INDEX IF NOT EXISTS tokens_email ON tokens (email);
      CREATE INDEX IF NOT EXISTS tokens_expires_at ON tokens (expires_at);
      CREATE INDEX IF NOT EXISTS attempts_window_start ON attempts (window_start);
    `),
]

/**
 * The list of dapur, their owners' emails and one-time sign-in tokens. Each
 * dapur's data lives in its own VenueRoom; this holds no orders or menus.
 */
export class Directory extends DurableObject<Env> {
  private sql: SqlStorage

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env)
    this.sql = ctx.storage.sql
    migrateDirectory(ctx.storage)
  }

  /** Fixed-window counter; true while `key` is under `limit`. */
  allowAttempt(key: string, limit: number, windowMs: number): boolean {
    const now = Date.now()
    return this.ctx.storage.transactionSync(() => {
      // Old counters and spent tokens go first so the tables never grow.
      this.sql.exec(
        'DELETE FROM attempts WHERE window_start < ?',
        now - 24 * 60 * 60 * 1000,
      )
      this.sql.exec('DELETE FROM tokens WHERE expires_at < ?', now)
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
    return this.rows(
      'SELECT slug, name, created_at, disabled, owner_email FROM venues ORDER BY created_at',
    )
  }

  private rows(query: string, ...params: string[]): Venue[] {
    return this.sql
      .exec<{
        slug: string
        name: string
        created_at: number
        disabled: number
        owner_email: string | null
      }>(query, ...params)
      .toArray()
      .map((row) => ({
        slug: row.slug,
        name: row.name,
        createdAt: row.created_at,
        disabled: row.disabled === 1,
        ownerEmail: row.owner_email,
      }))
  }

  /** The dapur an owner email can open. */
  venuesOf(email: string): Venue[] {
    return this.rows(
      'SELECT slug, name, created_at, disabled, owner_email FROM venues WHERE owner_email = ? ORDER BY created_at',
      email,
    )
  }

  /** False when the owner signed out everywhere (or lost a dapur) after `issuedAt`. */
  private sessionValid(email: string, issuedAt: number) {
    if (!Number.isFinite(issuedAt)) return false
    const row = this.sql
      .exec<{ valid_after: number }>(
        'SELECT valid_after FROM owners WHERE email = ?',
        email,
      )
      .toArray()[0]
    return !row || issuedAt > row.valid_after
  }

  /** The owner's dapur for a signed-in session, or null when that session was ended. */
  ownerVenues(email: string, issuedAt: number): Venue[] | null {
    return this.sessionValid(email, issuedAt) ? this.venuesOf(email) : null
  }

  /** Ends every site sign-in of this owner, on every browser. */
  signOutOwner(email: string) {
    this.sql.exec(
      'INSERT OR REPLACE INTO owners (email, valid_after) VALUES (?, ?)',
      email,
      Date.now(),
    )
  }

  /** False when the address is already taken. */
  add(slug: string, name: string, ownerEmail: string | null): boolean {
    const taken = this.sql
      .exec('SELECT 1 FROM venues WHERE slug = ?', slug)
      .toArray().length
    if (taken) return false
    this.sql.exec(
      'INSERT INTO venues (slug, name, created_at, owner_email) VALUES (?, ?, ?, ?)',
      slug,
      name,
      Date.now(),
      ownerEmail,
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

  /** A new owner signs in from now on; links the old owner was sent stop working. */
  setOwner(slug: string, email: string | null) {
    this.ctx.storage.transactionSync(() => {
      const old = this.sql
        .exec<{ owner_email: string | null }>(
          'SELECT owner_email FROM venues WHERE slug = ?',
          slug,
        )
        .toArray()[0]?.owner_email
      this.sql.exec(
        'UPDATE venues SET owner_email = ? WHERE slug = ?',
        email,
        slug,
      )
      if (old && old !== email) {
        this.sql.exec('DELETE FROM tokens WHERE email = ?', old)
        this.signOutOwner(old)
      }
    })
  }

  /**
   * Stores a one-time token (only its hash). A sign-in token needs an owner
   * with at least one dapur; a handoff token needs that owner's own dapur.
   */
  issueToken(
    kind: TokenKind,
    hash: string,
    email: string,
    slug: string | null,
    ttlMs: number,
    sessionIssuedAt: number | null = null,
  ): boolean {
    // A handoff comes from a site session, which must still be valid.
    if (
      sessionIssuedAt !== null &&
      !this.sessionValid(email, sessionIssuedAt)
    ) {
      return false
    }
    const owned = this.venuesOf(email)
    const allowed =
      kind === 'login'
        ? owned.length > 0
        : owned.some((v) => v.slug === slug && !v.disabled)
    if (!allowed) return false
    this.sql.exec(
      'INSERT INTO tokens (hash, kind, email, slug, expires_at) VALUES (?, ?, ?, ?, ?)',
      hash,
      kind,
      email,
      slug,
      Date.now() + ttlMs,
    )
    return true
  }

  /** Spends a token once; its email, or null when unknown, used, expired or for another dapur. */
  takeToken(kind: TokenKind, hash: string, slug: string | null): string | null {
    return this.ctx.storage.transactionSync(() => {
      const row = this.sql
        .exec<{ email: string; slug: string | null; expires_at: number }>(
          'SELECT email, slug, expires_at FROM tokens WHERE hash = ? AND kind = ?',
          hash,
          kind,
        )
        .toArray()[0]
      if (!row) return null
      this.sql.exec('DELETE FROM tokens WHERE hash = ?', hash)
      if (row.expires_at < Date.now() || row.slug !== slug) return null
      return row.email
    })
  }
}

/** Runs each migration step once, in order; the step count is stored with the data. */
export function migrateDirectory(storage: DurableObjectStorage) {
  const sql = storage.sql
  sql.exec(
    'CREATE TABLE IF NOT EXISTS schema_version (id INTEGER PRIMARY KEY CHECK (id = 1), version INTEGER NOT NULL)',
  )
  const done =
    sql
      .exec<{ version: number }>('SELECT version FROM schema_version')
      .toArray()[0]?.version ?? 0
  MIGRATIONS.slice(done).forEach((step, index) => {
    storage.transactionSync(() => {
      step(sql)
      sql.exec(
        'INSERT OR REPLACE INTO schema_version (id, version) VALUES (1, ?)',
        done + index + 1,
      )
    })
  })
}
