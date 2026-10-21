import {
  History,
  LayoutDashboard,
  MonitorSmartphone,
  SlidersHorizontal,
  UsersRound,
  UtensilsCrossed,
} from 'lucide-react'
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'
import { useSearchParams } from 'react-router'
import { z } from 'zod'
import { AppBar, SignOutButton } from '../app-bar'
import { useI18n } from '../i18n'
import { api } from '../lib/api'
import { useBoardSocket } from '../lib/use-board-socket'
import { PasswordSignIn } from '../password-sign-in'
import { useSnackbar } from '../ui/snackbar'
import { DevicesTab } from './devices-tab'
import { HistoryTab } from './history-tab'
import { MenuTab } from './menu-tab'
import { OverviewTab } from './overview-tab'
import { SettingsTab } from './settings-tab'
import { type Device, devicesSchema } from './shared'
import { StaffTab } from './staff-tab'

const TABS = [
  'overview',
  'menu',
  'staff',
  'devices',
  'history',
  'settings',
] as const
type Tab = (typeof TABS)[number]
const tabSchema = z.enum(TABS)
const adminSessionSchema = z.object({ venueName: z.string().nullable() })
// Presence is admin-only data, so it is polled rather than put on the board.
const DEVICES_EVERY_MS = 5_000

export function AdminPage() {
  const [state, setState] = useState<'loading' | 'out' | 'in'>('loading')
  const [venueName, setVenueName] = useState<string | null>(null)
  const check = useCallback(async () => {
    // Arriving from the site's account page: a one-time pass signs the owner in.
    const handoff = new URLSearchParams(window.location.hash.slice(1)).get(
      'handoff',
    )
    if (handoff) {
      window.history.replaceState(null, '', window.location.pathname)
      await api('/api/admin/handoff', z.null(), { body: { token: handoff } })
    }
    const result = await api('/api/admin/session', adminSessionSchema)
    if (result.ok) setVenueName(result.data.venueName)
    setState(result.ok ? 'in' : 'out')
  }, [])
  useEffect(() => {
    void check()
  }, [check])
  if (state === 'loading') return null
  if (state === 'out') return <Login onSignedIn={() => void check()} />
  return <Console venueName={venueName} onSignedOut={() => setState('out')} />
}

function Login({ onSignedIn }: { onSignedIn: () => void }) {
  const { t } = useI18n()
  return (
    <PasswordSignIn
      title={t('adminTitle')}
      endpoint="/api/admin/login"
      errorText={(result) =>
        result.status === 429
          ? t('tooManyAttempts')
          : result.status === 0
            ? t('networkError')
            : // A switched-off or unknown dapur says so itself.
              result.status === 403 || result.status === 404
              ? result.message
              : t('wrongPassword')
      }
      onSignedIn={onSignedIn}
    />
  )
}

function Console({
  venueName,
  onSignedOut,
}: {
  venueName: string | null
  onSignedOut: () => void
}) {
  const { t } = useI18n()
  const snackbar = useSnackbar()
  const [params, setParams] = useSearchParams()
  const parsedTab = tabSchema.safeParse(params.get('tab'))
  const tab: Tab = parsedTab.success ? parsedTab.data : 'overview'
  const { board } = useBoardSocket()
  const tabsRef = useRef<HTMLDivElement>(null)
  const [indicator, setIndicator] = useState<{
    left: number
    width: number
  } | null>(null)

  // Follows the active tab, also when labels change width (language, fonts).
  // biome-ignore lint/correctness/useExhaustiveDependencies: `tab` and `t` move the active tab or its width
  useLayoutEffect(() => {
    const nav = tabsRef.current
    const active = nav?.querySelector<HTMLElement>('[aria-current="page"]')
    if (!nav || !active) return
    const measure = () =>
      setIndicator({
        left: active.offsetLeft + 12,
        width: active.offsetWidth - 24,
      })
    measure()
    active.scrollIntoView({ block: 'nearest', inline: 'nearest' })
    const observer = new ResizeObserver(measure)
    observer.observe(active)
    return () => observer.disconnect()
  }, [tab, t])
  const [devices, setDevices] = useState<Device[] | null>(null)

  const loadDevices = useCallback(async () => {
    const result = await api('/api/devices', devicesSchema)
    if (result.ok) setDevices(result.data.devices)
    else if (result.status === 401) onSignedOut()
  }, [onSignedOut])

  useEffect(() => {
    void loadDevices()
    const timer = setInterval(() => void loadDevices(), DEVICES_EVERY_MS)
    return () => clearInterval(timer)
  }, [loadDevices])

  async function signOut() {
    await api('/api/admin/logout', z.null(), { method: 'POST' })
    onSignedOut()
  }

  const tabs = [
    { id: 'overview', label: t('tabOverview'), icon: LayoutDashboard },
    { id: 'menu', label: t('tabMenu'), icon: UtensilsCrossed },
    { id: 'staff', label: t('tabStaff'), icon: UsersRound },
    { id: 'devices', label: t('tabDevices'), icon: MonitorSmartphone },
    { id: 'history', label: t('tabHistory'), icon: History },
    { id: 'settings', label: t('tabSettings'), icon: SlidersHorizontal },
  ] as const

  return (
    <div className="min-h-dvh bg-surface pb-16">
      <AppBar title={t('adminTitle')} device={venueName ?? undefined}>
        <SignOutButton onClick={() => void signOut()} />
      </AppBar>

      {/* Tabs: icon and label, one indicator under the active tab. */}
      <nav
        aria-label={t('adminTitle')}
        className="sticky top-16 z-20 border-b border-line bg-surface/95 backdrop-blur"
      >
        <div
          ref={tabsRef}
          className="relative mx-auto flex max-w-5xl overflow-x-auto px-2 [scrollbar-width:none] sm:px-6"
        >
          {tabs.map((item) => {
            const active = tab === item.id
            return (
              <button
                key={item.id}
                type="button"
                aria-current={active ? 'page' : undefined}
                onClick={() =>
                  setParams(item.id === 'overview' ? {} : { tab: item.id })
                }
                className="state relative flex min-h-16 min-w-max flex-1 flex-col items-center justify-center gap-1 px-1 text-xs font-medium sm:min-h-14 sm:flex-none sm:flex-row sm:gap-2 sm:px-6 sm:text-[15px]"
              >
                <item.icon size={20} aria-hidden />
                {item.label}
              </button>
            )
          })}
          {/* One indicator that slides to the active tab. */}
          {indicator && (
            <span
              aria-hidden
              style={{
                translate: `${indicator.left}px 0`,
                width: indicator.width,
              }}
              className="absolute bottom-0 left-0 h-[3px] rounded-t-full bg-ink transition-[translate,width] duration-300 ease-[var(--ease-standard)]"
            />
          )}
        </div>
      </nav>

      <main key={tab} className="rise mx-auto max-w-5xl px-4 pt-8 sm:px-6">
        {tab === 'overview' && (
          <OverviewTab
            board={board}
            devices={devices}
            notify={snackbar.show}
            onManageDevices={() => setParams({ tab: 'devices' })}
          />
        )}
        {tab === 'menu' && (
          <MenuTab menuVersion={board?.menuVersion} notify={snackbar.show} />
        )}
        {tab === 'staff' && <StaffTab notify={snackbar.show} />}
        {tab === 'history' && (
          <HistoryTab devices={devices} notify={snackbar.show} />
        )}
        {tab === 'devices' && (
          <DevicesTab
            devices={devices}
            notify={snackbar.show}
            reload={() => void loadDevices()}
          />
        )}
        {tab === 'settings' && (
          <SettingsTab
            settings={board?.settings ?? null}
            notify={snackbar.show}
          />
        )}
      </main>
      {snackbar.node}
    </div>
  )
}
