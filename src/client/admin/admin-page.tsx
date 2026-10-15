import {
  History,
  LayoutDashboard,
  LogOut,
  MonitorSmartphone,
  SlidersHorizontal,
  UsersRound,
  UtensilsCrossed,
} from 'lucide-react'
import { type SubmitEvent, useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router'
import { z } from 'zod'
import { AppBar, LanguageToggle } from '../app-bar'
import { useI18n } from '../i18n'
import { api } from '../lib/api'
import { CenterNote } from '../lib/session'
import { useBoardSocket } from '../lib/use-board-socket'
import { Button } from '../ui/button'
import { useSnackbar } from '../ui/snackbar'
import { TextField } from '../ui/text-field'
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
// Presence is admin-only data, so it is polled rather than put on the board.
const DEVICES_EVERY_MS = 5_000

export function AdminPage() {
  const [state, setState] = useState<'loading' | 'out' | 'in'>('loading')
  useEffect(() => {
    void api('/api/admin/session', z.null()).then((r) =>
      setState(r.ok ? 'in' : 'out'),
    )
  }, [])
  if (state === 'loading') return null
  if (state === 'out') return <Login onSignedIn={() => setState('in')} />
  return <Console onSignedOut={() => setState('out')} />
}

function Login({ onSignedIn }: { onSignedIn: () => void }) {
  const { t } = useI18n()
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    const result = await api('/api/admin/login', z.null(), {
      body: { password },
    })
    setBusy(false)
    if (result.ok) return onSignedIn()
    setError(
      result.status === 429
        ? t('tooManyAttempts')
        : result.status === 0
          ? t('networkError')
          : t('wrongPassword'),
    )
  }

  return (
    <CenterNote>
      <div className="fixed top-4 right-4">
        <LanguageToggle />
      </div>
      <form
        onSubmit={submit}
        className="grid w-[min(24rem,calc(100vw-3rem))] gap-6 text-left"
      >
        <h1 className="text-4xl font-semibold tracking-tight">
          {t('adminTitle')}
        </h1>
        <TextField
          label={t('password')}
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => {
            setPassword(e.target.value)
            setError(null)
          }}
          error={error}
          required
          autoFocus
        />
        <Button type="submit" size="lg" disabled={busy || password === ''}>
          {t('signIn')}
        </Button>
      </form>
    </CenterNote>
  )
}

function Console({ onSignedOut }: { onSignedOut: () => void }) {
  const { t } = useI18n()
  const snackbar = useSnackbar()
  const [params, setParams] = useSearchParams()
  const parsedTab = tabSchema.safeParse(params.get('tab'))
  const tab: Tab = parsedTab.success ? parsedTab.data : 'overview'
  const { board } = useBoardSocket()
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
      <AppBar title={t('adminTitle')}>
        <Button
          variant="text"
          icon={<LogOut size={18} aria-hidden />}
          onClick={() => void signOut()}
        >
          <span className="hidden sm:inline">{t('signOut')}</span>
        </Button>
      </AppBar>

      {/* Material primary tabs: icon + label, active indicator underneath. */}
      <nav
        aria-label={t('adminTitle')}
        className="sticky top-16 z-20 border-b border-line bg-surface/95 backdrop-blur"
      >
        <div className="mx-auto flex max-w-5xl overflow-x-auto px-2 [scrollbar-width:none] sm:px-4">
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
                className="state relative flex min-h-16 min-w-max flex-1 flex-col items-center justify-center gap-1 px-1 text-[13px] font-medium sm:min-h-14 sm:flex-none sm:flex-row sm:gap-2 sm:px-6 sm:text-[15px]"
              >
                <item.icon size={20} aria-hidden />
                {item.label}
                <span
                  aria-hidden
                  className={`absolute inset-x-3 bottom-0 h-[3px] rounded-t-full bg-ink transition-opacity duration-200 ${active ? 'opacity-100' : 'opacity-0'}`}
                />
              </button>
            )
          })}
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
