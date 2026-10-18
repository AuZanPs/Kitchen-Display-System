import { Download } from 'lucide-react'
import { useEffect, useState } from 'react'
import { z } from 'zod'
import type { BoardOrder } from '../../shared/board'
import {
  type History,
  type HistoryStats,
  historySchema,
  MAX_EXPORT_DAYS,
} from '../../shared/history'
import { jakartaDate, ticketLabel } from '../../shared/order'
import { adminStaffListSchema } from '../../shared/staff'
import { type DictKey, formatIdr, formatTime, useI18n } from '../i18n'
import { api } from '../lib/api'
import { boardLines, whereLabel } from '../lib/board'
import { stagger } from '../lib/stagger'
import { Ticket } from '../ticket'
import { Card } from '../ui/card'
import { Dialog } from '../ui/dialog'
import { TextField } from '../ui/text-field'
import type { Device } from './shared'

const STATUS_KEY: Record<BoardOrder['status'], DictKey> = {
  new: 'laneNew',
  accepted: 'lanePreparing',
  ready: 'laneReady',
  served: 'served',
  cancelled: 'cancelled',
}

const EVENT_KEY: Record<string, DictKey> = {
  created: 'evCreated',
  accept: 'evAccept',
  ackChange: 'evAckChange',
  ready: 'evReady',
  serve: 'evServe',
  addLines: 'evAddLines',
  moveTable: 'evMoveTable',
  requestCancel: 'evRequestCancel',
  ackCancel: 'evAckCancel',
  managerCancel: 'evManagerCancel',
}
// The server's own words add detail only where the label alone says too little.
const WITH_SUMMARY = new Set([
  'addLines',
  'moveTable',
  'requestCancel',
  'managerCancel',
])

const eventsSchema = z.object({
  events: z.array(
    z.object({
      seq: z.number(),
      type: z.string(),
      summary: z.string(),
      staffId: z.string().nullable(),
      deviceId: z.string().nullable(),
      at: z.number(),
    }),
  ),
})
type OrderEvent = z.infer<typeof eventsSchema>['events'][number]

const jakartaToday = () => jakartaDate(Date.now())

export function HistoryTab({
  devices,
  notify,
}: {
  devices: Device[] | null
  notify: (text: string) => void
}) {
  const { t } = useI18n()
  const [day, setDay] = useState(jakartaToday)
  const [history, setHistory] = useState<History | null>(null)
  const [staffNames, setStaffNames] = useState(new Map<string, string>())
  const [open, setOpen] = useState<BoardOrder | null>(null)

  useEffect(() => {
    if (!day) return
    setHistory(null)
    void api(`/api/manager/history?day=${day}`, historySchema).then((r) => {
      if (r.ok) setHistory(r.data)
      else notify(t('networkError'))
    })
  }, [day, notify, t])

  useEffect(() => {
    void api('/api/manager/staff', adminStaffListSchema).then((r) => {
      if (r.ok) setStaffNames(new Map(r.data.staff.map((s) => [s.id, s.name])))
    })
  }, [])

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,20rem)] lg:items-start">
      <section aria-labelledby="history" className="grid content-start gap-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 id="history" className="text-2xl font-medium">
            {t('historyTitle')}
          </h2>
          <label className="grid gap-1.5 text-sm font-medium">
            {t('date')}
            <input
              type="date"
              value={day}
              max={jakartaToday()}
              onChange={(e) => setDay(e.target.value)}
              className="h-12 rounded-sm border border-ink-soft bg-surface px-3 text-base outline-none focus:border-ink focus:shadow-[inset_0_0_0_1px_var(--color-ink)]"
            />
          </label>
        </div>

        <StatTiles stats={history?.stats ?? null} />

        {history && history.orders.length === 0 && (
          <p className="text-ink-soft">{t('noOrdersDay')}</p>
        )}
        <ul className="grid gap-2">
          {history?.orders.map((order, index) => (
            <li key={order.id} style={stagger(index)} className="rise">
              <button
                type="button"
                onClick={() => setOpen(order)}
                className="state grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 rounded-md px-4 py-3 text-left [--bg:var(--color-wash)]"
              >
                <span className="font-medium tabular-nums">
                  {ticketLabel(order.ticketNo)}
                </span>
                <span className="min-w-0 break-words">
                  {whereLabel(order, t)}
                  {order.createdByName && (
                    <span className="text-ink-soft">
                      {' '}
                      · {order.createdByName}
                    </span>
                  )}
                </span>
                <span className="text-sm text-ink-soft tabular-nums">
                  {formatTime(order.createdAt)}
                </span>
                <span
                  className={`col-start-2 justify-self-start rounded-full px-3 py-0.5 text-sm ${order.status === 'cancelled' ? 'border border-ink-soft' : 'bg-tonal'}`}
                >
                  {t(STATUS_KEY[order.status])}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </section>

      <ExportCard />

      <OrderDialog
        order={open}
        onClose={() => setOpen(null)}
        who={(event) =>
          (event.staffId && staffNames.get(event.staffId)) ||
          devices?.find((d) => d.id === event.deviceId)?.label ||
          t('roleManager')
        }
      />
    </div>
  )
}

/** A day's numbers as tiles; the history tab and the overview share them. */
export function StatTiles({ stats }: { stats: HistoryStats | null }) {
  const { t } = useI18n()
  // While loading every tile shows a dash, so the layout never jumps.
  const show = (value: (s: HistoryStats) => string) =>
    stats ? value(stats) : '–'
  const tiles = [
    { label: t('statOrders'), value: show((s) => String(s.orders)) },
    { label: t('statServed'), value: show((s) => String(s.served)) },
    { label: t('statCancelled'), value: show((s) => String(s.cancelled)) },
    {
      label: t('statReady'),
      value: show((s) =>
        s.avgReadyMinutes === null
          ? '–'
          : t('minutes', { min: s.avgReadyMinutes }),
      ),
    },
    { label: t('statRevenue'), value: show((s) => formatIdr(s.revenueIdr)) },
  ]
  return (
    // As many columns as the space allows: wide on the overview, narrower beside the export card.
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-[repeat(auto-fit,minmax(10rem,1fr))]">
      {tiles.map((tile, index) => (
        <li
          key={tile.label}
          style={stagger(index)}
          className="rise grid content-between gap-2 rounded-md bg-wash p-4 last:col-span-2 sm:last:col-span-1"
        >
          <span className="text-sm text-ink-soft">{tile.label}</span>
          <span className="text-2xl font-medium tabular-nums wrap-anywhere">
            {tile.value}
          </span>
        </li>
      ))}
    </ul>
  )
}

function ExportCard() {
  const { t } = useI18n()
  const [from, setFrom] = useState(jakartaToday)
  const [to, setTo] = useState(jakartaToday)
  const days = (Date.parse(to) - Date.parse(from)) / 86_400_000
  const valid = days >= 0 && days < MAX_EXPORT_DAYS
  const link = (format: 'csv' | 'json') =>
    `/api/manager/export?from=${from}&to=${to}&format=${format}`

  return (
    <Card className="grid gap-4">
      <div className="grid gap-1">
        <h2 className="text-2xl font-medium">{t('exportTitle')}</h2>
        <p className="text-[15px] text-ink-soft">{t('exportHint')}</p>
      </div>
      <div className="grid gap-1">
        <TextField
          label={t('from')}
          type="date"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
        />
        <TextField
          label={t('to')}
          type="date"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          error={valid ? null : t('exportRange')}
        />
      </div>
      <div className="flex flex-wrap gap-2">
        {(['csv', 'json'] as const).map((format) =>
          valid ? (
            <a
              key={format}
              href={link(format)}
              download
              className={`state inline-flex min-h-12 items-center gap-2 rounded-full px-6 text-[15px] font-semibold transition-[background-color,scale] duration-150 active:scale-[0.97] ${format === 'csv' ? 'text-surface [--bg:var(--color-ink)] [--on:var(--color-surface)]' : 'border border-ink-soft'}`}
            >
              <Download size={18} aria-hidden />
              {format === 'csv' ? t('downloadCsv') : t('downloadJson')}
            </a>
          ) : null,
        )}
      </div>
    </Card>
  )
}

function OrderDialog({
  order,
  onClose,
  who,
}: {
  order: BoardOrder | null
  onClose: () => void
  who: (event: OrderEvent) => string
}) {
  const { t } = useI18n()
  const [shown, setShown] = useState<BoardOrder | null>(null)
  const eventLabel = (type: string) => {
    const key = EVENT_KEY[type]
    return key ? t(key) : type
  }
  const [events, setEvents] = useState<OrderEvent[] | null>(null)

  useEffect(() => {
    if (!order) return
    // Kept while the dialog animates out.
    setShown(order)
    setEvents(null)
    void api(`/api/orders/${order.id}`, eventsSchema).then((r) => {
      if (r.ok) setEvents(r.data.events)
    })
  }, [order])

  return (
    <Dialog
      open={order !== null}
      onOpenChange={(next) => !next && onClose()}
      title={shown ? ticketLabel(shown.ticketNo) : ''}
      wide
    >
      {shown && (
        <div className="grid gap-6 pt-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,16rem)]">
          <Ticket
            size="paper"
            className="border border-line"
            ticketNo={shown.ticketNo}
            where={whereLabel(shown, t)}
            takeaway={shown.takeaway}
            lines={boardLines(shown)}
            orderNote={shown.orderNote}
          />
          <section
            aria-label={t('timeline')}
            className="grid content-start gap-3"
          >
            <h3 className="font-medium">{t('timeline')}</h3>
            <ol className="grid">
              {events?.map((event, index) => (
                <li
                  key={event.seq}
                  style={stagger(index)}
                  className="rise relative grid gap-0.5 border-l-2 border-line pb-4 pl-5 last:pb-0"
                >
                  <span
                    aria-hidden
                    className="absolute top-1.5 -left-[7px] size-3 rounded-full bg-ink"
                  />
                  <span className="flex items-baseline justify-between gap-3">
                    <span className="font-medium">
                      {eventLabel(event.type)}
                    </span>
                    <span className="text-sm text-ink-soft tabular-nums">
                      {formatTime(event.at)}
                    </span>
                  </span>
                  {WITH_SUMMARY.has(event.type) && (
                    <span className="text-sm">{event.summary}</span>
                  )}
                  <span className="text-sm text-ink-soft">{who(event)}</span>
                </li>
              ))}
            </ol>
          </section>
        </div>
      )}
    </Dialog>
  )
}
