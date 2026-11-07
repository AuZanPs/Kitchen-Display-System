import { Ban, Check, ExternalLink } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { z } from 'zod'
import {
  type BoardMessage,
  type BoardOrder,
  isFinished,
} from '../../shared/board'
import { type Device, PAIR_ROLES, type PairRole } from '../../shared/devices'
import { type HistoryStats, historySchema } from '../../shared/history'
import { LIMITS, ticketLabel } from '../../shared/order'
import { type DictKey, formatDay, formatMinutes, useI18n } from '../i18n'
import { api } from '../lib/api'
import { minutesSince, whereLabel } from '../lib/board'
import { failureText, sendCommand } from '../lib/commands'
import { HOME_BY_ROLE } from '../lib/session'
import { stagger } from '../lib/stagger'
import { useNow } from '../lib/use-now'
import { Button } from '../ui/button'
import { Card } from '../ui/card'
import { Dialog } from '../ui/dialog'
import { TextField } from '../ui/text-field'
import { StatTiles } from './history-tab'
import { ROLE_ICON, roleName, STATUS_KEY } from './shared'

const ONBOARD_DISMISSED_KEY = 'kds_onboard_dismissed'
const ONBOARD_STEPS_KEY = 'kds_onboard_steps'

export function OverviewTab({
  board,
  devices,
  notify,
  onManageDevices,
  onOpenTab,
}: {
  board: BoardMessage | null
  devices: Device[] | null
  notify: (text: string) => void
  onManageDevices: () => void
  onOpenTab: (tab: 'menu' | 'staff' | 'devices') => void
}) {
  const { t } = useI18n()
  return (
    <div className="grid gap-8">
      <OnboardingCard board={board} devices={devices} onOpenTab={onOpenTab} />
      <Today board={board} />
      <section aria-labelledby="screens" className="grid gap-4">
        <h2 id="screens" className="text-2xl font-medium">
          {t('screens')}
        </h2>
        <ul className="grid gap-3 sm:grid-cols-3">
          {PAIR_ROLES.map((role, index) => (
            <ScreenTile
              key={role}
              index={index}
              role={role}
              devices={devices}
              onManage={onManageDevices}
            />
          ))}
        </ul>
      </section>

      <ServiceDay board={board} notify={notify} />
      <ActiveOrders board={board} notify={notify} />
    </div>
  )
}

function OnboardingCard({
  board,
  devices,
  onOpenTab,
}: {
  board: BoardMessage | null
  devices: Device[] | null
  onOpenTab: (tab: 'menu' | 'staff' | 'devices') => void
}) {
  const { t } = useI18n()
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem(ONBOARD_DISMISSED_KEY) === '1'
    } catch {
      return false
    }
  })
  const [visited, setVisited] = useState<{ menu?: boolean; staff?: boolean }>(
    () => {
      try {
        const raw = localStorage.getItem(ONBOARD_STEPS_KEY)
        return raw
          ? (JSON.parse(raw) as { menu?: boolean; staff?: boolean })
          : {}
      } catch {
        return {}
      }
    },
  )

  if (dismissed) return null

  const activeDevices = devices?.filter((d) => d.revokedAt === null).length ?? 0
  const menuDone = Boolean((board?.menuVersion ?? 1) > 1 || visited.menu)
  const staffDone = Boolean(board?.settings.staffPins || visited.staff)
  const devicesDone = activeDevices > 0

  const steps: {
    id: 'menu' | 'staff' | 'devices'
    done: boolean
    title: DictKey
    body: DictKey
    action: DictKey
  }[] = [
    {
      id: 'menu',
      done: menuDone,
      title: 'onboardStep1Title',
      body: 'onboardStep1Body',
      action: 'onboardStep1Action',
    },
    {
      id: 'staff',
      done: staffDone,
      title: 'onboardStep2Title',
      body: 'onboardStep2Body',
      action: 'onboardStep2Action',
    },
    {
      id: 'devices',
      done: devicesDone,
      title: 'onboardStep3Title',
      body: 'onboardStep3Body',
      action: 'onboardStep3Action',
    },
  ]

  const doneCount = steps.filter((s) => s.done).length

  function openStep(tab: 'menu' | 'staff' | 'devices') {
    if (tab === 'menu' || tab === 'staff') {
      const next = { ...visited, [tab]: true }
      setVisited(next)
      try {
        localStorage.setItem(ONBOARD_STEPS_KEY, JSON.stringify(next))
      } catch {
        // Storage unavailable
      }
    }
    onOpenTab(tab)
  }

  function dismiss() {
    setDismissed(true)
    try {
      localStorage.setItem(ONBOARD_DISMISSED_KEY, '1')
    } catch {
      // Storage unavailable
    }
  }

  return (
    <section
      aria-labelledby="onboard-title"
      className="rise grid gap-5 rounded-lg bg-wash p-5 sm:p-6"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="grid gap-1.5">
          <div className="flex flex-wrap items-center gap-3">
            <span className="rounded-full bg-tonal px-3 py-1 text-xs font-semibold tabular-nums">
              {t('onboardBadge', { done: doneCount, total: steps.length })}
            </span>
            <div aria-hidden className="flex w-20 items-center gap-1">
              {steps.map((s) => (
                <span
                  key={s.id}
                  className={`h-1.5 flex-1 rounded-full transition-colors ${
                    s.done ? 'bg-ink' : 'bg-tonal'
                  }`}
                />
              ))}
            </div>
          </div>
          <h2 id="onboard-title" className="text-xl font-medium sm:text-2xl">
            {t('onboardTitle')}
          </h2>
          <p className="text-sm text-ink-soft">{t('onboardLead')}</p>
        </div>
        <Button variant="text" onClick={dismiss}>
          {t('onboardDismiss')}
        </Button>
      </div>

      <ol className="grid gap-3 sm:grid-cols-3">
        {steps.map((step, index) => (
          <li
            key={step.id}
            style={stagger(index)}
            className="rise grid content-between gap-4 rounded-md bg-surface p-4"
          >
            <div className="grid gap-2.5">
              <div className="flex items-center gap-2.5">
                <span
                  aria-hidden
                  className={`grid size-7 shrink-0 place-items-center rounded-full text-xs font-semibold tabular-nums ${
                    step.done ? 'bg-ink text-surface' : 'bg-tonal text-ink'
                  }`}
                >
                  {step.done ? (
                    <Check size={15} strokeWidth={2.75} />
                  ) : (
                    index + 1
                  )}
                </span>
                <span className="text-[15px] font-medium">{t(step.title)}</span>
              </div>
              <p className="text-[13px] leading-relaxed text-ink-soft">
                {t(step.body)}
              </p>
            </div>
            <Button
              variant={step.done ? 'outlined' : 'tonal'}
              className="w-fit"
              onClick={() => openStep(step.id)}
            >
              {t(step.action)}
            </Button>
          </li>
        ))}
      </ol>
    </section>
  )
}

/** The newest moment of an order that today's numbers count. */
function lastCounted(order: BoardOrder) {
  return Math.max(
    order.createdAt,
    order.readyAt ?? 0,
    order.servedAt ?? 0,
    order.cancelledAt ?? 0,
  )
}

/** Today's numbers; refetched when an order is sent, ready, served or cancelled. */
function Today({ board }: { board: BoardMessage | null }) {
  const { t } = useI18n()
  const [stats, setStats] = useState<HistoryStats | null>(null)
  // Accepting an order, TV receipts and orders leaving the board move the
  // board without changing the numbers, so only a newer moment refetches.
  const latest = Math.max(0, ...(board?.orders.map(lastCounted) ?? []))
  const fetchedUpTo = useRef(-1)

  useEffect(() => {
    if (latest <= fetchedUpTo.current) return
    fetchedUpTo.current = latest
    void api('/api/manager/history', historySchema).then((r) => {
      if (r.ok) setStats(r.data.stats)
    })
  }, [latest])

  return (
    <section aria-labelledby="today" className="grid gap-4">
      <h2 id="today" className="text-2xl font-medium">
        {t('todayStats')}
      </h2>
      <StatTiles stats={stats} />
    </section>
  )
}

function ScreenTile({
  index,
  role,
  devices,
  onManage,
}: {
  index: number
  role: PairRole
  devices: Device[] | null
  onManage: () => void
}) {
  const { t } = useI18n()
  const Icon = ROLE_ICON[role]
  const paired =
    devices?.filter((d) => d.role === role && d.revokedAt === null) ?? []
  const online = paired.filter((d) => d.online).length
  return (
    <li
      className="rise grid content-between gap-4 rounded-md bg-wash p-5"
      style={stagger(index)}
    >
      <div className="flex items-start gap-3">
        <span className="grid size-11 place-items-center rounded-sm bg-tonal">
          <Icon size={22} aria-hidden />
        </span>
        <div className="grid">
          <span className="text-lg font-medium">{roleName(role, t)}</span>
          {devices && (
            <span className="flex items-center gap-2 text-sm">
              <span
                aria-hidden
                className={`size-2 rounded-full ${online > 0 ? 'bg-ink' : 'border border-ink'}`}
              />
              {paired.length === 0
                ? t('notPaired')
                : t('onlineCount', { online, total: paired.length })}
            </span>
          )}
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {paired.length === 0 ? (
          <Button variant="tonal" onClick={onManage}>
            {t('pairDevice')}
          </Button>
        ) : (
          <a
            href={HOME_BY_ROLE[role]}
            target="_blank"
            rel="noopener"
            className="state inline-flex min-h-12 items-center gap-2 rounded-full border border-ink-soft px-5 text-[15px] font-semibold"
          >
            {t('openScreen')}
            <ExternalLink size={16} aria-hidden />
          </a>
        )}
      </div>
    </li>
  )
}

function ServiceDay({
  board,
  notify,
}: {
  board: BoardMessage | null
  notify: (text: string) => void
}) {
  const { t, lang } = useI18n()
  const [needsForce, setNeedsForce] = useState(false)

  async function change(path: 'open' | 'close', force = false) {
    const result = await api(`/api/manager/service-day/${path}`, z.unknown(), {
      body: path === 'close' ? { force } : {},
    })
    if (!result.ok && result.status === 422) {
      setNeedsForce(true)
      notify(t('activeOrdersLeft'))
      return
    }
    if (!result.ok) notify(t('networkError'))
    setNeedsForce(false)
  }

  return (
    <Card className="flex flex-wrap items-center gap-x-6 gap-y-4">
      <div className="mr-auto grid gap-1">
        <h2 className="text-xl font-medium">{t('serviceDay')}</h2>
        {board && (
          <p className="flex items-center gap-2.5">
            <span
              aria-hidden
              className={`size-2.5 rounded-full ${board.serviceOpen ? 'bg-ink' : 'border-2 border-ink'}`}
            />
            {board.serviceOpen
              ? t('serviceOpen', { day: formatDay(board.serviceDay, lang) })
              : t('serviceClosed')}
          </p>
        )}
      </div>
      {board?.serviceOpen ? (
        <div className="flex flex-wrap gap-2">
          <Button variant="outlined" onClick={() => void change('close')}>
            {t('closeDay')}
          </Button>
          {needsForce && (
            <Button onClick={() => void change('close', true)}>
              {t('forceClose')}
            </Button>
          )}
        </div>
      ) : (
        <Button onClick={() => void change('open')}>{t('openDay')}</Button>
      )}
    </Card>
  )
}

function ActiveOrders({
  board,
  notify,
}: {
  board: BoardMessage | null
  notify: (text: string) => void
}) {
  const { t } = useI18n()
  const now = useNow(30_000)
  const [target, setTarget] = useState<BoardOrder | null>(null)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const active = (board?.orders ?? []).filter((o) => !isFinished(o.status))

  async function cancel(order: BoardOrder) {
    setBusy(true)
    const result = await sendCommand(order.id, {
      type: 'managerCancel',
      expectedVersion: order.version,
      reason: reason.trim(),
    })
    setBusy(false)
    if (!result.ok) {
      notify(failureText(result, t))
      return
    }
    notify(t('orderCancelled', { ticket: ticketLabel(order.ticketNo) }))
    setTarget(null)
    setReason('')
  }

  return (
    <section aria-labelledby="active" className="grid gap-4">
      <h2 id="active" className="flex items-center gap-3 text-2xl font-medium">
        {t('today')}
        <span className="grid h-8 min-w-8 place-items-center rounded-full bg-tonal px-2 text-sm font-semibold tabular-nums">
          {active.length}
        </span>
      </h2>
      {board && active.length === 0 && (
        <p className="text-ink-soft">{t('noActive')}</p>
      )}
      <ul className="grid gap-2">
        {active.map((order, index) => {
          const minutes = minutesSince(order.createdAt, now)
          const items = order.lines.map((l) => `${l.qty}× ${l.name}`).join(', ')
          return (
            <li
              key={order.id}
              style={stagger(index)}
              className="rise flex flex-wrap items-center gap-x-4 gap-y-2 rounded-md bg-wash px-5 py-3"
            >
              <div className="mr-auto grid min-w-0">
                <span className="font-medium">
                  {whereLabel(order, t)}{' '}
                  <span className="text-sm font-normal text-ink-soft tabular-nums">
                    {ticketLabel(order.ticketNo)} · {formatMinutes(minutes, t)}
                  </span>
                </span>
                <span className="text-sm text-ink-soft break-words">
                  {items || '—'}
                </span>
              </div>
              <span className="rounded-full bg-tonal px-3 py-1 text-sm">
                {t(STATUS_KEY[order.status])}
              </span>
              <Button
                variant="text"
                icon={<Ban size={18} aria-hidden />}
                onClick={() => setTarget(order)}
              >
                {t('cancelOrder')}
              </Button>
            </li>
          )
        })}
      </ul>

      <Dialog
        open={target !== null}
        onOpenChange={(open) => {
          if (!open) {
            setTarget(null)
            setReason('')
          }
        }}
        title={
          target
            ? `${t('cancelOrder')} ${ticketLabel(target.ticketNo)}`
            : t('cancelOrder')
        }
        description={t('cancelHint')}
        footer={
          <>
            <Button variant="text" onClick={() => setTarget(null)}>
              {t('cancel')}
            </Button>
            <Button
              disabled={
                busy ||
                reason.trim() === '' ||
                reason.trim().length > LIMITS.reason
              }
              onClick={() => target && void cancel(target)}
            >
              {t('cancelOrder')}
            </Button>
          </>
        }
      >
        <TextField
          label={t('cancelReason')}
          name="cancel-reason"
          autoComplete="off"
          max={LIMITS.reason}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      </Dialog>
    </section>
  )
}
