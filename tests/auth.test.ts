import { runInDurableObject } from 'cloudflare:test'
import { env } from 'cloudflare:workers'
import { describe, expect, it } from 'vitest'
import {
  adminHeaders,
  createOrder,
  freshIp,
  line,
  ORIGIN,
  orderBody,
  pairDevice,
  postCommand,
  postOrder,
  rejected,
  request,
  room,
  startEnrollment,
  upgrade,
} from './helpers'

type Call = { name: string; path: string; body?: unknown }

// Every route a paired device can use. Order ids don't need to exist:
// authentication is checked before the order is looked up.
const deviceRoutes: Call[] = [
  { name: 'GET board', path: '/api/board' },
  { name: 'GET menu', path: '/api/menu' },
  { name: 'GET tables', path: '/api/tables' },
  { name: 'GET session', path: '/api/session' },
  { name: 'GET order', path: '/api/orders/x' },
  { name: 'POST order', path: '/api/orders', body: orderBody() },
  {
    name: 'POST command',
    path: '/api/orders/x/commands',
    body: {
      operationId: crypto.randomUUID(),
      type: 'ready',
      expectedVersion: 1,
    },
  },
  {
    name: 'POST tv control',
    path: '/api/tv/control',
    body: { action: 'pause' },
  },
]

const adminRoutes: Call[] = [
  { name: 'GET admin session', path: '/api/admin/session' },
  { name: 'GET devices', path: '/api/devices' },
  {
    name: 'POST approve',
    path: '/api/devices/enroll/approve',
    body: { code: '123456', role: 'tv', label: 'TV' },
  },
  {
    name: 'POST revoke',
    path: `/api/devices/${crypto.randomUUID()}/revoke`,
    body: {},
  },
  { name: 'POST open day', path: '/api/manager/service-day/open', body: {} },
  {
    name: 'POST settings',
    path: '/api/admin/settings',
    body: { allergy: true, lineNotes: true, orderNote: true },
  },
  {
    name: 'POST close day',
    path: '/api/manager/service-day/close',
    body: { force: false },
  },
]

describe('without credentials', () => {
  it.each([...deviceRoutes, ...adminRoutes])('$name is 401', async (call) => {
    const res = await request(call.path, { body: call.body })
    expect(res.status).toBe(401)
  })

  it('refuses a socket, even with forged room headers', async () => {
    const res = await upgrade({
      Origin: ORIGIN,
      'x-kds-admin': '1',
      'x-kds-device-id': crypto.randomUUID(),
      'x-kds-device-secret': 'f'.repeat(64),
    })
    expect(res.status).toBe(401)
  })

  it.each([
    ['garbage', 'kds_admin=nope'],
    ['a bad signature', `kds_admin=${Date.now() + 60_000}.${'0'.repeat(64)}`],
    [
      'a made-up device',
      `kds_device=main.${crypto.randomUUID()}.${'a'.repeat(64)}`,
    ],
  ])('refuses a cookie with %s', async (_, cookie) => {
    const res = await request('/api/board', { headers: { cookie } })
    expect(res.status).toBe(401)
  })

  it('refuses an expired admin cookie', async () => {
    const { cookie } = await adminHeaders()
    const signed = cookie.replace(/=\d+\./, `=${Date.now() - 1000}.`)
    expect(
      (await request('/api/devices', { headers: { cookie: signed } })).status,
    ).toBe(401)
  })
})

describe('device roles', () => {
  it('a TV can read but every write route is 403', async () => {
    const tv = await pairDevice('tv')
    const { orderId } = await createOrder()
    expect((await request('/api/board', { headers: tv.headers })).status).toBe(
      200,
    )
    expect((await postOrder(orderBody(), tv.headers)).status).toBe(403)
    for (const type of ['accept', 'ready', 'serve', 'ackChange', 'ackCancel']) {
      const res = await postCommand(
        orderId,
        { type, expectedVersion: 1 },
        tv.headers,
      )
      await rejected(res, 403)
    }
    const add = await postCommand(
      orderId,
      { type: 'addLines', expectedVersion: 1, lines: [line()] },
      tv.headers,
    )
    await rejected(add, 403)
    const tvControl = await request('/api/tv/control', {
      headers: tv.headers,
      body: { action: 'pause' },
    })
    expect(tvControl.status).toBe(403)
  })

  it('a waiter creates and serves but cannot accept', async () => {
    const waiter = await pairDevice('waiter')
    const res = await postOrder(orderBody(), waiter.headers)
    expect(res.status).toBe(201)
    const { orderId } = (await res.json()) as { orderId: string }
    await rejected(
      await postCommand(
        orderId,
        { type: 'accept', expectedVersion: 1 },
        waiter.headers,
      ),
      403,
    )
  })

  it('the kitchen accepts but cannot create', async () => {
    const kitchen = await pairDevice('kitchen')
    await rejected(await postOrder(orderBody(), kitchen.headers), 403)
    const { orderId } = await createOrder()
    const res = await postCommand(
      orderId,
      { type: 'accept', expectedVersion: 1 },
      kitchen.headers,
    )
    expect(res.status).toBe(200)
  })

  it.each(adminRoutes)('a device on $name is 401', async (call) => {
    const kitchen = await pairDevice('kitchen')
    const res = await request(call.path, {
      body: call.body,
      headers: kitchen.headers,
    })
    expect(res.status).toBe(401)
  })

  it('reports its role and label', async () => {
    const tv = await pairDevice('tv', 'TV dapur')
    const res = await request('/api/session', { headers: tv.headers })
    expect(await res.json()).toEqual({ role: 'tv', label: 'TV dapur' })
  })
})

describe('same-origin guard', () => {
  it.each([
    ['another origin', { origin: 'http://evil.test' }],
    ['no origin', { origin: '' }],
    ['a cross-site fetch', { 'sec-fetch-site': 'cross-site' }],
  ])('refuses a POST from %s', async (_, extra) => {
    const res = await request('/api/orders', {
      body: orderBody(),
      headers: { ...(await adminHeaders()), ...extra },
    })
    expect(res.status).toBe(403)
  })

  it('refuses a cross-site GET too', async () => {
    const res = await request('/api/board', {
      headers: { ...(await adminHeaders()), 'sec-fetch-site': 'cross-site' },
    })
    expect(res.status).toBe(403)
  })

  it('refuses a socket from another origin', async () => {
    const res = await upgrade({
      Origin: 'http://evil.test',
      ...(await adminHeaders()),
    })
    expect(res.status).toBe(403)
  })

  it('refuses bodies over 64 KB', async () => {
    const res = await request('/api/orders', {
      body: { padding: 'x'.repeat(70 * 1024) },
      headers: await adminHeaders(),
    })
    expect(res.status).toBe(413)
  })
})

describe('admin login', () => {
  it('sets a session cookie for the right password only', async () => {
    const ip = freshIp()
    const wrong = await request('/api/admin/login', {
      body: { password: 'wrong' },
      headers: ip,
    })
    expect(wrong.status).toBe(401)
    expect(wrong.headers.get('set-cookie')).toBeNull()

    const right = await request('/api/admin/login', {
      body: { password: env.ADMIN_PASSWORD },
      headers: ip,
    })
    expect(right.status).toBe(204)
    const cookie = right.headers.get('set-cookie') ?? ''
    expect(cookie).toMatch(/kds_admin=.+HttpOnly/i)
    expect(cookie).toMatch(/SameSite=Lax/i)
    const session = await request('/api/admin/session', {
      headers: { cookie: cookie.split(';')[0] ?? '' },
    })
    expect(session.status).toBe(204)
  })

  it('locks out after five attempts a minute, even with the right password', async () => {
    const ip = freshIp()
    for (let i = 0; i < 5; i++) {
      const res = await request('/api/admin/login', {
        body: { password: 'wrong' },
        headers: ip,
      })
      expect(res.status).toBe(401)
    }
    const locked = await request('/api/admin/login', {
      body: { password: env.ADMIN_PASSWORD },
      headers: ip,
    })
    expect(locked.status).toBe(429)
  })
})

describe('pairing', () => {
  async function poll(challengeId: string, pollSecret: string) {
    return request('/api/devices/enroll/poll', {
      body: { challengeId, pollSecret },
    })
  }
  async function approve(code: string) {
    return request('/api/devices/enroll/approve', {
      headers: await adminHeaders(),
      body: { code, role: 'waiter', label: 'Tablet' },
    })
  }

  it('stays pending until approved, then pays out exactly once', async () => {
    const c = await startEnrollment()
    expect(c.code).toMatch(/^\d{6}$/)
    const pending = await poll(c.challengeId, c.pollSecret)
    expect(await pending.json()).toEqual({ status: 'pending' })
    expect(pending.headers.get('set-cookie')).toBeNull()

    expect((await approve(c.code)).status).toBe(200)
    const approved = await poll(c.challengeId, c.pollSecret)
    // The token is only in the cookie, never in the body.
    expect(await approved.json()).toEqual({
      status: 'approved',
      role: 'waiter',
      label: 'Tablet',
    })
    expect(approved.headers.get('set-cookie')).toMatch(/kds_device=main\./)

    expect((await poll(c.challengeId, c.pollSecret)).status).toBe(404)
    expect((await approve(c.code)).status).toBe(404)
  })

  it('rejects a wrong code', async () => {
    const c = await startEnrollment()
    const wrong = c.code === '000000' ? '000001' : '000000'
    expect((await approve(wrong)).status).toBe(404)
  })

  it('rejects an expired code', async () => {
    const c = await startEnrollment()
    await runInDurableObject(room(), (_, state) => {
      state.storage.sql.exec(
        'UPDATE enroll_challenges SET expires_at = ? WHERE id = ?',
        Date.now() - 1,
        c.challengeId,
      )
    })
    expect((await approve(c.code)).status).toBe(404)
    expect((await poll(c.challengeId, c.pollSecret)).status).toBe(404)
  })

  it('burns the challenge after five wrong poll secrets', async () => {
    const c = await startEnrollment()
    await approve(c.code)
    for (let i = 0; i < 5; i++) {
      expect((await poll(c.challengeId, 'e'.repeat(64))).status).toBe(401)
    }
    expect((await poll(c.challengeId, c.pollSecret)).status).toBe(404)
  })

  it('limits code requests to ten per ten minutes per address', async () => {
    const ip = freshIp()
    for (let i = 0; i < 10; i++) await startEnrollment(ip)
    const res = await request('/api/devices/enroll/start', {
      method: 'POST',
      headers: ip,
    })
    expect(res.status).toBe(429)
  })
})

describe('revoking a device', () => {
  it('closes its socket with 4001 and refuses it afterwards', async () => {
    const tablet = await pairDevice('waiter')
    const res = await upgrade({ Origin: ORIGIN, ...tablet.headers })
    const ws = res.webSocket
    if (!ws) throw new Error('no socket')
    const messages: string[] = []
    const closed = new Promise<number>((resolve) => {
      ws.addEventListener('message', (e) => {
        messages.push(String(e.data))
      })
      ws.addEventListener('close', (e) => resolve(e.code))
    })
    ws.accept()

    const revoke = await request(`/api/devices/${tablet.deviceId}/revoke`, {
      headers: await adminHeaders(),
      body: {},
    })
    expect(revoke.status).toBe(200)
    expect(await closed).toBe(4001)
    expect(messages).toContain(JSON.stringify({ type: 'revoked' }))

    expect(
      (await request('/api/board', { headers: tablet.headers })).status,
    ).toBe(401)
    expect((await postOrder(orderBody(), tablet.headers)).status).toBe(401)
    expect((await upgrade({ Origin: ORIGIN, ...tablet.headers })).status).toBe(
      401,
    )
  })

  it('lists devices without their secrets', async () => {
    await pairDevice('tv', 'TV list')
    const res = await request('/api/devices', { headers: await adminHeaders() })
    const text = await res.text()
    expect(text).toContain('TV list')
    expect(text).not.toMatch(/token|secret/i)
  })
})
