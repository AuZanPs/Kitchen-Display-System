import { AlarmClock, Ban, PencilLine, WifiOff } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type {
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
import { Ticket } from '../ticket'

const REMINDER_AFTER_MS = 12 * 60 * 1000
const RECEIPT_EVERY_MS = 1_000

const LANES = [
  { status: 'new', label: 'laneNew' },
  { status: 'accepted', label: 'lanePreparing' },
  { status: 'ready', label: 'laneReady' },
] as const satisfies readonly { status: OrderStatus; label: string }[]

export function TvPage() {
  return (
    <RequireRole allow="tv">
      {(session) => <Board place={session.label} />}
    </RequireRole>
  )
}

function Board({ place }: { place: string }) {
  const { t } = useI18n()
  const { board, lastMessageAt, startedAt, serverOffsetMs, send } =
    useBoardSocket()
  const now = useNow(1000)
  const disconnected = now - (lastMessageAt ?? startedAt) > STALE_AFTER_MS
  useRenderReceipts(board?.orders, send)

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
          {LANES.map((lane) => {
            const orders = board.orders.filter((o) => o.status === lane.status)
            return (
              <section
                key={lane.status}
                className="flex min-h-0 flex-col gap-5"
                aria-label={t(lane.label)}
              >
                <h2 className="flex items-center gap-3 text-[30px]">
                  <span className="size-3 rounded-full bg-tonal" aria-hidden />
                  <span className="mr-auto">{t(lane.label)}</span>
                  <span className="grid size-11 place-items-center rounded-full bg-surface text-[22px] font-semibold text-ink tabular-nums">
                    {orders.length}
                  </span>
                </h2>
                {/* No paging yet: a lane taller than the screen is cut off. */}
                <div className="grid min-h-0 content-start gap-6 overflow-hidden">
                  {orders.map((order) => (
                    <Ticket
                      key={order.id}
                      className="ticket-enter"
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
                          now={now + serverOffsetMs}
                          t={t}
                        />
                      }
                    />
                  ))}
                </div>
              </section>
            )
          })}
        </div>
      ) : (
        <p className="grid flex-1 place-items-center text-[30px] text-surface-soft">
          {t('waitingBoard')}
        </p>
      )}
    </main>
  )
}

function Age({
  createdAt,
  now,
  t,
}: {
  createdAt: number
  now: number
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
      <span className="shrink-0 rounded-full bg-tonal px-4 py-1.5 text-[24px] tabular-nums">
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
