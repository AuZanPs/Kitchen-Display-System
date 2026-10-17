import { env, exports } from 'cloudflare:workers'
import { expect } from 'vitest'
import { type BoardMessage, boardMessageSchema } from '../src/shared/board'
import { commandResultSchema } from '../src/shared/commands'
import {
  apiErrorSchema,
  type CreateOrder,
  createOrderResultSchema,
  type OrderLineInput,
} from '../src/shared/order'
import { hmacHex } from '../src/worker/auth/crypto'
import type { Credentials } from '../src/worker/devices'

export const ORIGIN = 'http://kds.test'
export const ADMIN_PASSWORD = 'test-admin-password'

type PairRole = 'waiter' | 'kitchen' | 'tv'
type HeaderMap = Record<string, string>

export function room() {
  return env.VENUE_ROOM.getByName('main')
}

/** Same cookie the login route sets, signed with the test secret. */
export async function adminHeaders(): Promise<HeaderMap> {
  const exp = Date.now() + 60 * 60 * 1000
  const signature = await hmacHex(env.SESSION_SECRET, `admin.main.${exp}`)
  return { cookie: `kds_admin=${exp}.${signature}` }
}

/** A random client address, so enrollment rate limits don't leak between tests. */
export function freshIp(): HeaderMap {
  return {
    'cf-connecting-ip': `10.0.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`,
  }
}

export function request(
  path: string,
  init: { method?: string; headers?: HeaderMap; body?: unknown } = {},
) {
  const method = init.method ?? (init.body === undefined ? 'GET' : 'POST')
  return exports.default.fetch(`${ORIGIN}${path}`, {
    method,
    headers: {
      ...(method === 'GET' ? {} : { origin: ORIGIN }),
      ...(init.body === undefined
        ? {}
        : { 'content-type': 'application/json' }),
      ...init.headers,
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  })
}

export async function startEnrollment(headers: HeaderMap = freshIp()) {
  const res = await request('/api/devices/enroll/start', {
    method: 'POST',
    headers,
  })
  expect(res.status).toBe(200)
  return (await res.json()) as {
    challengeId: string
    code: string
    pollSecret: string
    expiresAt: number
  }
}

/** Pairs a device over HTTP and returns the cookie header it was given. */
export async function pairDevice(role: PairRole, label = `Test ${role}`) {
  const challenge = await startEnrollment()
  const approve = await request('/api/devices/enroll/approve', {
    headers: await adminHeaders(),
    body: { code: challenge.code, role, label },
  })
  expect(approve.status).toBe(200)
  const poll = await request('/api/devices/enroll/poll', {
    body: {
      challengeId: challenge.challengeId,
      pollSecret: challenge.pollSecret,
    },
  })
  expect(poll.status).toBe(200)
  const cookie = /kds_device=([^;]+)/.exec(
    poll.headers.get('set-cookie') ?? '',
  )?.[1]
  if (!cookie) throw new Error('no device cookie')
  const deviceId = cookie.split('.')[1] ?? ''
  return { headers: { cookie: `kds_device=${cookie}` }, deviceId }
}

/** Pairs a device straight through a room stub, for tests that call the room directly. */
export async function deviceCredentials(
  stub: ReturnType<typeof room>,
  role: PairRole,
): Promise<Credentials> {
  const started = await stub.startEnrollment(crypto.randomUUID())
  if (!started.ok) throw new Error('start failed')
  const { code, challengeId, pollSecret } = started.body
  await stub.approveEnrollment({ kind: 'admin' }, { code, role, label: role })
  const polled = await stub.pollEnrollment({ challengeId, pollSecret })
  if (!polled.ok || polled.body.status !== 'approved') {
    throw new Error('poll failed')
  }
  const [, deviceId = '', secret = ''] = polled.body.token.split('.')
  return { kind: 'device', deviceId, secret }
}

export function line(overrides: Partial<OrderLineInput> = {}): OrderLineInput {
  return {
    menuItemId: 'nasi-goreng-kampung',
    qty: 2,
    optionIds: ['tidak-pedas'],
    note: '',
    allergy: '',
    ...overrides,
  }
}

export function orderBody(overrides: Partial<CreateOrder> = {}): CreateOrder {
  return {
    operationId: crypto.randomUUID(),
    destination: { type: 'table', tableId: 't07' },
    lines: [line()],
    orderNote: '',
    ...overrides,
  }
}

/** Posts as admin unless other headers are given. */
export async function postJson(
  path: string,
  body: unknown,
  headers?: HeaderMap,
) {
  return request(path, { body, headers: headers ?? (await adminHeaders()) })
}

export function postOrder(body: unknown = orderBody(), headers?: HeaderMap) {
  return postJson('/api/orders', body, headers)
}

export function postCommand(
  orderId: string,
  body: Record<string, unknown>,
  headers?: HeaderMap,
) {
  return postJson(
    `/api/orders/${orderId}/commands`,
    { operationId: crypto.randomUUID(), ...body },
    headers,
  )
}

/** Creates an order and returns its id and ticket. */
export async function createOrder(overrides: Partial<CreateOrder> = {}) {
  const res = await postOrder(orderBody(overrides))
  expect(res.status).toBe(201)
  return createOrderResultSchema.parse(await res.json())
}

/** Sends a command that must succeed and returns the parsed result. */
export async function command(orderId: string, body: Record<string, unknown>) {
  const res = await postCommand(orderId, body)
  const json: unknown = await res.json()
  expect(res.status, JSON.stringify(json)).toBe(200)
  return commandResultSchema.parse(json)
}

export async function rejected(res: Response, status: number) {
  const json: unknown = await res.json()
  expect(res.status, JSON.stringify(json)).toBe(status)
  return apiErrorSchema.parse(json).error
}

export async function getBoard(): Promise<BoardMessage> {
  const res = await request('/api/board', { headers: await adminHeaders() })
  return boardMessageSchema.parse(await res.json())
}

export async function boardOrder(orderId: string) {
  const order = (await getBoard()).orders.find((o) => o.id === orderId)
  if (!order) throw new Error(`order ${orderId} not on the board`)
  return order
}

export function upgrade(headers: HeaderMap) {
  return exports.default.fetch(`${ORIGIN}/api/ws`, {
    headers: { Upgrade: 'websocket', ...headers },
  })
}

/**
 * Opens a board socket (as admin, or as a freshly paired device of `role`)
 * and returns a reader that yields boards in arrival order.
 */
export async function openBoardSocket(role?: PairRole) {
  const auth = role ? (await pairDevice(role)).headers : await adminHeaders()
  return openSocketWith(auth)
}

export async function openSocketWith(auth: HeaderMap) {
  const res = await upgrade({ Origin: ORIGIN, ...auth })
  const ws = res.webSocket
  if (res.status !== 101 || !ws) {
    throw new Error(`Upgrade failed with ${res.status}`)
  }

  const queue: BoardMessage[] = []
  const raw: string[] = []
  let notify: (() => void) | null = null
  ws.addEventListener('message', (event) => {
    if (typeof event.data !== 'string' || event.data === 'pong') return
    raw.push(event.data)
    const parsed = boardMessageSchema.safeParse(JSON.parse(event.data))
    if (parsed.success) queue.push(parsed.data)
    notify?.()
  })
  ws.accept()

  async function nextBoard(): Promise<BoardMessage> {
    for (;;) {
      const board = queue.shift()
      if (board) return board
      await new Promise<void>((resolve) => {
        notify = resolve
      })
    }
  }

  /** Waits for the first board that passes `test`. */
  async function boardWhere(test: (board: BoardMessage) => boolean) {
    for (;;) {
      const board = await nextBoard()
      if (test(board)) return board
    }
  }

  return { ws, nextBoard, boardWhere, pending: () => queue.length, raw }
}
