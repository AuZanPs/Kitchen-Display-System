import { useCallback, useEffect, useRef, useState } from 'react'
import {
  type BoardMessage,
  type RenderedMessage,
  type ServerMessage,
  serverMessageSchema,
} from '../../shared/board'

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
  /** Sends a TV render receipt; false (and dropped) while disconnected. */
  send: (message: RenderedMessage) => boolean
}

function parseServerMessage(data: unknown): ServerMessage | null {
  if (typeof data !== 'string') return null
  try {
    const result = serverMessageSchema.safeParse(JSON.parse(data))
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
  const socketRef = useRef<WebSocket | null>(null)

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
      socketRef.current = ws
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
        const message = parseServerMessage(event.data)
        if (!message) {
          console.warn('Ignored a malformed board message')
          return
        }
        if (message.type === 'revoked') {
          teardown()
          clearTimeout(retryTimer)
          window.location.assign('/enroll?revoked=1')
          return
        }
        setServerOffsetMs(message.serverTime - now)
        setBoard((current) =>
          current && current.rev > message.rev ? current : message,
        )
      }
      ws.onclose = reconnectLater
    }

    function restart() {
      clearTimeout(retryTimer)
      attempt = 0
      teardown()
      connect()
    }

    // Back on the network: try now instead of waiting out the backoff.
    function reconnectNow() {
      if (socket?.readyState !== WebSocket.OPEN) restart()
    }

    // A phone that slept can hold a dead socket that still reports open.
    function onVisible() {
      if (document.visibilityState !== 'visible') return
      if (Date.now() - lastSeen > STALE_AFTER_MS) restart()
      else reconnectNow()
    }
    window.addEventListener('online', reconnectNow)
    document.addEventListener('visibilitychange', onVisible)

    connect()
    return () => {
      window.removeEventListener('online', reconnectNow)
      document.removeEventListener('visibilitychange', onVisible)
      clearTimeout(retryTimer)
      teardown()
    }
  }, [])

  const send = useCallback((message: RenderedMessage) => {
    const ws = socketRef.current
    if (ws?.readyState !== WebSocket.OPEN) return false
    ws.send(JSON.stringify(message))
    return true
  }, [])

  return { board, lastMessageAt, startedAt, serverOffsetMs, send }
}
