import { AlarmClock, Ban, PencilLine, WifiOff } from 'lucide-react'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import {
  type BoardMessage,
  type BoardOrder,
  type OrderStatus,
  RECEIPT_ITEMS_MAX,
  type RenderedMessage,
} from '../../shared/board'
import { ticketLabel } from '../../shared/order'
import { formatTime, type Translate, useI18n } from '../i18n'
import { boardLines, whereLabel } from '../lib/board'
import { RequireRole } from '../lib/session'
import { STALE_AFTER_MS, useBoardSocket } from '../lib/use-board-socket'
import { useNow } from '../lib/use-now'
import { useWakeLock } from '../lib/use-wake-lock'
import { Ticket } from '../ticket'
import { fixtureBoard } from './fixture'

const REMINDER_AFTER_MS = 12 * 60 * 1000
const RECEIPT_EVERY_MS = 1_000
// ponytail: below this the text is too small to read from the line; a fuller
// lane than that gets cut off at the bottom instead.
const MIN_ZOOM = 0.25
// Narrowest a ticket gets before it shrinks: a lane on a 1920 px TV holds one.
const COLUMN_PX = 400

const LANES = [
  { status: 'new', label: 'laneNew' },
  { status: 'accepted', label: 'lanePreparing' },
  { status: 'ready', label: 'laneReady' },
] as const satisfies readonly { status: OrderStatus; label: string }[]

export function TvPage() {
  // Layout check with synthetic tickets; compiled out of production builds.
  const fixture = import.meta.env.DEV
    ? Number(new URLSearchParams(window.location.search).get('fixture'))
    : 0
  if (fixture > 0) return <FixtureBoard count={fixture} />
  return (
    <RequireRole allow="tv">
      {(session) => <LiveBoard place={session.label} />}
    </RequireRole>
  )
}

function FixtureBoard({ count }: { count: number }) {
  const [board] = useState(() => fixtureBoard(count, Date.now()))
  const now = useNow(1000)
  return (
    <BoardView
      board={board}
      place="Fixture"
      now={now}
      serverOffsetMs={0}
      lastMessageAt={now}
      disconnected={false}
    />
  )
}

function LiveBoard({ place }: { place: string }) {
  const { board, lastMessageAt, startedAt, serverOffsetMs, send } =
    useBoardSocket()
  const now = useNow(1000)
  useWakeLock()
  useRenderReceipts(board?.orders, send)
  return (
    <BoardView
      board={board}
      place={place}
      now={now}
      serverOffsetMs={serverOffsetMs}
      lastMessageAt={lastMessageAt}
      disconnected={now - (lastMessageAt ?? startedAt) > STALE_AFTER_MS}
    />
  )
}

function BoardView({
  board,
  place,
  now,
  serverOffsetMs,
  lastMessageAt,
  disconnected,
}: {
  board: BoardMessage | null
  place: string
  now: number
  serverOffsetMs: number
  lastMessageAt: number | null
  disconnected: boolean
}) {
  const { t } = useI18n()
  const attention = (board?.orders ?? []).filter(
    (o) => (o.changePending || o.cancelRequested) && o.status !== 'cancelled',
  )

  return (
    <main className="on-ink flex h-dvh flex-col gap-6 overflow-hidden bg-ink px-5 pt-8 pb-10 text-surface sm:px-12">
      <header className="flex flex-wrap items-center gap-x-6 gap-y-3 border-b border-surface-soft/40 pb-6">
        <h1 translate="no" className="text-[32px] font-semibold tracking-tight">
          Layar Dapur
        </h1>
        <span className="mr-auto text-[28px] text-surface-soft">/ {place}</span>
        {disconnected ? (
          <span className="flex items-center gap-2 rounded-full border-2 border-surface px-5 py-2 text-[22px] font-semibold">
            <WifiOff size={24} aria-hidden />
            {t('staleData')}
          </span>
        ) : (
          <span className="flex items-center gap-2 rounded-full bg-tonal px-5 py-2 text-[22px] font-medium text-ink">
            <span className="size-2.5 rounded-full bg-ink" aria-hidden />
            {t('live')}
          </span>
        )}
        <time className="text-[44px] font-medium tabular-nums">
          {formatTime(now)}
        </time>
      </header>

      {disconnected && (
        <p
          role="alert"
          className="flex items-center gap-3 rounded-md bg-surface px-6 py-4 text-[26px] font-semibold text-ink"
        >
          <WifiOff size={30} aria-hidden />
          {t('disconnected', {
            time: lastMessageAt ? formatTime(lastMessageAt) : '--:--',
          })}
        </p>
      )}

      {attention.length > 0 && <AttentionStrip orders={attention} t={t} />}

      {board ? (
        // Narrower than a laptop, the lanes swipe sideways one at a time.
        <div
          // biome-ignore lint/a11y/noNoninteractiveTabindex: lets keyboard users scroll the lanes
          tabIndex={0}
          className="grid min-h-0 flex-1 snap-x snap-mandatory auto-cols-[minmax(min(20rem,100%),1fr)] grid-flow-col gap-8 overflow-x-auto"
        >
          {LANES.map((lane) => (
            <Lane
              key={lane.status}
              label={t(lane.label)}
              orders={board.orders.filter((o) => o.status === lane.status)}
              serverNow={now + serverOffsetMs}
              t={t}
            />
          ))}
        </div>
      ) : (
        <p className="grid flex-1 place-items-center text-[30px] text-surface-soft">
          {t('waitingBoard')}
        </p>
      )}
    </main>
  )
}

/**
 * One lane. Every ticket stays on screen: when they outgrow the lane, the
 * lane shrinks them and flows them into more columns until all of them fit.
 */
function Lane({
  label,
  orders,
  serverNow,
  t,
}: {
  label: string
  orders: BoardOrder[]
  serverNow: number
  t: Translate
}) {
  const boxRef = useRef<HTMLDivElement>(null)
  const flowRef = useRef<HTMLDivElement>(null)
  const [height, setHeight] = useState(0)
  const [zoom, setZoom] = useState(1)

  useLayoutEffect(() => {
    const box = boxRef.current
    if (!box) return
    const observer = new ResizeObserver(() => setHeight(box.clientHeight))
    observer.observe(box)
    return () => observer.disconnect()
  }, [])

  // Tries ever smaller sizes before paint; shrinking makes room for more
  // columns. The first size where nothing spills over wins.
  // biome-ignore lint/correctness/useExhaustiveDependencies: new orders change what has to fit
  useLayoutEffect(() => {
    const flow = flowRef.current
    if (!flow || height === 0) return
    for (let step = 0; ; step += 1) {
      const next = Math.round((1 - step * 0.05) * 100) / 100
      flow.style.zoom = String(next)
      flow.style.height = `${height / next}px`
      const fits =
        flow.scrollWidth <= flow.clientWidth + 1 &&
        flow.scrollHeight <= flow.clientHeight + 1
      if (fits || next <= MIN_ZOOM) {
        setZoom(next)
        return
      }
    }
  }, [orders, height])

  return (
    <section
      className="flex min-h-0 snap-start flex-col gap-5"
      aria-label={label}
    >
      <h2 className="flex items-center gap-3 text-[30px]">
        <span className="size-3 rounded-full bg-tonal" aria-hidden />
        <span className="mr-auto">{label}</span>
        <span className="grid size-11 place-items-center rounded-full bg-surface text-[22px] font-semibold text-ink tabular-nums">
          {orders.length}
        </span>
      </h2>
      <div ref={boxRef} className="min-h-0 flex-1 overflow-hidden">
        <div
          ref={flowRef}
          className="gap-6 [column-fill:auto]"
          style={{ zoom, height: height / zoom, columnWidth: COLUMN_PX }}
        >
          {orders.map((order) => (
            <Ticket
              key={order.id}
              // A ticket too tall for one column carries on in the next.
              className="ticket-enter mb-6 break-inside-avoid [box-decoration-break:clone]"
              size="tv"
              ticketNo={order.ticketNo}
              where={whereLabel(order, t)}
              takeaway={order.takeaway}
              lines={boardLines(order)}
              orderNote={order.orderNote}
              tonalHeader={order.status === 'ready'}
              aside={
                <Age
                  createdAt={order.createdAt}
                  now={serverNow}
                  onTonal={order.status === 'ready'}
                  t={t}
                />
              }
            />
          ))}
        </div>
      </div>
    </section>
  )
}

function Age({
  createdAt,
  now,
  onTonal = false,
  t,
}: {
  createdAt: number
  now: number
  /** Sits on a soft blue header, so the pill turns off-white. */
  onTonal?: boolean
  t: Translate
}) {
  const ms = Math.max(0, now - createdAt)
  const total = Math.floor(ms / 1000)
  const mm = String(Math.floor(total / 60) % 60).padStart(2, '0')
  const ss = String(total % 60).padStart(2, '0')
  const hours = Math.floor(total / 3600)
  const text =
    hours > 0 ? `${hours}:${mm}:${ss}` : `${Math.floor(total / 60)}:${ss}`
  if (ms < REMINDER_AFTER_MS) {
    return (
      <span
        className={`shrink-0 rounded-full px-4 py-1.5 text-[24px] tabular-nums ${onTonal ? 'bg-surface' : 'bg-tonal'}`}
      >
        {text}
      </span>
    )
  }
  return (
    <span className="flex shrink-0 items-center gap-2 rounded-full bg-ink px-4 py-1.5 text-[24px] font-semibold text-surface tabular-nums">
      <AlarmClock size={24} aria-hidden />
      {text}
      <span className="sr-only">{t('minutesOver', { min: 12 })}</span>
    </span>
  )
}

function AttentionStrip({ orders, t }: { orders: BoardOrder[]; t: Translate }) {
  return (
    <ul className="flex flex-wrap gap-3" aria-label={t('changesStrip')}>
      {orders.map((o) => (
        <li
          key={o.id}
          className="flex items-center gap-2 rounded-full bg-surface px-5 py-2 text-[24px] font-semibold text-ink"
        >
          {o.cancelRequested ? (
            <Ban size={24} aria-hidden />
          ) : (
            <PencilLine size={24} aria-hidden />
          )}
          {ticketLabel(o.ticketNo)} · {whereLabel(o, t)} ·{' '}
          {o.cancelRequested ? t('cancelRequested') : t('changePending')}
        </li>
      ))}
    </ul>
  )
}

/**
 * Tells the room which order versions this TV has drawn, at most once a
 * second and only for versions it has not reported yet.
 */
function useRenderReceipts(
  orders: BoardOrder[] | undefined,
  send: (message: RenderedMessage) => boolean,
) {
  const reported = useRef(new Map<string, number>())
  const lastSent = useRef(0)
  const [retryTick, setRetryTick] = useState(0)

  // biome-ignore lint/correctness/useExhaustiveDependencies: `retryTick` re-runs once the throttle window passes
  useEffect(() => {
    if (!orders) return
    const items = orders
      .filter((o) => (reported.current.get(o.id) ?? 0) < o.version)
      .map((o) => ({ id: o.id, version: o.version }))
    if (items.length === 0) return
    const wait = lastSent.current + RECEIPT_EVERY_MS - Date.now()
    if (wait > 0) {
      const timer = setTimeout(() => setRetryTick((n) => n + 1), wait)
      return () => clearTimeout(timer)
    }
    // Sent after paint: the effect runs once React has committed the cards.
    // Not connected: the next board after reconnecting runs this again.
    if (!send({ type: 'rendered', items: items.slice(0, RECEIPT_ITEMS_MAX) }))
      return
    lastSent.current = Date.now()
    for (const item of items) reported.current.set(item.id, item.version)
  }, [orders, send, retryTick])
}
