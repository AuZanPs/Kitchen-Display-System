import { runInDurableObject } from 'cloudflare:test'
import { env, exports } from 'cloudflare:workers'
import { describe, expect, it } from 'vitest'
import { placeFromHost, suggestSlug } from '../src/shared/venue'
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
async function createVenue(slug: string, adminPassword = `${slug}-password`) {
  const res = await call(CONSOLE, '/api/super/venues', {
    headers: { cookie: await superCookie() },
    body: { slug, name: `Dapur ${slug}`, adminPassword },
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
  it('maps hosts to a dapur, the console or nothing', () => {
    expect(placeFromHost(BASE, BASE)).toEqual({
      kind: 'venue',
      slug: 'main',
      room: 'main',
    })
    expect(placeFromHost(`www.${BASE}`, BASE)).toMatchObject({ room: 'main' })
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
    for (const origin of [b, `https://${BASE}`]) {
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
      expect.arrayContaining(['main', 'daftar']),
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
