import { Trash2 } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { z } from 'zod'
import {
  type History,
  type HistoryOrder,
  historySchema,
} from '../../shared/history'
import { jakartaDate, ticketLabel } from '../../shared/order'
import { formatDay, formatIdr, formatTime, useI18n } from '../i18n'
import { api } from '../lib/api'
import { whereLabel } from '../lib/board'
import { failureText } from '../lib/commands'
import { stagger } from '../lib/stagger'
import { Button, IconButton } from '../ui/button'
import { Card } from '../ui/card'
import { Dialog } from '../ui/dialog'
import { TextField } from '../ui/text-field'

const deletedSchema = z.object({ deleted: z.number().int() })
const deleteHistory = (body: { day: string; orderId?: string }) =>
  api('/api/manager/history/delete', deletedSchema, { body })

/**
 * Deletes finished orders, one at a time or a whole day. It lives in the
 * settings, away from the everyday history.
 */
export function HistoryDeleteCard({
  notify,
}: {
  notify: (text: string) => void
}) {
  const { t } = useI18n()
  const [day, setDay] = useState(() => jakartaDate(Date.now()))
  const [history, setHistory] = useState<History | null>(null)
  const [target, setTarget] = useState<HistoryOrder | null>(null)
  const [wholeDay, setWholeDay] = useState(false)

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

  // Orders still in progress are cancelled from the overview first.
  const done =
    history?.orders.filter(
      (o) => o.status === 'served' || o.status === 'cancelled',
    ) ?? []
  const active = (history?.orders.length ?? 0) - done.length

  const deleted = (count: number) => {
    notify(t('ordersDeleted', { count }))
    setTarget(null)
    setWholeDay(false)
    void load()
  }

  return (
    <Card className="grid gap-4">
      <div className="grid gap-1">
        <h2 className="text-2xl font-medium">{t('historyDeleteTitle')}</h2>
        <p className="text-[15px] text-ink-soft">{t('historyDeleteHint')}</p>
      </div>
      <label className="flex items-center gap-3 text-sm font-medium">
        {t('date')}
        <input
          type="date"
          value={day}
          max={jakartaDate(Date.now())}
          onChange={(e) => setDay(e.target.value)}
          className="h-12 rounded-sm border border-ink-soft bg-surface px-3 text-base outline-none focus:border-ink focus:shadow-[inset_0_0_0_1px_var(--color-ink)]"
        />
      </label>

      {history && done.length === 0 && (
        <p className="text-ink-soft">{t('noFinishedDay')}</p>
      )}
      {done.length > 0 && (
        <ul className="grid divide-y divide-line">
          {done.map((order, index) => {
            const cancelled = order.status === 'cancelled'
            return (
              <li
                key={order.id}
                style={stagger(index)}
                className="rise grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-x-3 py-2"
              >
                <span className="grid min-w-0">
                  <span className="break-words">
                    <span className="font-medium tabular-nums">
                      {ticketLabel(order.ticketNo)}
                    </span>{' '}
                    {whereLabel(order, t)}
                  </span>
                  <span className="text-sm text-ink-soft">
                    {formatTime(order.createdAt)} ·{' '}
                    {t(cancelled ? 'cancelled' : 'served')}
                  </span>
                </span>
                <span
                  className={`text-sm tabular-nums ${cancelled ? 'text-ink-soft line-through' : ''}`}
                >
                  {formatIdr(order.totalIdr)}
                </span>
                <IconButton
                  label={t('deleteOrderLabel', {
                    ticket: ticketLabel(order.ticketNo),
                  })}
                  onClick={() => setTarget(order)}
                >
                  <Trash2 size={20} aria-hidden />
                </IconButton>
              </li>
            )
          })}
        </ul>
      )}
      {active > 0 && (
        <p className="text-sm text-ink-soft">{t('deleteActiveHint')}</p>
      )}
      {done.length > 0 && (
        <Button
          variant="outlined"
          icon={<Trash2 size={18} aria-hidden />}
          onClick={() => setWholeDay(true)}
          className="justify-self-start"
        >
          {t('deleteAll', { count: done.length })}
        </Button>
      )}

      <DeleteOrderDialog
        order={target}
        day={day}
        onClose={() => setTarget(null)}
        onDeleted={deleted}
      />
      <DeleteDayDialog
        open={wholeDay}
        day={day}
        count={done.length}
        keeps={active > 0}
        onClose={() => setWholeDay(false)}
        onDeleted={deleted}
      />
    </Card>
  )
}

function DeleteOrderDialog({
  order,
  day,
  onClose,
  onDeleted,
}: {
  order: HistoryOrder | null
  day: string
  onClose: () => void
  onDeleted: (count: number) => void
}) {
  const { t } = useI18n()
  // Kept while the dialog animates out.
  const [shown, setShown] = useState<HistoryOrder | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!order) return
    setShown(order)
    setError(null)
  }, [order])

  async function remove() {
    if (!shown) return
    setBusy(true)
    const result = await deleteHistory({ day, orderId: shown.id })
    setBusy(false)
    if (!result.ok) return setError(failureText(result, t))
    onDeleted(result.data.deleted)
  }

  return (
    <Dialog
      open={order !== null}
      onOpenChange={(next) => !next && onClose()}
      title={t('deleteOrderTitle', {
        ticket: shown ? ticketLabel(shown.ticketNo) : '',
      })}
      description={t('deleteOrderBody')}
      footer={
        <>
          <Button variant="text" onClick={onClose}>
            {t('cancel')}
          </Button>
          <Button
            disabled={busy}
            icon={<Trash2 size={18} aria-hidden />}
            onClick={() => void remove()}
          >
            {t('delete')}
          </Button>
        </>
      }
    >
      {error && (
        <p role="alert" className="pt-2 font-semibold">
          {error}
        </p>
      )}
    </Dialog>
  )
}

function DeleteDayDialog({
  open,
  day,
  count,
  keeps,
  onClose,
  onDeleted,
}: {
  open: boolean
  day: string
  count: number
  keeps: boolean
  onClose: () => void
  onDeleted: (count: number) => void
}) {
  const { t, lang } = useI18n()
  const [typed, setTyped] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const word = t('confirmWord')
  const ready = typed.trim().toUpperCase() === word && !busy

  const close = () => {
    setTyped('')
    setError(null)
    onClose()
  }

  async function remove() {
    if (!ready) return
    setBusy(true)
    const result = await deleteHistory({ day })
    setBusy(false)
    if (!result.ok) return setError(failureText(result, t))
    setTyped('')
    onDeleted(result.data.deleted)
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => !next && close()}
      title={t('deleteDayTitle', { date: formatDay(day, lang) })}
      description={
        keeps
          ? `${t('deleteDayBody', { count })} ${t('deleteDayKeeps')}`
          : t('deleteDayBody', { count })
      }
      footer={
        <>
          <Button variant="text" onClick={close}>
            {t('cancel')}
          </Button>
          <Button
            type="submit"
            form="delete-day"
            disabled={!ready}
            icon={<Trash2 size={18} aria-hidden />}
          >
            {t('delete')}
          </Button>
        </>
      }
    >
      <form
        id="delete-day"
        noValidate
        className="pt-2"
        onSubmit={(event) => {
          event.preventDefault()
          void remove()
        }}
      >
        <TextField
          label={t('typeToConfirm', { word })}
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          value={typed}
          onChange={(e) => {
            setTyped(e.target.value)
            setError(null)
          }}
          error={error}
        />
      </form>
    </Dialog>
  )
}
