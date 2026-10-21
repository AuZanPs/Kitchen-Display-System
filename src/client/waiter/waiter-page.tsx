import { ClipboardList, ConciergeBell, WifiOff } from 'lucide-react'
import { useEffect, useState } from 'react'
import { DEFAULT_SETTINGS, isFinished } from '../../shared/board'
import {
  type MenuItem,
  menuSchema,
  type Table,
  tablesSchema,
} from '../../shared/menu'
import { AppBar } from '../app-bar'
import { formatTime, useI18n } from '../i18n'
import { api } from '../lib/api'
import { RequireRole, type Session } from '../lib/session'
import { STALE_AFTER_MS, useBoardSocket } from '../lib/use-board-socket'
import { useNow } from '../lib/use-now'
import { StaffChip, StaffSignIn } from '../staff-sign-in'
import { Button } from '../ui/button'
import { useSnackbar } from '../ui/snackbar'
import { Composer } from './composer'
import { useDraft } from './draft'
import { ServiceList } from './service-list'

type Tab = 'order' | 'service'

export function WaiterPage() {
  return (
    <RequireRole allow="waiter">
      {(session, refresh) => <Waiter session={session} refresh={refresh} />}
    </RequireRole>
  )
}

function Waiter({
  session,
  refresh,
}: {
  session: Session
  refresh: () => void
}) {
  const device = session.label
  const { t } = useI18n()
  const [tab, setTab] = useState<Tab>('order')
  const [menu, setMenu] = useState<MenuItem[] | null>(null)
  const [tables, setTables] = useState<Table[] | null>(null)
  const [loadFailed, setLoadFailed] = useState(false)
  const [loadAttempt, setLoadAttempt] = useState(0)
  const drafts = useDraft()
  // Items added to a sent ticket: a separate draft, kept in memory only.
  const extra = useDraft(null)
  const [targetId, setTargetId] = useState<string | null>(null)
  // A draft whose send was never confirmed reopens its review after a reload.
  const [reviewOpen, setReviewOpen] = useState(drafts.draft.attempted)
  const socket = useBoardSocket()
  const now = useNow(1000)
  const snackbar = useSnackbar()
  const disconnected =
    now - (socket.lastMessageAt ?? socket.startedAt) > STALE_AFTER_MS

  // Reloads on retry and whenever the admin edits the menu or tables.
  const menuVersion = socket.board?.menuVersion
  // biome-ignore lint/correctness/useExhaustiveDependencies: both values only trigger a reload
  useEffect(() => {
    setLoadFailed(false)
    void Promise.all([
      api('/api/menu', menuSchema),
      api('/api/tables', tablesSchema),
    ]).then(([m, tb]) => {
      if (m.ok) setMenu(m.data.items)
      if (tb.ok) setTables(tb.data.tables)
      setLoadFailed(!m.ok || !tb.ok)
    })
  }, [loadAttempt, menuVersion])

  const target =
    socket.board?.orders.find(
      (o) => o.id === targetId && !isFinished(o.status) && !o.cancelRequested,
    ) ?? null

  const readyCount =
    socket.board?.orders.filter((o) => o.status === 'ready').length ?? 0
  const tvOnline = (socket.board?.tvCount ?? 0) > 0

  if (socket.board?.settings.staffPins && !session.staff) {
    return <StaffSignIn device={device} onSignedIn={refresh} />
  }

  const nav = [
    { id: 'order', label: t('navOrder'), icon: ClipboardList, badge: 0 },
    {
      id: 'service',
      label: t('navService'),
      icon: ConciergeBell,
      badge: readyCount,
    },
  ] as const

  return (
    <div className="min-h-dvh bg-surface pb-24 [--snackbar-bottom:10.5rem] min-[950px]:grid min-[950px]:[--snackbar-bottom:1.5rem] min-[950px]:grid-cols-[96px_1fr] min-[950px]:pb-0">
      {/* Navigation rail on wide screens, bottom bar below 950px (DESIGN.md). */}
      <nav
        aria-label={t('appName')}
        className="fixed inset-x-0 bottom-0 z-30 flex justify-around border-t border-line bg-surface pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] min-[950px]:sticky min-[950px]:top-0 min-[950px]:h-dvh min-[950px]:flex-col min-[950px]:justify-start min-[950px]:gap-6 min-[950px]:border-t-0 min-[950px]:pt-24"
      >
        {nav.map((item) => {
          const active = tab === item.id
          return (
            <button
              key={item.id}
              type="button"
              aria-current={active ? 'page' : undefined}
              onClick={() => setTab(item.id)}
              className="group grid min-h-14 justify-items-center gap-1 px-3 text-[12px] font-medium"
            >
              <span
                className={`state relative grid h-8 w-14 place-items-center rounded-full transition-colors duration-200 ${active ? '[--bg:var(--color-tonal)]' : ''}`}
              >
                <item.icon size={22} aria-hidden />
                {item.badge > 0 && (
                  <span className="absolute -top-1 right-1 grid h-5 min-w-5 place-items-center rounded-full bg-ink px-1 text-[11px] font-semibold text-surface tabular-nums">
                    {item.badge}
                  </span>
                )}
              </span>
              {item.label}
            </button>
          )
        })}
      </nav>

      <div className="min-w-0">
        <AppBar
          title={tab === 'order' ? t('newOrder') : t('navService')}
          device={device}
        >
          <span
            className={`hidden items-center gap-2 rounded-full px-4 py-2 text-sm font-medium sm:flex ${tvOnline ? 'bg-tonal' : 'border border-ink-soft'}`}
            role="status"
          >
            <span
              className={`size-2 rounded-full ${tvOnline ? 'bg-ink' : 'border border-ink'}`}
              aria-hidden
            />
            {tvOnline ? t('tvOnline') : t('tvOffline')}
          </span>
          {session.staff && (
            <StaffChip name={session.staff.name} onSignedOut={refresh} />
          )}
        </AppBar>
        {disconnected && (
          <p
            role="alert"
            className="flex items-center gap-2 bg-ink px-6 py-3 text-[15px] font-semibold text-surface"
          >
            <WifiOff size={18} aria-hidden />
            {t('disconnected', {
              time: socket.lastMessageAt
                ? formatTime(socket.lastMessageAt)
                : '--:--',
            })}
          </p>
        )}
        {loadFailed && (
          <div
            role="alert"
            className="mx-6 mt-6 flex flex-wrap items-center gap-4 rounded-md border border-ink-soft px-5 py-4"
          >
            <span className="mr-auto">{t('networkError')}</span>
            <Button
              variant="tonal"
              onClick={() => setLoadAttempt((n) => n + 1)}
            >
              {t('retry')}
            </Button>
          </div>
        )}

        {tab === 'order' ? (
          <Composer
            key={target?.id ?? 'new'}
            menu={menu}
            tables={tables}
            settings={socket.board?.settings ?? DEFAULT_SETTINGS}
            drafts={target ? extra : drafts}
            reviewOpen={reviewOpen}
            setReviewOpen={setReviewOpen}
            target={target}
            onLeaveTarget={() => setTargetId(null)}
            onSent={(message) => {
              snackbar.show(message)
              setTargetId(null)
              setTab('service')
            }}
          />
        ) : (
          <ServiceList
            board={socket.board}
            serverNow={now + socket.serverOffsetMs}
            unsent={drafts.draft.attempted ? drafts.draft : null}
            onOpenUnsent={() => {
              setTargetId(null)
              setTab('order')
              setReviewOpen(true)
            }}
            tables={tables}
            onAddItems={(order) => {
              extra.reset()
              setTargetId(order.id)
              setTab('order')
            }}
            notify={snackbar.show}
          />
        )}
      </div>
      {snackbar.node}
    </div>
  )
}
