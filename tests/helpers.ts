import { env, exports } from 'cloudflare:workers'
import { expect } from 'vitest'
import { type BoardMessage, boardMessageSchema } from '../src/shared/board'
import { commandResultSchema } from '../src/shared/commands'
import {
  apiErrorSchema,
  type CreateOrder,
  createOrderResultSchema,
  type OrderLineInput,
  type Role,
} from '../src/shared/order'

export const ORIGIN = 'http://kds.test'
export const DEV_KEY = { 'x-dev-key': 'test-dev-key' }

export function room() {
  return env.VENUE_ROOM.getByName('main')
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

function post(path: string, body: unknown) {
  return exports.default.fetch(`${ORIGIN}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...DEV_KEY },
    body: JSON.stringify(body),
  })
}

export function postOrder(body: unknown = orderBody()) {
  return post('/api/orders', body)
}

export function postCommand(orderId: string, body: Record<string, unknown>) {
  return post(`/api/orders/${orderId}/commands`, {
    operationId: crypto.randomUUID(),
    ...body,
  })
}

export function postJson(path: string, body: unknown) {
  return post(path, body)
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
  const res = await exports.default.fetch(`${ORIGIN}/api/board`, {
    headers: DEV_KEY,
  })
  return boardMessageSchema.parse(await res.json())
}

export async function boardOrder(orderId: string) {
  const order = (await getBoard()).orders.find((o) => o.id === orderId)
  if (!order) throw new Error(`order ${orderId} not on the board`)
  return order
}

export function upgrade(headers: Record<string, string>, role?: Role) {
  const query = role ? `?role=${role}` : ''
  return exports.default.fetch(`${ORIGIN}/api/ws${query}`, {
    headers: { Upgrade: 'websocket', ...headers },
  })
}

/** Opens a board socket and returns a reader that yields boards in arrival order. */
export async function openBoardSocket(role?: Role) {
  const res = await upgrade({ Origin: ORIGIN, ...DEV_KEY }, role)
  const ws = res.webSocket
  if (res.status !== 101 || !ws) {
    throw new Error(`Upgrade failed with ${res.status}`)
  }

  const queue: BoardMessage[] = []
  let notify: (() => void) | null = null
  ws.addEventListener('message', (event) => {
    if (typeof event.data !== 'string' || event.data === 'pong') return
    queue.push(boardMessageSchema.parse(JSON.parse(event.data)))
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

  return { ws, nextBoard, boardWhere, pending: () => queue.length }
}
