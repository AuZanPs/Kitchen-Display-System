import {
  ArrowRightLeft,
  Ban,
  Check,
  CircleAlert,
  ListPlus,
  MonitorOff,
} from 'lucide-react'
import { useState } from 'react'
import {
  type BoardMessage,
  type BoardOrder,
  isFinished,
} from '../../shared/board'
import type { Table } from '../../shared/menu'
import { LIMITS, ticketLabel } from '../../shared/order'
import { type DictKey, formatMinutes, useI18n } from '../i18n'
import { minutesSince, whereLabel } from '../lib/board'
import { failureText, sendCommand } from '../lib/commands'
import { stagger } from '../lib/stagger'
import { Button } from '../ui/button'
import { Dialog } from '../ui/dialog'
import { TextField } from '../ui/text-field'
import type { Draft } from './draft'
import { TableGrid } from './table-grid'

const STEPS: DictKey[] = ['saved', 'onTv', 'accepted', 'ready']

/** How far the order got: 1 saved, 2 on TV, 3 accepted, 4 ready, 5 served. */
function progress(order: BoardOrder) {
  if (order.status === 'served') return 5
  if (order.status === 'ready') return 4
  if (order.status === 'accepted') return 3
  return order.shownOnTv ? 2 : 1
}

function statusText(order: BoardOrder, tvCount: number): DictKey {
  if (order.status === 'cancelled') return 'cancelled'
  if (order.status === 'served') return 'served'
  if (order.status === 'ready') return 'ready'
  if (order.status === 'accepted') return 'accepted'
  if (order.shownOnTv) return 'onTv'
  return tvCount === 0 ? 'waitingScreen' : 'saved'
}

export function ServiceList({
  board,
  tables,
  serverNow,
  unsent,
  onOpenUnsent,
  onAddItems,
  notify,
}: {
  board: BoardMessage | null
  tables: Table[] | null
  serverNow: number
  unsent: Draft | null
  onOpenUnsent: () => void
  onAddItems: (order: BoardOrder) => void
  notify: (text: string) => void
}) {
  const { t } = useI18n()
  const [busy, setBusy] = useState<string | null>(null)
  const [moving, setMoving] = useState<BoardOrder | null>(null)
  const [cancelling, setCancelling] = useState<BoardOrder | null>(null)
  const [reason, setReason] = useState('')
  // Commands always target the version on the live board, not a stale copy.
  const live = (order: BoardOrder) =>
    board?.orders.find((o) => o.id === order.id) ?? order
  // Ready food first, then newest: the tray waiting on the pass matters most.
  const orders = [...(board?.orders ?? [])].sort(
    (a, b) =>
      Number(b.status === 'ready') - Number(a.status === 'ready') ||
      b.createdAt - a.createdAt,
  )

  async function serve(order: BoardOrder) {
    setBusy(order.id)
    const result = await sendCommand(order.id, {
      type: 'serve',
      expectedVersion: order.version,
    })
    setBusy(null)
    if (!result.ok) notify(failureText(result, t))
  }

  async function move(order: BoardOrder, table: Table) {
    setMoving(null)
    const current = live(order)
    if (current.table === table.label && !current.takeaway) return
    const result = await sendCommand(order.id, {
      type: 'moveTable',
      expectedVersion: current.version,
      tableId: table.id,
    })
    notify(
      result.ok
        ? t('moved', {
            ticket: ticketLabel(order.ticketNo),
            table: table.label,
          })
        : failureText(result, t),
    )
  }

  async function requestCancel(order: BoardOrder) {
    setBusy(order.id)
    const result = await sendCommand(order.id, {
      type: 'requestCancel',
      expectedVersion: live(order).version,
      reason: reason.trim(),
    })
    setBusy(null)
    if (!result.ok) return notify(failureText(result, t))
    setCancelling(null)
    notify(t('cancelRequestSent', { ticket: ticketLabel(order.ticketNo) }))
  }

  return (
    <main className="mx-auto grid max-w-4xl gap-4 px-4 pt-6 sm:px-6">
      {unsent && (
        <section
          role="alert"
          className="flex flex-wrap items-center gap-4 rounded-md border-2 border-ink px-5 py-4"
        >
          <CircleAlert size={24} aria-hidden />
          <div className="mr-auto grid">
            <strong>{t('notSent')}</strong>
            <span className="text-sm text-ink-soft">{t('draft')}</span>
          </div>
          <Button onClick={onOpenUnsent}>{t('openUnsent')}</Button>
        </section>
      )}
      {board && orders.length === 0 && (
        <p className="py-16 text-center text-lg text-ink-soft">
          {t('noActive')}
        </p>
      )}
      <ul className="grid gap-3">
        {orders.map((order, index) => {
          const step = progress(order)
          const text = statusText(order, board?.tvCount ?? 0)
          const minutes = minutesSince(order.createdAt, serverNow)
          const closed = isFinished(order.status)
          const editable = !closed && !order.cancelRequested
          return (
            <li
              key={order.id}
              style={stagger(index)}
              className={`rise grid gap-4 rounded-md p-5 ${order.status === 'ready' ? 'bg-tonal' : closed ? 'border border-line' : 'bg-wash'}`}
            >
              <div className="flex flex-wrap items-start gap-x-4 gap-y-1">
                <div className="mr-auto grid">
                  <span className="text-2xl font-medium">
                    {whereLabel(order, t)}
                  </span>
                  <span className="text-sm text-ink-soft tabular-nums">
                    {ticketLabel(order.ticketNo)} · {formatMinutes(minutes, t)}
                  </span>
                </div>
                <span
                  role="status"
                  className={`flex min-h-9 items-center gap-2 self-center rounded-full px-4 text-sm font-medium ${order.status === 'ready' ? 'bg-surface' : 'bg-tonal'}`}
                >
                  {text === 'waitingScreen' && (
                    <MonitorOff size={16} aria-hidden />
                  )}
                  {t(text)}
                </span>
                {order.changePending && !closed && (
                  <span className="flex min-h-9 items-center self-center rounded-full border border-ink-soft px-4 text-sm font-medium">
                    {t('changePending')}
                  </span>
                )}
                {order.status === 'ready' && (
                  <Button
                    size="lg"
                    icon={<Check size={20} aria-hidden />}
                    disabled={busy === order.id}
                    onClick={() => void serve(order)}
                  >
                    {t('markServed')}
                  </Button>
                )}
              </div>

              {order.status !== 'cancelled' && (
                <ol className="grid grid-cols-4 gap-1.5" aria-label={t(text)}>
                  {STEPS.map((key, i) => (
                    <li key={key} className="grid gap-1.5">
                      <span
                        className={`h-1.5 rounded-full transition-colors duration-300 ${i < step ? 'bg-ink' : 'bg-line'}`}
                        aria-hidden
                      />
                      <span
                        className={`text-[12px] leading-tight ${i < step ? 'font-semibold' : 'text-ink-soft'}`}
                      >
                        {t(key)}
                      </span>
                    </li>
                  ))}
                </ol>
              )}

              {text === 'waitingScreen' && (
                <p className="rounded-sm bg-ink px-4 py-2.5 text-sm font-semibold text-surface">
                  {t('tellKitchen')}
                </p>
              )}

              {order.cancelRequested && !closed && (
                <p className="flex items-center gap-2 rounded-sm border-2 border-ink px-4 py-2.5 text-sm font-semibold">
                  <Ban size={16} aria-hidden />
                  {t('cancelPending')}
                </p>
              )}

              {editable && (
                <div className="-mx-3 -mb-2 flex flex-wrap gap-1 border-t border-line pt-2">
                  <Button
                    variant="text"
                    icon={<ListPlus size={18} aria-hidden />}
                    onClick={() => onAddItems(order)}
                  >
                    {t('addItems')}
                  </Button>
                  <Button
                    variant="text"
                    icon={<ArrowRightLeft size={18} aria-hidden />}
                    onClick={() => setMoving(order)}
                  >
                    {t('moveTable')}
                  </Button>
                  <Button
                    variant="text"
                    icon={<Ban size={18} aria-hidden />}
                    onClick={() => {
                      setReason('')
                      setCancelling(order)
                    }}
                  >
                    {t('cancelOrder')}
                  </Button>
                </div>
              )}
            </li>
          )
        })}
      </ul>

      <Dialog
        open={moving !== null}
        onOpenChange={(open) => !open && setMoving(null)}
        title={
          moving
            ? `${t('moveTable')} · ${ticketLabel(moving.ticketNo)}`
            : t('moveTable')
        }
      >
        <TableGrid
          tables={tables}
          isCurrent={(table) =>
            moving !== null && !moving.takeaway && moving.table === table.label
          }
          onPick={(table) => moving && void move(moving, table)}
        />
      </Dialog>

      <Dialog
        open={cancelling !== null}
        onOpenChange={(open) => !open && setCancelling(null)}
        title={
          cancelling
            ? `${t('cancelOrder')} · ${ticketLabel(cancelling.ticketNo)}`
            : t('cancelOrder')
        }
        description={t('cancelRequestHint')}
        footer={
          <>
            <Button variant="text" onClick={() => setCancelling(null)}>
              {t('cancel')}
            </Button>
            <Button
              icon={<Ban size={18} aria-hidden />}
              disabled={
                reason.trim() === '' ||
                reason.length > LIMITS.reason ||
                busy === cancelling?.id
              }
              onClick={() => cancelling && void requestCancel(cancelling)}
            >
              {t('requestCancel')}
            </Button>
          </>
        }
      >
        <TextField
          label={t('cancelReason')}
          max={LIMITS.reason}
          autoComplete="off"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      </Dialog>
    </main>
  )
}
