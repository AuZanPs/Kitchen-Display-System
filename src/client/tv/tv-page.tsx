import { AlarmClock, Ban, Pause, PencilLine, WifiOff } from 'lucide-react'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type {
  BoardMessage,
  BoardOrder,
  OrderStatus,
  RenderedMessage,
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
import { paginate, type Slice } from './paging'

const REMINDER_AFTER_MS = 12 * 60 * 1000
const RECEIPT_EVERY_MS = 1_000
const PAGE_EVERY_MS = 8_000
// Must match gap-6 between cards and gap-3 between ticket lines.
const CARD_GAP = 24
const LINE_GAP = 12

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
  const tick = usePageTick(board?.tvControl)
  const attention = (board?.orders ?? []).filter(
    (o) => (o.changePending || o.cancelRequested) && o.status !== 'cancelled',
  )

  return (
    <main className="on-ink flex h-dvh flex-col gap-6 overflow-hidden bg-ink px-12 pt-8 pb-10 text-surface">
      <header className="flex items-center gap-6 border-b border-surface-soft/40 pb-6">
        <h1 translate="no" className="text-[32px] font-semibold tracking-tight">
          KDS
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
        <div className="grid min-h-0 flex-1 grid-cols-3 gap-8">
          {LANES.map((lane) => (
            <Lane
              key={lane.status}
              label={t(lane.label)}
              orders={board.orders.filter((o) => o.status === lane.status)}
              tick={tick}
              paused={board.tvControl.paused}
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

/** Advances every 8 s unless paused; the kitchen can jump to a page. */
function usePageTick(control: BoardMessage['tvControl'] | undefined) {
  const [tick, setTick] = useState(0)
  const page = control?.page
  const paused = control?.paused ?? false
  // Pausing or picking a page shows the kitchen's page, not the local one.
  // biome-ignore lint/correctness/useExhaustiveDependencies: `paused` only re-syncs the page
  useEffect(() => {
    if (page !== undefined) setTick(page)
  }, [page, paused])
  useEffect(() => {
    if (paused) return
    const timer = setInterval(() => setTick((n) => n + 1), PAGE_EVERY_MS)
    return () => clearInterval(timer)
  }, [paused])
  return tick
}

/**
 * One lane. Every ticket is also drawn in an invisible layer at full length;
 * those measurements decide which whole tickets (or parts of a tall one) fit
 * on each page, so nothing is ever cut off.
 */
function Lane({
  label,
  orders,
  tick,
  paused,
  serverNow,
  t,
}: {
  label: string
  orders: BoardOrder[]
  tick: number
  paused: boolean
  serverNow: number
  t: Translate
}) {
  const boxRef = useRef<HTMLDivElement>(null)
  const measureRef = useRef<HTMLDivElement>(null)
  const [height, setHeight] = useState(0)
  const [pages, setPages] = useState<Slice[][] | null>(null)

  useLayoutEffect(() => {
    const box = boxRef.current
    if (!box) return
    const observer = new ResizeObserver(() => setHeight(box.clientHeight))
    observer.observe(box)
    return () => observer.disconnect()
  }, [])

  // biome-ignore lint/correctness/useExhaustiveDependencies: new orders change what the hidden layer drew
  useLayoutEffect(() => {
    const root = measureRef.current
    if (!root || height === 0) return
    const sizes = [...root.children].map((card) => ({
      height: card.getBoundingClientRect().height,
      lines: [...card.querySelectorAll('ol > li')].map(
        (li) => li.getBoundingClientRect().height,
      ),
    }))
    const next = paginate(sizes, height, CARD_GAP, LINE_GAP)
    setPages((current) =>
      JSON.stringify(current) === JSON.stringify(next) ? current : next,
    )
  }, [orders, height])

  const total = pages?.length ?? 1
  const pageIndex = tick % total
  const page: Slice[] =
    pages?.[pageIndex] ??
    orders.map((order, index) => ({
      index,
      from: 0,
      to: order.lines.length,
      part: 0,
    }))

  return (
    <section className="flex min-h-0 flex-col gap-5" aria-label={label}>
      <h2 className="flex items-center gap-3 text-[30px]">
        <span className="size-3 rounded-full bg-tonal" aria-hidden />
        <span className="mr-auto">{label}</span>
        {total > 1 && (
          <span className="flex items-center gap-2 text-[22px] text-surface-soft tabular-nums">
            {paused && <Pause size={22} aria-hidden />}
            {t('page', { n: pageIndex + 1, total })}
          </span>
        )}
        <span className="grid size-11 place-items-center rounded-full bg-surface text-[22px] font-semibold text-ink tabular-nums">
          {orders.length}
        </span>
      </h2>
      <div ref={boxRef} className="relative min-h-0 flex-1 overflow-hidden">
        <div key={pageIndex} className="grid content-start gap-6">
          {page.map((slice) => {
            const order = orders[slice.index]
            if (!order) return null
            const lines = boardLines(order)
            return (
              <Ticket
                key={`${order.id}:${slice.part}`}
                className="ticket-enter"
                size="tv"
                ticketNo={order.ticketNo}
                where={whereLabel(order, t)}
                takeaway={order.takeaway}
                lines={lines.slice(slice.from, slice.to)}
                allLines={lines}
                continued={slice.part > 0}
                // The order note closes the ticket, so it goes on the last part.
                orderNote={slice.to === lines.length ? order.orderNote : null}
                tonalHeader={order.status === 'ready'}
                aside={
                  slice.part > 0 ? null : (
                    <Age
                      createdAt={order.createdAt}
                      now={serverNow}
                      onTonal={order.status === 'ready'}
                      t={t}
                    />
                  )
                }
              />
            )
          })}
        </div>
        <div
          ref={measureRef}
          aria-hidden
          className="pointer-events-none invisible absolute inset-x-0 top-0 grid content-start gap-6"
        >
          {orders.map((order) => (
            <Ticket
              key={order.id}
              size="tv"
              ticketNo={order.ticketNo}
              where={whereLabel(order, t)}
              takeaway={order.takeaway}
              lines={boardLines(order)}
              orderNote={order.orderNote}
              aside={<Age createdAt={order.createdAt} now={serverNow} t={t} />}
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
    if (!send({ type: 'rendered', items: items.slice(0, 200) })) return
    lastSent.current = Date.now()
    for (const item of items) reported.current.set(item.id, item.version)
  }, [orders, send, retryTick])
}
