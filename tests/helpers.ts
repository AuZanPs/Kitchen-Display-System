import { exports } from 'cloudflare:workers'
import { type BoardMessage, boardMessageSchema } from '../src/shared/board'

export const ORIGIN = 'http://kds.test'
export const DEV_KEY = { 'x-dev-key': 'test-dev-key' }

export function postOrder(tableLabel: string) {
  return exports.default.fetch(`${ORIGIN}/api/orders`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...DEV_KEY },
    body: JSON.stringify({ tableLabel }),
  })
}

export function upgrade(headers: Record<string, string>) {
  return exports.default.fetch(`${ORIGIN}/api/ws`, {
    headers: { Upgrade: 'websocket', ...headers },
  })
}

/** Opens a board socket and returns a reader that yields boards in arrival order. */
export async function openBoardSocket() {
  const res = await upgrade({ Origin: ORIGIN, ...DEV_KEY })
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

  return { ws, nextBoard }
}
