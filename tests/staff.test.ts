import { beforeAll, describe, expect, it } from 'vitest'
import {
  adminHeaders,
  freshIp,
  getBoard,
  orderBody,
  pairDevice,
  postJson,
  rejected,
  request,
} from './helpers'

type Headers = Record<string, string>

async function addStaff(name: string, role: 'waiter' | 'kitchen', pin: string) {
  const res = await postJson('/api/manager/staff', { name, role, pin })
  expect(res.status).toBe(201)
  return ((await res.json()) as { staff: { id: string } }).staff.id
}

/** Signs a staff member in on a device; returns both cookies together. */
async function signIn(device: Headers, staffId: string, pin: string) {
  const res = await request('/api/staff/login', {
    headers: { ...device, ...freshIp() },
    body: { staffId, pin },
  })
  const staff = /kds_staff=([^;]+)/.exec(res.headers.get('set-cookie') ?? '')
  return {
    res,
    headers: { cookie: `${device.cookie}; kds_staff=${staff?.[1] ?? ''}` },
  }
}

function order(headers: Headers) {
  return request('/api/orders', { headers, body: orderBody() })
}

beforeAll(async () => {
  const res = await postJson('/api/admin/settings', {
    allergy: false,
    lineNotes: true,
    orderNote: true,
    staffPins: true,
  })
  expect(res.status).toBe(200)
})

describe('staff PINs', () => {
  it('a waiter device needs a staff sign-in before it can order', async () => {
    const name = `Rina ${crypto.randomUUID().slice(0, 4)}`
    const staffId = await addStaff(name, 'waiter', '2468')
    const waiter = await pairDevice('waiter')

    expect((await rejected(await order(waiter.headers), 401)).code).toBe(
      'pin_required',
    )
    const list = await request('/api/staff', { headers: waiter.headers })
    const { staff } = (await list.json()) as { staff: { id: string }[] }
    expect(staff.map((s) => s.id)).toContain(staffId)

    const wrong = await signIn(waiter.headers, staffId, '1111')
    expect(wrong.res.status).toBe(401)
    const ok = await signIn(waiter.headers, staffId, '2468')
    expect(ok.res.status).toBe(200)

    const created = await order(ok.headers)
    expect(created.status).toBe(201)
    const { orderId } = (await created.json()) as { orderId: string }
    const onBoard = (await getBoard()).orders.find((o) => o.id === orderId)
    expect(onBoard?.createdByName).toBe(name)

    const session = await request('/api/session', { headers: ok.headers })
    expect(await session.json()).toMatchObject({ staff: { id: staffId, name } })
  })

  it('locks a staff member after five wrong PINs', async () => {
    const staffId = await addStaff('Budi', 'waiter', '1357')
    const waiter = await pairDevice('waiter')
    for (let i = 0; i < 5; i++) {
      expect((await signIn(waiter.headers, staffId, '0000')).res.status).toBe(
        401,
      )
    }
    expect((await signIn(waiter.headers, staffId, '1357')).res.status).toBe(429)
  })

  it('a staff cookie only works on the device that signed in', async () => {
    const staffId = await addStaff('Sari', 'waiter', '8642')
    const first = await pairDevice('waiter')
    const second = await pairDevice('waiter')
    const { headers } = await signIn(first.headers, staffId, '8642')
    const staffCookie = headers.cookie.split('; ')[1] ?? ''
    const stolen = { cookie: `${second.headers.cookie}; ${staffCookie}` }
    expect((await rejected(await order(stolen), 401)).code).toBe('pin_required')
  })

  it('refuses kitchen staff on a waiter tablet', async () => {
    const staffId = await addStaff('Dapur', 'kitchen', '9753')
    const waiter = await pairDevice('waiter')
    expect((await signIn(waiter.headers, staffId, '9753')).res.status).toBe(401)
  })

  it('a disabled staff member is signed out on the next action', async () => {
    const name = 'Tono'
    const staffId = await addStaff(name, 'waiter', '4826')
    const waiter = await pairDevice('waiter')
    const { headers } = await signIn(waiter.headers, staffId, '4826')
    const off = await request(`/api/manager/staff/${staffId}`, {
      method: 'PUT',
      headers: await adminHeaders(),
      body: { name, role: 'waiter', disabled: true },
    })
    expect(off.status).toBe(200)
    expect((await rejected(await order(headers), 401)).code).toBe(
      'pin_required',
    )
  })

  it('a new PIN signs the person out and lifts a lockout', async () => {
    const name = 'Wati'
    const staffId = await addStaff(name, 'waiter', '5555')
    const waiter = await pairDevice('waiter')
    const { headers } = await signIn(waiter.headers, staffId, '5555')
    expect((await order(headers)).status).toBe(201)
    for (let i = 0; i < 5; i++) await signIn(waiter.headers, staffId, '0000')
    expect((await signIn(waiter.headers, staffId, '5555')).res.status).toBe(429)

    const reset = await request(`/api/manager/staff/${staffId}`, {
      method: 'PUT',
      headers: await adminHeaders(),
      body: { name, role: 'waiter', pin: '6666' },
    })
    expect(reset.status).toBe(200)
    expect((await rejected(await order(headers), 401)).code).toBe(
      'pin_required',
    )
    expect((await signIn(waiter.headers, staffId, '6666')).res.status).toBe(200)
  })

  it('the admin list never contains PIN hashes', async () => {
    await addStaff('Lina', 'kitchen', '3141')
    const res = await request('/api/manager/staff', {
      headers: await adminHeaders(),
    })
    const text = await res.text()
    expect(text).toContain('Lina')
    expect(text).not.toMatch(/pin_?hash|pin_?salt|3141/i)
  })
})
