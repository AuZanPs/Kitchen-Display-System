import { useEffect, useState } from 'react'
import { STALE_AFTER_MS, useBoardSocket } from '../lib/use-board-socket'

const TIME_ZONE = 'Asia/Jakarta'

function formatTime(at: number, withSeconds = false) {
  return new Date(at).toLocaleTimeString('en-GB', {
    timeZone: TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
    second: withSeconds ? '2-digit' : undefined,
  })
}

function useNow(everyMs: number) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), everyMs)
    return () => clearInterval(id)
  }, [everyMs])
  return now
}

// What the kitchen TV browser supports; read off the screen during the hardware test.
function browserChecks() {
  const supports = (property: string, value: string) =>
    typeof CSS !== 'undefined' && CSS.supports(property, value)
  return [
    ['User agent', navigator.userAgent],
    [
      'Viewport',
      `${window.innerWidth}×${window.innerHeight} @${window.devicePixelRatio}x`,
    ],
    ['color-mix()', supports('color', 'color-mix(in srgb, red, blue)')],
    ['oklch()', supports('color', 'oklch(0.5 0.1 200)')],
    ['@layer', 'CSSLayerBlockRule' in window],
    ['@property', 'CSSPropertyRule' in window],
  ] as const
}

export function TvPage() {
  const { board, lastMessageAt, startedAt, serverOffsetMs } = useBoardSocket()
  const now = useNow(1000)
  const silentFor = now - (lastMessageAt ?? startedAt)
  const isDisconnected = silentFor > STALE_AFTER_MS

  return (
    <main className="tv">
      {isDisconnected && (
        <p className="tv-banner" role="alert">
          Disconnected - last update{' '}
          {lastMessageAt ? formatTime(lastMessageAt) : 'never'}
        </p>
      )}
      <p className="tv-clock">{formatTime(now, true)}</p>
      <p className="tv-rev">rev {board?.rev ?? '–'}</p>
      <p>
        {board ? `${board.orders.length} active orders` : 'Waiting for board…'}
      </p>
      <dl className="tv-checks">
        <div>
          <dt>Server clock offset</dt>
          <dd>{Math.round(serverOffsetMs / 1000)} s</dd>
        </div>
        {browserChecks().map(([name, value]) => (
          <div key={name}>
            <dt>{name}</dt>
            <dd>
              {typeof value === 'boolean' ? (value ? 'yes' : 'NO') : value}
            </dd>
          </div>
        ))}
      </dl>
    </main>
  )
}
