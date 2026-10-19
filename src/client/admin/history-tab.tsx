import { Download, List, Sheet } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { z } from 'zod'
import type { BoardOrder } from '../../shared/board'
import {
  type History,
  type HistoryOrder,
  type HistoryStats,
  historySchema,
  MAX_EXPORT_DAYS,
} from '../../shared/history'
import { jakartaDate, ticketLabel } from '../../shared/order'
import { adminStaffListSchema } from '../../shared/staff'
import {
  type DictKey,
  formatIdr,
  formatMinutes,
  formatTime,
  useI18n,
} from '../i18n'
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

// The list or the spreadsheet-style table, remembered per browser.
const VIEW_KEY = 'kds_history_view'
const viewSchema = z.enum(['list', 'table'])
type View = z.infer<typeof viewSchema>

function storedView(): View {
  try {
    return viewSchema.catch('list').parse(localStorage.getItem(VIEW_KEY))
  } catch {
    return 'list'
  }
}

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
  const [view, setViewState] = useState(storedView)

  const setView = (next: View) => {
    setViewState(next)
    try {
      localStorage.setItem(VIEW_KEY, next)
    } catch {
      // Private mode: the choice just lasts for this visit.
    }
  }

  const load = useCallback(async () => {
    const r = await api(`/api/manager/history?day=${day}`, historySchema)
    if (r.ok) setHistory(r.data)
    else notify(t('networkError'))
  }, [day, notify, t])

  useEffect(() => {
    if (!day) return
    setHistory(null)
    void load()
  }, [day, load])

  useEffect(() => {
    void api('/api/manager/staff', adminStaffListSchema).then((r) => {
      if (r.ok) setStaffNames(new Map(r.data.staff.map((s) => [s.id, s.name])))
    })
  }, [])

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,20rem)] lg:items-start">
      <section
        aria-labelledby="history"
        className="grid content-start gap-6 lg:pt-5"
      >
        <div className="flex min-h-12 flex-wrap items-center justify-between gap-3">
          <h2 id="history" className="text-2xl font-medium">
            {t('historyTitle')}
          </h2>
          <label className="flex items-center gap-3 text-sm font-medium">
            <span className="max-sm:sr-only">{t('date')}</span>
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
        {history && history.orders.length > 0 && (
          <div className="flex min-h-12 flex-wrap items-center justify-between gap-3">
            <h3 className="flex items-center gap-3 text-xl font-medium">
              {t('statOrders')}
              <span className="grid h-8 min-w-8 place-items-center rounded-full bg-tonal px-2 text-sm font-semibold tabular-nums">
                {history.orders.length}
              </span>
            </h3>
            <ViewSwitch view={view} onChange={setView} />
          </div>
        )}
        {history && view === 'table' ? (
          history.orders.length > 0 && (
            <OrderTable orders={history.orders} onOpen={setOpen} />
          )
        ) : (
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
        )}
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
        s.avgReadyMinutes === null ? '–' : formatMinutes(s.avgReadyMinutes, t),
      ),
    },
    {
      label: t('statRevenue'),
      value: show((s) => formatIdr(s.revenueIdr)),
      wide: true,
    },
  ]
  // Columns follow the space the tiles get, not the window: the history tab
  // shares its row with the export card. Sales always get two columns.
  return (
    <div className="@container">
      <ul className="grid grid-cols-2 gap-3 @xl:grid-cols-3 @4xl:grid-cols-6">
        {tiles.map((tile, index) => (
          <li
            key={tile.label}
            style={stagger(index)}
            className={`rise grid content-between gap-2 rounded-md bg-wash p-4 ${tile.wide ? 'col-span-2' : ''}`}
          >
            <span className="text-sm text-ink-soft">{tile.label}</span>
            <span className="text-2xl font-medium tabular-nums wrap-anywhere">
              {tile.value}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function ViewSwitch({
  view,
  onChange,
}: {
  view: View
  onChange: (view: View) => void
}) {
  const { t } = useI18n()
  const options = [
    { value: 'list', label: t('viewList'), Icon: List },
    { value: 'table', label: t('viewTable'), Icon: Sheet },
  ] as const
  return (
    <fieldset>
      <legend className="sr-only">{t('view')}</legend>
      <div className="grid grid-cols-2 overflow-hidden rounded-full border border-ink-soft">
        {options.map(({ value, label, Icon }) => (
          <label
            key={value}
            className={`flex min-h-10 cursor-pointer items-center justify-center gap-2 border-ink-soft px-4 text-sm font-medium transition-colors duration-150 not-first:border-l has-focus-visible:outline-3 has-focus-visible:-outline-offset-4 has-focus-visible:outline-ink ${view === value ? 'bg-tonal' : ''}`}
          >
            <input
              type="radio"
              name="history-view"
              value={value}
              checked={view === value}
              onChange={() => onChange(value)}
              className="sr-only"
            />
            <Icon size={18} aria-hidden />
            {label}
          </label>
        ))}
      </div>
    </fieldset>
  )
}

/** The day as a spreadsheet: one row per order, times and totals in columns. */
function OrderTable({
  orders,
  onOpen,
}: {
  orders: HistoryOrder[]
  onOpen: (order: HistoryOrder) => void
}) {
  const { t } = useI18n()
  // Names only exist with staff PINs on; an empty column is just noise.
  const named = orders.some((o) => o.createdByName)
  const sales = orders
    .filter((o) => o.status !== 'cancelled')
    .reduce((sum, o) => sum + o.totalIdr, 0)
  const time = (at: number | null) => (at === null ? '–' : formatTime(at))
  const cell = 'border-b border-line px-3 py-2.5 whitespace-nowrap'
  // The ticket stays put while the rest scrolls sideways on narrow screens.
  const pinned = 'sticky left-0 bg-surface group-hover:bg-wash'
  // Money sits next to the status so it shows without scrolling; the long
  // item text goes last.
  const trailing = [
    t('colSent'),
    t('colReady'),
    t('colDone'),
    ...(named ? [t('colBy')] : []),
    t('colItems'),
  ]
  return (
    <div className="rise overflow-x-auto rounded-md border border-line bg-surface">
      <table className="w-full border-collapse text-left text-sm tabular-nums">
        <caption className="sr-only">{t('historyTitle')}</caption>
        <thead className="bg-wash text-ink-soft">
          <tr>
            <th
              scope="col"
              className={`${cell} sticky left-0 bg-wash font-medium`}
            >
              {t('colTicket')}
            </th>
            <th scope="col" className={`${cell} font-medium`}>
              {t('colWhere')}
            </th>
            <th scope="col" className={`${cell} font-medium`}>
              {t('colStatus')}
            </th>
            <th scope="col" className={`${cell} text-right font-medium`}>
              {t('total')}
            </th>
            {trailing.map((heading) => (
              <th key={heading} scope="col" className={`${cell} font-medium`}>
                {heading}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {orders.map((order) => {
            const cancelled = order.status === 'cancelled'
            const items = order.lines
              .map((l) => `${l.qty}× ${l.name}`)
              .join(', ')
            return (
              <tr
                key={order.id}
                className={`group transition-colors duration-150 hover:bg-wash ${cancelled ? 'text-ink-soft' : ''}`}
              >
                <td className={`${cell} ${pinned}`}>
                  <button
                    type="button"
                    onClick={() => onOpen(order)}
                    className="font-medium underline decoration-line underline-offset-4 hover:decoration-ink focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ink"
                  >
                    {ticketLabel(order.ticketNo)}
                  </button>
                </td>
                <td className={cell}>{whereLabel(order, t)}</td>
                <td className={cell}>{t(STATUS_KEY[order.status])}</td>
                <td
                  className={`${cell} text-right ${cancelled ? 'line-through' : ''}`}
                >
                  {formatIdr(order.totalIdr)}
                </td>
                <td className={cell}>{time(order.createdAt)}</td>
                <td className={cell}>{time(order.readyAt)}</td>
                <td className={cell}>
                  {time(order.servedAt ?? order.cancelledAt)}
                </td>
                {named && (
                  <td className={cell}>{order.createdByName ?? '–'}</td>
                )}
                <td className={cell}>
                  <span className="block max-w-72 truncate" title={items}>
                    {items || '–'}
                  </span>
                </td>
              </tr>
            )
          })}
        </tbody>
        <tfoot>
          <tr className="font-semibold">
            <th
              scope="row"
              colSpan={3}
              className="sticky left-0 bg-surface px-3 py-2.5"
            >
              {t('statRevenue')}
            </th>
            <td className="px-3 py-2.5 text-right whitespace-nowrap">
              {formatIdr(sales)}
            </td>
            <td colSpan={trailing.length} />
          </tr>
        </tfoot>
      </table>
    </div>
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
        <h2 className="flex min-h-12 items-center text-2xl font-medium">
          {t('exportTitle')}
        </h2>
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
