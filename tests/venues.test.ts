import { runInDurableObject } from 'cloudflare:test'
import { env, exports } from 'cloudflare:workers'
import { describe, expect, it } from 'vitest'
import { placeFromHost, suggestSlug } from '../src/shared/venue'
import { clientNetwork } from '../src/worker/auth/session'
import { migrateDirectory } from '../src/worker/directory'
import { freshIp } from './helpers'

const BASE = 'layardapur.web.id'
const CONSOLE = `https://console.${BASE}`
const SUPER_PASSWORD = 'test-super-password'

type HeaderMap = Record<string, string>

/** A request to one host, sent from that same origin like a browser would. */
function call(
  origin: string,
  path: string,
  init: { method?: string; headers?: HeaderMap; body?: unknown } = {},
) {
  const method = init.method ?? (init.body === undefined ? 'GET' : 'POST')
  return exports.default.fetch(`${origin}${path}`, {
    method,
    headers: {
      ...(method === 'GET' ? {} : { origin }),
      ...(init.body === undefined
        ? {}
        : { 'content-type': 'application/json' }),
      ...init.headers,
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  })
}

function cookieOf(res: Response) {
  return (res.headers.get('set-cookie') ?? '').split(';')[0] ?? ''
}

async function superCookie() {
  const res = await call(CONSOLE, '/api/super/login', {
    body: { password: SUPER_PASSWORD },
    headers: freshIp(),
  })
  expect(res.status).toBe(204)
  return cookieOf(res)
}

/** Creates a dapur through the console and returns its origin. */
async function createVenue(
  slug: string,
  adminPassword = `${slug}-password`,
  ownerEmail?: string,
) {
  const res = await call(CONSOLE, '/api/super/venues', {
    headers: { cookie: await superCookie() },
    body: { slug, name: `Dapur ${slug}`, adminPassword, ownerEmail },
  })
  expect(res.status).toBe(201)
  return `https://${slug}.${BASE}`
}

async function adminLogin(origin: string, password: string) {
  return call(origin, '/api/admin/login', {
    body: { password },
    headers: freshIp(),
  })
}

describe('placeFromHost', () => {
  it('maps hosts to the site, a dapur, the console or nothing', () => {
    expect(placeFromHost(BASE, BASE)).toEqual({ kind: 'site' })
    expect(placeFromHost(`www.${BASE}`, BASE)).toEqual({ kind: 'site' })
    expect(placeFromHost(`dapurku.${BASE}`, BASE)).toEqual({
      kind: 'venue',
      slug: 'dapurku',
      room: 'main',
    })
    expect(placeFromHost('kds.mauzanps.workers.dev', BASE)).toMatchObject({
      room: 'main',
    })
    expect(placeFromHost(`Warung-Budi.${BASE}`, BASE)).toEqual({
      kind: 'venue',
      slug: 'warung-budi',
      room: 'venue:warung-budi',
    })
    expect(placeFromHost(`console.${BASE}`, BASE)).toEqual({ kind: 'console' })
    expect(placeFromHost(`main.${BASE}`, BASE)).toEqual({ kind: 'unknown' })
    expect(placeFromHost(`a.b.${BASE}`, BASE)).toEqual({ kind: 'unknown' })
    expect(placeFromHost(`-x.${BASE}`, BASE)).toEqual({ kind: 'unknown' })
  })

  it('suggests an address from a name', () => {
    expect(suggestSlug('Warung Bu Sri!')).toBe('warung-bu-sri')
    expect(suggestSlug('  Café Ánda  ')).toBe('cafe-anda')
  })
})

describe('clientNetwork', () => {
  it('limits IPv6 clients by their /64 and IPv4 by address', () => {
    expect(clientNetwork('203.0.113.7')).toBe('203.0.113.7')
    expect(clientNetwork('2001:db8:aa:bb:1:2:3:4')).toBe('2001:db8:aa:bb::/64')
    expect(clientNetwork('2001:DB8:AA:BB::99')).toBe('2001:db8:aa:bb::/64')
    expect(clientNetwork('2001:db8::1')).toBe('2001:db8:0:0::/64')
    expect(clientNetwork('::1')).toBe('0:0:0:0::/64')
  })
})

describe('dapur isolation', () => {
  it('leaves an address nobody created empty and closed', async () => {
    const res = await call(`https://ghost.${BASE}`, '/api/session')
    expect(res.status).toBe(404)
    const start = await call(
      `https://ghost.${BASE}`,
      '/api/devices/enroll/start',
      {
        method: 'POST',
        headers: freshIp(),
      },
    )
    expect(start.status).toBe(404)
    await runInDurableObject(
      env.VENUE_ROOM.getByName('venue:ghost'),
      (_, state) => {
        const tables = state.storage.sql
          .exec("SELECT name FROM sqlite_master WHERE type = 'table'")
          .toArray()
        expect(tables).toEqual([])
      },
    )
  })

  it('gives each dapur its own admin password', async () => {
    const origin = await createVenue('isolasi')
    expect((await adminLogin(origin, env.ADMIN_PASSWORD)).status).toBe(401)
    const right = await adminLogin(origin, 'isolasi-password')
    expect(right.status).toBe(204)
    const session = await call(origin, '/api/admin/session', {
      headers: { cookie: cookieOf(right) },
    })
    expect(await session.json()).toEqual({ venueName: 'Dapur isolasi' })
  })

  it('never accepts one dapur admin cookie at another dapur', async () => {
    const a = await createVenue('dapur-a')
    const b = await createVenue('dapur-b')
    const cookie = cookieOf(await adminLogin(a, 'dapur-a-password'))
    for (const origin of [b, `https://dapurku.${BASE}`]) {
      const res = await call(origin, '/api/admin/session', {
        headers: { cookie },
      })
      expect(res.status).toBe(401)
    }
  })

  it('keeps console and dapur routes on their own hosts', async () => {
    const cookie = await superCookie()
    const onVenue = await call(`https://${BASE}`, '/api/super/venues', {
      headers: { cookie },
    })
    expect(onVenue.status).toBe(404)
    const onConsole = await call(CONSOLE, '/api/session')
    expect(onConsole.status).toBe(404)
  })
})

describe('super admin', () => {
  it('signs in with the right password only, with a strict cookie', async () => {
    const ip = freshIp()
    const wrong = await call(CONSOLE, '/api/super/login', {
      body: { password: 'nope' },
      headers: ip,
    })
    expect(wrong.status).toBe(401)
    const right = await call(CONSOLE, '/api/super/login', {
      body: { password: SUPER_PASSWORD },
      headers: ip,
    })
    expect(right.status).toBe(204)
    expect(right.headers.get('set-cookie')).toMatch(/SameSite=Strict/i)
    expect(
      (await call(CONSOLE, '/api/super/venues')).status,
      'no cookie, no list',
    ).toBe(401)
  })

  it('locks the console after five wrong passwords', async () => {
    const ip = freshIp()
    for (let i = 0; i < 5; i++) {
      await call(CONSOLE, '/api/super/login', {
        body: { password: 'nope' },
        headers: ip,
      })
    }
    const locked = await call(CONSOLE, '/api/super/login', {
      body: { password: SUPER_PASSWORD },
      headers: ip,
    })
    expect(locked.status).toBe(429)
  })

  it('refuses taken and reserved addresses', async () => {
    await createVenue('kembar')
    const headers = { cookie: await superCookie() }
    const again = await call(CONSOLE, '/api/super/venues', {
      headers,
      body: { slug: 'kembar', name: 'Lagi', adminPassword: 'password-123' },
    })
    expect(again.status).toBe(409)
    const reserved = await call(CONSOLE, '/api/super/venues', {
      headers,
      body: { slug: 'www', name: 'WWW', adminPassword: 'password-123' },
    })
    expect(reserved.status).toBe(422)
  })

  it('lists the original dapur and new ones', async () => {
    await createVenue('daftar')
    const res = await call(CONSOLE, '/api/super/venues', {
      headers: { cookie: await superCookie() },
    })
    const { venues } = (await res.json()) as { venues: { slug: string }[] }
    expect(venues.map((v) => v.slug)).toEqual(
      expect.arrayContaining(['dapurku', 'daftar']),
    )
  })

  it('resets a dapur admin password', async () => {
    const origin = await createVenue('reset')
    const before = cookieOf(await adminLogin(origin, 'reset-password'))
    const res = await call(CONSOLE, '/api/super/venues/reset/password', {
      method: 'PUT',
      headers: { cookie: await superCookie() },
      body: { adminPassword: 'brand-new-password' },
    })
    expect(res.status).toBe(200)
    expect((await adminLogin(origin, 'reset-password')).status).toBe(401)
    expect((await adminLogin(origin, 'brand-new-password')).status).toBe(204)
    // Whoever was signed in with the old password is signed out.
    const old = await call(origin, '/api/admin/session', {
      headers: { cookie: before },
    })
    expect(old.status).toBe(401)
  })

  it('closes open admin pages when the password changes', async () => {
    const origin = await createVenue('soket')
    const admin = cookieOf(await adminLogin(origin, 'soket-password'))
    const res = await exports.default.fetch(`${origin}/api/ws`, {
      headers: { Upgrade: 'websocket', Origin: origin, cookie: admin },
    })
    const ws = res.webSocket
    if (!ws) throw new Error(`Upgrade failed with ${res.status}`)
    const closed = new Promise<number>((resolve) =>
      ws.addEventListener('close', (event) => resolve(event.code)),
    )
    ws.accept()
    await call(CONSOLE, '/api/super/venues/soket/password', {
      method: 'PUT',
      headers: { cookie: await superCookie() },
      body: { adminPassword: 'another-password' },
    })
    expect(await closed).toBe(1008)
  })

  it('switches a dapur off for everyone and back on', async () => {
    const origin = await createVenue('libur')
    const admin = cookieOf(await adminLogin(origin, 'libur-password'))
    const headers = { cookie: await superCookie() }
    const off = await call(CONSOLE, '/api/super/venues/libur/status', {
      method: 'PUT',
      headers,
      body: { disabled: true },
    })
    expect(off.status).toBe(200)
    expect((await adminLogin(origin, 'libur-password')).status).toBe(403)
    const session = await call(origin, '/api/admin/session', {
      headers: { cookie: admin },
    })
    expect(session.status).toBe(403)
    const start = await call(origin, '/api/devices/enroll/start', {
      method: 'POST',
      headers: freshIp(),
    })
    expect(start.status).toBe(403)

    await call(CONSOLE, '/api/super/venues/libur/status', {
      method: 'PUT',
      headers,
      body: { disabled: false },
    })
    expect((await adminLogin(origin, 'libur-password')).status).toBe(204)
  })

  it('answers an unknown dapur with not found', async () => {
    const res = await call(CONSOLE, '/api/super/venues/tidak-ada/status', {
      method: 'PUT',
      headers: { cookie: await superCookie() },
      body: { disabled: true },
    })
    expect(res.status).toBe(404)
  })
})

describe('owner sign-in on the site', () => {
  const SITE = `https://${BASE}`

  async function signIn(email: string) {
    const start = await call(SITE, '/api/site/login/start', {
      body: { email },
      headers: freshIp(),
    })
    expect(start.status).toBe(200)
    const { devLink } = (await start.json()) as { devLink?: string }
    const token = devLink?.split('#token=')[1] ?? ''
    const verify = await call(SITE, '/api/site/login/verify', {
      body: { token },
      headers: freshIp(),
    })
    return { token, verify }
  }

  it('signs an owner in with a one-time link and opens their dapur', async () => {
    const origin = await createVenue(
      'milik',
      'milik-password',
      'Pemilik@Contoh.id',
    )
    const { token, verify } = await signIn('pemilik@contoh.id')
    expect(verify.status).toBe(204)
    const owner = cookieOf(verify)

    const again = await call(SITE, '/api/site/login/verify', {
      body: { token },
      headers: freshIp(),
    })
    expect(again.status, 'a link works once').toBe(401)

    const account = await call(SITE, '/api/site/session', {
      headers: { cookie: owner },
    })
    expect(await account.json()).toEqual({
      email: 'pemilik@contoh.id',
      venues: [{ slug: 'milik', name: 'Dapur milik', disabled: false }],
    })

    const handoff = await call(SITE, '/api/site/handoff', {
      headers: { cookie: owner },
      body: { slug: 'milik' },
    })
    const { url } = (await handoff.json()) as { url: string }
    expect(url.startsWith(`https://milik.${BASE}/admin#handoff=`)).toBe(true)
    const pass = url.split('#handoff=')[1] ?? ''

    // A pass for one dapur is useless at another.
    const elsewhere = await call(
      `https://dapurku.${BASE}`,
      '/api/admin/handoff',
      {
        body: { token: pass },
      },
    )
    expect(elsewhere.status).toBe(401)

    const handoff2 = await call(SITE, '/api/site/handoff', {
      headers: { cookie: owner },
      body: { slug: 'milik' },
    })
    const pass2 =
      ((await handoff2.json()) as { url: string }).url.split('#handoff=')[1] ??
      ''
    const arrive = await call(origin, '/api/admin/handoff', {
      body: { token: pass2 },
    })
    expect(arrive.status).toBe(204)
    const admin = await call(origin, '/api/admin/session', {
      headers: { cookie: cookieOf(arrive) },
    })
    expect(admin.status).toBe(200)
  })

  it('signs out the old owner when the owner changes', async () => {
    const origin = await createVenue(
      'ganti',
      'ganti-password',
      'lama@contoh.id',
    )
    const admin = cookieOf(await adminLogin(origin, 'ganti-password'))
    const res = await call(CONSOLE, '/api/super/venues/ganti/owner', {
      method: 'PUT',
      headers: { cookie: await superCookie() },
      body: { ownerEmail: 'baru@contoh.id' },
    })
    expect(res.status).toBe(204)
    const session = await call(origin, '/api/admin/session', {
      headers: { cookie: admin },
    })
    expect(session.status).toBe(401)
  })

  it('lists every dapur of one owner, and only theirs', async () => {
    await createVenue('satu', 'satu-password', 'banyak@contoh.id')
    await createVenue('dua', 'dua-password', 'banyak@contoh.id')
    await createVenue('bukan', 'bukan-password', 'yang-lain@contoh.id')
    const { verify } = await signIn('banyak@contoh.id')
    const res = await call(SITE, '/api/site/session', {
      headers: { cookie: cookieOf(verify) },
    })
    const { venues } = (await res.json()) as { venues: { slug: string }[] }
    expect(venues.map((v) => v.slug).sort()).toEqual(['dua', 'satu'])
  })

  it('signs an owner out on every browser at once', async () => {
    await createVenue('semua', 'semua-password', 'keluar@contoh.id')
    const phone = cookieOf((await signIn('keluar@contoh.id')).verify)
    // A sign-in starts on a later millisecond than the one before it.
    await new Promise((r) => setTimeout(r, 5))
    const laptop = cookieOf((await signIn('keluar@contoh.id')).verify)
    await new Promise((r) => setTimeout(r, 5))
    const out = await call(SITE, '/api/site/logout-everywhere', {
      method: 'POST',
      headers: { cookie: laptop },
    })
    expect(out.status).toBe(204)
    for (const cookie of [phone, laptop]) {
      const session = await call(SITE, '/api/site/session', {
        headers: { cookie },
      })
      expect(session.status).toBe(401)
      const handoff = await call(SITE, '/api/site/handoff', {
        headers: { cookie },
        body: { slug: 'semua' },
      })
      expect(handoff.status).toBe(403)
    }
    await new Promise((r) => setTimeout(r, 5))
    const again = await signIn('keluar@contoh.id')
    expect(again.verify.status, 'a fresh sign-in still works').toBe(204)
  })

  it('takes the dapur away from an owner who was replaced', async () => {
    await createVenue('pindah', 'pindah-password', 'awal@contoh.id')
    const before = cookieOf((await signIn('awal@contoh.id')).verify)
    await call(CONSOLE, '/api/super/venues/pindah/owner', {
      method: 'PUT',
      headers: { cookie: await superCookie() },
      body: { ownerEmail: 'akhir@contoh.id' },
    })
    const handoff = await call(SITE, '/api/site/handoff', {
      headers: { cookie: before },
      body: { slug: 'pindah' },
    })
    expect(handoff.status).toBe(403)
  })

  it('never opens a dapur the owner does not own', async () => {
    await createVenue('orang-lain', 'orang-lain-password', 'lain@contoh.id')
    await createVenue('punyaku', 'punyaku-password', 'aku@contoh.id')
    const { verify } = await signIn('aku@contoh.id')
    const res = await call(SITE, '/api/site/handoff', {
      headers: { cookie: cookieOf(verify) },
      body: { slug: 'orang-lain' },
    })
    expect(res.status).toBe(403)
  })

  it('answers the same for an email that owns nothing', async () => {
    const start = await call(SITE, '/api/site/login/start', {
      body: { email: 'siapa@contoh.id' },
      headers: freshIp(),
    })
    expect(start.status).toBe(200)
    expect(await start.json()).toEqual({})
  })

  it('keeps site routes on the bare domain only', async () => {
    const res = await call(`https://dapurku.${BASE}`, '/api/site/session')
    expect(res.status).toBe(404)
  })
})

describe('directory migrations', () => {
  it('upgrades the directory as it was first deployed', async () => {
    await runInDurableObject(
      env.DIRECTORY.getByName('upgrade-test'),
      (_, state) => {
        const sql = state.storage.sql
        // Back to the first deployed shape: no owners, the pilot listed as `main`.
        for (const table of [
          'schema_version',
          'venues',
          'attempts',
          'owners',
          'tokens',
        ]) {
          sql.exec(`DROP TABLE IF EXISTS ${table}`)
        }
        sql.exec(
          'CREATE TABLE venues (slug TEXT PRIMARY KEY, name TEXT NOT NULL, created_at INTEGER NOT NULL, disabled INTEGER NOT NULL DEFAULT 0)',
        )
        sql.exec(
          'CREATE TABLE attempts (key TEXT PRIMARY KEY, window_start INTEGER NOT NULL, count INTEGER NOT NULL)',
        )
        sql.exec("INSERT INTO venues VALUES ('main', 'Dapur utama', 0, 0)")
        sql.exec("INSERT INTO venues VALUES ('warung', 'Warung', 5, 1)")

        migrateDirectory(state.storage)
        migrateDirectory(state.storage)

        expect(
          sql
            .exec(
              'SELECT slug, name, disabled, owner_email FROM venues ORDER BY slug',
            )
            .toArray(),
        ).toEqual([
          { slug: 'dapurku', name: 'Dapurku', disabled: 0, owner_email: null },
          { slug: 'warung', name: 'Warung', disabled: 1, owner_email: null },
        ])
        const indexes = sql
          .exec(
            "SELECT name FROM sqlite_master WHERE type = 'index' AND name NOT LIKE 'sqlite_%'",
          )
          .toArray()
          .map((r) => r.name)
        expect(indexes).toEqual(
          expect.arrayContaining(['venues_owner_email', 'tokens_email']),
        )
      },
    )
  })
})
