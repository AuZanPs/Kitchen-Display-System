import { Check, CircleAlert, MonitorOff } from 'lucide-react'
import { useState } from 'react'
import type { BoardMessage, BoardOrder } from '../../shared/board'
import { ticketLabel } from '../../shared/order'
import { type DictKey, useI18n } from '../i18n'
import { whereLabel } from '../lib/board'
import { failureText, sendCommand } from '../lib/commands'
import { stagger } from '../lib/stagger'
import { Button } from '../ui/button'
import type { Draft } from './draft'

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
  serverNow,
  unsent,
  onOpenUnsent,
  notify,
}: {
  board: BoardMessage | null
  serverNow: number
  unsent: Draft | null
  onOpenUnsent: () => void
  notify: (text: string) => void
}) {
  const { t } = useI18n()
  const [busy, setBusy] = useState<string | null>(null)
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
          const minutes = Math.floor(
            Math.max(0, serverNow - order.createdAt) / 60_000,
          )
          const closed =
            order.status === 'served' || order.status === 'cancelled'
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
                    {ticketLabel(order.ticketNo)} ·{' '}
                    {t('minutes', { min: minutes })}
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
            </li>
          )
        })}
      </ul>
    </main>
  )
}
