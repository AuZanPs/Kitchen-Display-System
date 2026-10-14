import { useEffect, useState } from 'react'
import { type BoardMessage, boardMessageSchema } from '../../shared/board'

export const STALE_AFTER_MS = 10_000
const PING_EVERY_MS = 4_000
const RETRY_BASE_MS = 1_000
const RETRY_MAX_MS = 30_000

export type BoardSocket = {
  board: BoardMessage | null
  /** Last time anything (board or pong) arrived from the server. */
  lastMessageAt: number | null
  startedAt: number
  /** Server clock minus device clock, from the latest board. */
  serverOffsetMs: number
}

function parseBoardMessage(data: unknown): BoardMessage | null {
  if (typeof data !== 'string') return null
  try {
    const result = boardMessageSchema.safeParse(JSON.parse(data))
    return result.success ? result.data : null
  } catch {
    // Not JSON at all; treated the same as a message that fails the schema.
    return null
  }
}

export function useBoardSocket(): BoardSocket {
  const [startedAt] = useState(() => Date.now())
  const [board, setBoard] = useState<BoardMessage | null>(null)
  const [lastMessageAt, setLastMessageAt] = useState<number | null>(null)
  const [serverOffsetMs, setServerOffsetMs] = useState(0)

  useEffect(() => {
    let socket: WebSocket | null = null
    let pingTimer: ReturnType<typeof setInterval> | undefined
    let retryTimer: ReturnType<typeof setTimeout> | undefined
    let attempt = 0
    let lastSeen = Date.now()

    const url = new URL('/api/ws', window.location.href)
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'

    function teardown() {
      clearInterval(pingTimer)
      if (!socket) return
      socket.onopen = null
      socket.onmessage = null
      socket.onclose = null
      socket.close()
      socket = null
    }

    function reconnectLater() {
      teardown()
      // Exponential backoff with full jitter so devices don't reconnect in lockstep.
      const ceiling = Math.min(RETRY_MAX_MS, RETRY_BASE_MS * 2 ** attempt)
      attempt += 1
      retryTimer = setTimeout(connect, Math.random() * ceiling)
    }

    function connect() {
      lastSeen = Date.now()
      const ws = new WebSocket(url)
      socket = ws
      ws.onopen = () => {
        attempt = 0
        pingTimer = setInterval(() => {
          // A half-open connection never fires close, so drop it ourselves.
          if (Date.now() - lastSeen > STALE_AFTER_MS) reconnectLater()
          else if (ws.readyState === WebSocket.OPEN) ws.send('ping')
        }, PING_EVERY_MS)
      }
      ws.onmessage = (event) => {
        const now = Date.now()
        lastSeen = now
        setLastMessageAt(now)
        if (event.data === 'pong') return
        const message = parseBoardMessage(event.data)
        if (!message) {
          console.warn('Ignored a malformed board message')
          return
        }
        setServerOffsetMs(message.serverTime - now)
        setBoard((current) =>
          current && current.rev > message.rev ? current : message,
        )
      }
      ws.onclose = reconnectLater
    }

    connect()
    return () => {
      clearTimeout(retryTimer)
      teardown()
    }
  }, [])

  return { board, lastMessageAt, startedAt, serverOffsetMs }
}
