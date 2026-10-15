import { ChefHat, LogOut, MonitorPlay, Tablet, Trash2 } from 'lucide-react'
import { type SubmitEvent, useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router'
import { z } from 'zod'
import {
  boardMessageSchema,
  type Settings,
  settingsSchema,
} from '../../shared/board'
import { ROLES } from '../../shared/order'
import { AppBar, LanguageToggle } from '../app-bar'
import { type Translate, useI18n } from '../i18n'
import { api } from '../lib/api'
import { CenterNote } from '../lib/session'
import { Button } from '../ui/button'
import { Card } from '../ui/card'
import { Dialog } from '../ui/dialog'
import { useSnackbar } from '../ui/snackbar'
import { Switch } from '../ui/switch'
import { TextField } from '../ui/text-field'

const PAIR_ROLES = ['waiter', 'kitchen', 'tv'] as const
type PairRole = (typeof PAIR_ROLES)[number]

const deviceSchema = z.object({
  id: z.string(),
  label: z.string(),
  role: z.enum(ROLES),
  createdAt: z.number(),
  revokedAt: z.number().nullable(),
})
type Device = z.infer<typeof deviceSchema>
const devicesSchema = z.object({ devices: z.array(deviceSchema) })

function roleName(role: string, t: Translate) {
  if (role === 'waiter') return t('roleWaiter')
  if (role === 'kitchen') return t('roleKitchen')
  if (role === 'tv') return t('roleTv')
  return t('roleManager')
}

const ROLE_ICON = { waiter: Tablet, kitchen: ChefHat, tv: MonitorPlay } as const

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
  const [devices, setDevices] = useState<Device[] | null>(null)

  const loadDevices = useCallback(async () => {
    const result = await api('/api/devices', devicesSchema)
    if (result.ok) setDevices(result.data.devices)
    else if (result.status === 401) onSignedOut()
  }, [onSignedOut])

  useEffect(() => {
    void loadDevices()
  }, [loadDevices])

  async function signOut() {
    await api('/api/admin/logout', z.null(), { method: 'POST' })
    onSignedOut()
  }

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
      <main className="mx-auto grid max-w-5xl gap-6 px-4 pt-8 sm:px-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <PairCard
          onPaired={(text) => {
            snackbar.show(text)
            void loadDevices()
          }}
        />
        <ServiceDayCard notify={snackbar.show} />
        <OrderDetailsCard notify={snackbar.show} />
        <DeviceList
          devices={devices}
          onRevoked={(label) => {
            snackbar.show(`${label} · ${t('revokedAt')}`)
            void loadDevices()
          }}
        />
        <nav
          className="flex flex-wrap items-center gap-3 lg:col-span-2"
          aria-label={t('openScreens')}
        >
          <span className="text-sm text-ink-soft">{t('openScreens')}</span>
          {(['/waiter', '/kitchen', '/tv'] as const).map((path) => (
            <Link
              key={path}
              to={path}
              className="state inline-flex min-h-12 items-center rounded-full border border-line px-5 text-[15px] font-medium"
            >
              {roleName(path.slice(1), t)}
            </Link>
          ))}
        </nav>
      </main>
      {snackbar.node}
    </div>
  )
}

function PairCard({ onPaired }: { onPaired: (message: string) => void }) {
  const { t } = useI18n()
  const [code, setCode] = useState('')
  const [role, setRole] = useState<PairRole>('waiter')
  const [label, setLabel] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const codeOk = /^\d{6}$/.test(code)

  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    const name = label.trim() || roleName(role, t)
    const result = await api('/api/devices/enroll/approve', z.unknown(), {
      body: { code, role, label: name },
    })
    setBusy(false)
    if (!result.ok) {
      setError(result.status === 404 ? t('codeNotFound') : t('networkError'))
      return
    }
    setCode('')
    setLabel('')
    onPaired(t('approved', { label: name, role: roleName(role, t) }))
  }

  return (
    <Card className="grid gap-5">
      <header className="grid gap-1">
        <h2 className="text-2xl font-medium">{t('pairDevice')}</h2>
      </header>
      <form onSubmit={submit} className="grid gap-4">
        <TextField
          label={t('code')}
          hint={t('pairHint')}
          inputMode="numeric"
          autoComplete="one-time-code"
          className="text-2xl font-semibold tracking-[0.3em] tabular-nums"
          value={code}
          onChange={(e) => {
            setCode(e.target.value.replace(/\D/g, '').slice(0, 6))
            setError(null)
          }}
          error={error}
        />
        <fieldset className="grid gap-1.5">
          <legend className="mb-1.5 text-sm font-medium">{t('role')}</legend>
          <div className="grid grid-cols-3 overflow-hidden rounded-full border border-ink-soft">
            {PAIR_ROLES.map((r) => {
              const Icon = ROLE_ICON[r]
              return (
                <label
                  key={r}
                  className={`flex min-h-12 cursor-pointer items-center justify-center gap-2 border-ink-soft px-2 text-sm font-medium not-first:border-l has-focus-visible:outline-3 has-focus-visible:-outline-offset-4 has-focus-visible:outline-ink ${role === r ? 'bg-tonal' : ''}`}
                >
                  <input
                    type="radio"
                    name="role"
                    value={r}
                    checked={role === r}
                    onChange={() => setRole(r)}
                    className="sr-only"
                  />
                  <Icon size={18} aria-hidden />
                  {roleName(r, t)}
                </label>
              )
            })}
          </div>
        </fieldset>
        <TextField
          label={t('label')}
          hint={t('labelHint')}
          max={40}
          value={label}
          onChange={(e) => setLabel(e.target.value)}
        />
        <Button
          type="submit"
          size="lg"
          disabled={!codeOk || busy || label.length > 40}
        >
          {t('approve')}
        </Button>
      </form>
    </Card>
  )
}

function ServiceDayCard({ notify }: { notify: (text: string) => void }) {
  const { t } = useI18n()
  const [day, setDay] = useState<{ open: boolean; day: string } | null>(null)
  const [needsForce, setNeedsForce] = useState(false)

  const load = useCallback(async () => {
    const result = await api('/api/board', boardMessageSchema)
    if (result.ok)
      setDay({ open: result.data.serviceOpen, day: result.data.serviceDay })
  }, [])
  useEffect(() => {
    void load()
  }, [load])

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
    void load()
  }

  return (
    <Card className="grid content-start gap-5 self-start">
      <h2 className="text-2xl font-medium">{t('serviceDay')}</h2>
      {day && (
        <p className="flex items-center gap-3 text-lg">
          <span
            className={`size-3 rounded-full ${day.open ? 'bg-ink' : 'border-2 border-ink'}`}
            aria-hidden
          />
          {day.open ? t('serviceOpen', { day: day.day }) : t('serviceClosed')}
        </p>
      )}
      <div className="flex flex-wrap gap-3">
        {day?.open ? (
          <>
            <Button variant="outlined" onClick={() => void change('close')}>
              {t('closeDay')}
            </Button>
            {needsForce && (
              <Button
                variant="filled"
                onClick={() => void change('close', true)}
              >
                {t('forceClose')}
              </Button>
            )}
          </>
        ) : (
          <Button onClick={() => void change('open')}>{t('openDay')}</Button>
        )}
      </div>
    </Card>
  )
}

function DeviceList({
  devices,
  onRevoked,
}: {
  devices: Device[] | null
  onRevoked: (label: string) => void
}) {
  const { t } = useI18n()
  const [target, setTarget] = useState<Device | null>(null)

  async function revoke(device: Device) {
    const result = await api(`/api/devices/${device.id}/revoke`, z.unknown(), {
      body: {},
    })
    setTarget(null)
    if (result.ok) onRevoked(device.label)
  }

  return (
    <section className="grid content-start gap-4 lg:col-span-2">
      <h2 className="text-2xl font-medium">{t('devices')}</h2>
      {devices?.length === 0 && (
        <p className="text-ink-soft">{t('noDevices')}</p>
      )}
      <ul className="grid gap-2">
        {devices?.map((device) => {
          const Icon =
            device.role === 'manager' ? Tablet : ROLE_ICON[device.role]
          const revoked = device.revokedAt !== null
          return (
            <li
              key={device.id}
              className={`flex min-h-16 items-center gap-4 rounded-md px-4 py-2 ${revoked ? 'border border-dashed border-line text-ink-soft' : 'bg-wash'}`}
            >
              <Icon size={22} aria-hidden />
              <div className="mr-auto grid">
                <span
                  className={`font-medium ${revoked ? 'line-through' : ''}`}
                >
                  {device.label}
                </span>
                <span className="text-sm text-ink-soft">
                  {roleName(device.role, t)}
                  {revoked && ` · ${t('revokedAt')}`}
                </span>
              </div>
              {!revoked && (
                <Button
                  variant="text"
                  icon={<Trash2 size={18} aria-hidden />}
                  onClick={() => setTarget(device)}
                >
                  {t('revoke')}
                </Button>
              )}
            </li>
          )
        })}
      </ul>
      <Dialog
        open={target !== null}
        onOpenChange={(open) => !open && setTarget(null)}
        title={t('revoke')}
        description={
          target ? t('revokeConfirm', { label: target.label }) : undefined
        }
        footer={
          <>
            <Button variant="text" onClick={() => setTarget(null)}>
              {t('cancel')}
            </Button>
            <Button onClick={() => target && void revoke(target)}>
              {t('revoke')}
            </Button>
          </>
        }
      >
        {null}
      </Dialog>
    </section>
  )
}

const SETTING_ROWS = [
  { key: 'lineNotes', label: 'settingLineNotes' },
  { key: 'orderNote', label: 'settingOrderNote' },
  { key: 'allergy', label: 'settingAllergy', hint: 'settingAllergyHint' },
] as const

/** Lets each venue choose a simple or a detailed order form. */
function OrderDetailsCard({ notify }: { notify: (text: string) => void }) {
  const { t } = useI18n()
  const [settings, setSettings] = useState<Settings | null>(null)

  useEffect(() => {
    void api('/api/board', boardMessageSchema).then((r) => {
      if (r.ok) setSettings(r.data.settings)
    })
  }, [])

  async function change(next: Settings) {
    const previous = settings
    setSettings(next)
    const result = await api(
      '/api/admin/settings',
      z.object({ settings: settingsSchema }),
      { body: next },
    )
    if (result.ok) notify(t('settingsSaved'))
    else {
      setSettings(previous)
      notify(t('networkError'))
    }
  }

  return (
    <Card className="grid content-start gap-2 lg:col-span-2">
      <h2 className="text-2xl font-medium">{t('orderDetails')}</h2>
      <p className="mb-2 text-[15px] text-ink-soft">{t('orderDetailsHint')}</p>
      {settings && (
        <div className="grid divide-y divide-line">
          {SETTING_ROWS.map((row) => (
            <Switch
              key={row.key}
              label={t(row.label)}
              hint={'hint' in row ? t(row.hint) : undefined}
              checked={settings[row.key]}
              onChange={(checked) =>
                void change({ ...settings, [row.key]: checked })
              }
            />
          ))}
        </div>
      )}
    </Card>
  )
}
