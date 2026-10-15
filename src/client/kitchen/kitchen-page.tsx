import { Check, ChefHat, PencilLine, ShieldAlert, WifiOff } from 'lucide-react'
import { useState } from 'react'
import type { BoardOrder } from '../../shared/board'
import { AppBar } from '../app-bar'
import { formatTime, useI18n } from '../i18n'
import { boardLines, whereLabel } from '../lib/board'
import { failureText, sendCommand } from '../lib/commands'
import { RequireRole } from '../lib/session'
import { STALE_AFTER_MS, useBoardSocket } from '../lib/use-board-socket'
import { useNow } from '../lib/use-now'
import { AllergyBlock, Ticket } from '../ticket'
import { Button } from '../ui/button'
import { Dialog } from '../ui/dialog'
import { useSnackbar } from '../ui/snackbar'

export function KitchenPage() {
  return (
    <RequireRole allow="kitchen">
      {(session) => <Kitchen device={session.label} />}
    </RequireRole>
  )
}

function Kitchen({ device }: { device: string }) {
  const { t } = useI18n()
  const { board, lastMessageAt, startedAt, serverOffsetMs } = useBoardSocket()
  const now = useNow(1000)
  const snackbar = useSnackbar()
  const [busy, setBusy] = useState<string | null>(null)
  const [confirming, setConfirming] = useState<BoardOrder | null>(null)
  const disconnected = now - (lastMessageAt ?? startedAt) > STALE_AFTER_MS

  async function run(
    order: BoardOrder,
    type: 'accept' | 'ready' | 'ackChange',
    allergyAcknowledged = false,
  ) {
    setBusy(order.id)
    const result = await sendCommand(order.id, {
      type,
      expectedVersion: order.version,
      ...(type === 'ready' ? {} : { allergyAcknowledged }),
    })
    setBusy(null)
    setConfirming(null)
    if (!result.ok) snackbar.show(failureText(result, t))
  }

  function accept(order: BoardOrder, kind: 'accept' | 'ackChange') {
    // Any allergy on the ticket must be read and confirmed before cooking.
    if (order.lines.some((line) => line.allergy)) setConfirming(order)
    else void run(order, kind)
  }

  const sections = [
    {
      title: t('laneNew'),
      orders: board?.orders.filter((o) => o.status === 'new') ?? [],
    },
    {
      title: t('lanePreparing'),
      orders: board?.orders.filter((o) => o.status === 'accepted') ?? [],
    },
  ]

  return (
    <div className="min-h-dvh bg-surface pb-10">
      <AppBar title={t('kitchenTitle')} device={device} />
      {disconnected && (
        <p
          role="alert"
          className="flex items-center gap-2 bg-ink px-4 py-3 text-[15px] font-semibold text-surface"
        >
          <WifiOff size={18} aria-hidden />
          {t('disconnected', {
            time: lastMessageAt ? formatTime(lastMessageAt) : '--:--',
          })}
        </p>
      )}
      <main className="mx-auto grid max-w-2xl gap-8 px-4 pt-6">
        {board && sections.every((s) => s.orders.length === 0) && (
          <p className="grid justify-items-center gap-3 py-20 text-center text-lg text-ink-soft">
            <ChefHat size={40} aria-hidden />
            {t('noTickets')}
          </p>
        )}
        {sections.map(
          (section) =>
            section.orders.length > 0 && (
              <section key={section.title} className="grid gap-4">
                <h2 className="flex items-center gap-3 text-xl font-medium">
                  {section.title}
                  <span className="grid size-8 place-items-center rounded-full bg-tonal text-sm font-semibold tabular-nums">
                    {section.orders.length}
                  </span>
                </h2>
                {section.orders.map((order) => {
                  const minutes = Math.floor(
                    Math.max(0, now + serverOffsetMs - order.createdAt) /
                      60_000,
                  )
                  return (
                    <div
                      key={order.id}
                      className="grid gap-0 overflow-hidden rounded-md bg-wash"
                    >
                      <Ticket
                        size="paper"
                        className="rounded-none bg-transparent"
                        ticketNo={order.ticketNo}
                        where={whereLabel(order, t)}
                        takeaway={order.takeaway}
                        lines={boardLines(order)}
                        orderNote={order.orderNote}
                        aside={
                          <span
                            className={`shrink-0 rounded-full px-3 py-1 text-sm tabular-nums ${minutes >= 12 ? 'bg-ink text-surface' : 'bg-tonal'}`}
                          >
                            {t('minutes', { min: minutes })}
                          </span>
                        }
                        banner={
                          order.changePending && (
                            <p className="mx-4 mb-2 flex items-center gap-2 rounded-sm bg-ink px-3 py-2 text-sm font-semibold text-surface">
                              <PencilLine size={16} aria-hidden />
                              {t('changePending')}
                            </p>
                          )
                        }
                      />
                      <div className="flex gap-3 px-4 pb-4">
                        {order.status === 'new' && (
                          <Button
                            className="flex-1"
                            size="lg"
                            disabled={busy === order.id}
                            onClick={() => accept(order, 'accept')}
                          >
                            {t('accept')}
                          </Button>
                        )}
                        {order.status === 'accepted' && order.changePending && (
                          <Button
                            className="flex-1"
                            size="lg"
                            disabled={busy === order.id}
                            onClick={() => accept(order, 'ackChange')}
                          >
                            {t('ackChange')}
                          </Button>
                        )}
                        {order.status === 'accepted' &&
                          !order.changePending && (
                            <Button
                              className="flex-1"
                              size="lg"
                              variant="tonal"
                              icon={<Check size={22} aria-hidden />}
                              disabled={busy === order.id}
                              onClick={() => void run(order, 'ready')}
                            >
                              {t('markReady')}
                            </Button>
                          )}
                      </div>
                    </div>
                  )
                })}
              </section>
            ),
        )}
      </main>

      <Dialog
        open={confirming !== null}
        onOpenChange={(open) => !open && setConfirming(null)}
        title={t('allergyConfirmTitle')}
        description={t('allergyConfirmBody')}
        footer={
          confirming && (
            <>
              <Button variant="text" onClick={() => setConfirming(null)}>
                {t('cancel')}
              </Button>
              <Button
                icon={<ShieldAlert size={20} aria-hidden />}
                disabled={busy === confirming.id}
                onClick={() =>
                  void run(
                    confirming,
                    confirming.status === 'new' ? 'accept' : 'ackChange',
                    true,
                  )
                }
              >
                {t('allergyConfirm')}
              </Button>
            </>
          )
        }
      >
        {confirming && (
          <AllergyBlock
            size="paper"
            items={confirming.lines
              .filter((line) => line.allergy)
              .map((line) => ({
                key: line.id,
                text: `${line.qty}× ${line.name}: ${line.allergy}`,
              }))}
          />
        )}
      </Dialog>
      {snackbar.node}
    </div>
  )
}
