import { Trash2 } from 'lucide-react'
import { type SubmitEvent, useState } from 'react'
import { z } from 'zod'
import { formatTime, type Translate, useI18n } from '../i18n'
import { api } from '../lib/api'
import { stagger } from '../lib/stagger'
import { Button } from '../ui/button'
import { Card } from '../ui/card'
import { Dialog } from '../ui/dialog'
import { TextField } from '../ui/text-field'
import {
  type Device,
  PAIR_ROLES,
  type PairRole,
  ROLE_ICON,
  roleName,
} from './shared'

const DAY_MS = 24 * 60 * 60 * 1000

export function DevicesTab({
  devices,
  notify,
  reload,
}: {
  devices: Device[] | null
  notify: (text: string) => void
  reload: () => void
}) {
  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,28rem)_minmax(0,1fr)] lg:items-start">
      <PairCard
        onPaired={(text) => {
          notify(text)
          reload()
        }}
      />
      <DeviceList devices={devices} notify={notify} reload={reload} />
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
      <div className="grid gap-1">
        <h2 className="text-2xl font-medium">{t('pairDevice')}</h2>
        <p className="text-[15px] text-ink-soft">{t('pairSteps')}</p>
      </div>
      <form onSubmit={submit} className="grid gap-4">
        <TextField
          label={t('code')}
          hint={t('pairHint')}
          inputMode="numeric"
          autoComplete="one-time-code"
          name="pairing-code"
          spellCheck={false}
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
          <div className="grid overflow-hidden rounded-md border border-ink-soft">
            {PAIR_ROLES.map((r) => {
              const Icon = ROLE_ICON[r]
              return (
                <label
                  key={r}
                  className={`flex min-h-12 cursor-pointer items-center gap-3 border-ink-soft px-4 text-sm font-medium not-first:border-t has-focus-visible:outline-3 has-focus-visible:-outline-offset-4 has-focus-visible:outline-ink ${role === r ? 'bg-tonal' : ''}`}
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
          name="device-label"
          autoComplete="off"
          max={40}
          value={label}
          onChange={(e) => setLabel(e.target.value)}
        />
        <Button
          type="submit"
          size="lg"
          disabled={!/^\d{6}$/.test(code) || busy || label.length > 40}
        >
          {t('approve')}
        </Button>
      </form>
    </Card>
  )
}

function lastSeen(device: Device, now: number, t: Translate) {
  if (device.online) return t('online')
  if (!device.lastSeenAt) return t('neverSeen')
  const at = device.lastSeenAt
  const when =
    now - at < DAY_MS ? formatTime(at) : new Date(at).toLocaleDateString()
  return t('lastSeen', { time: when })
}

function DeviceList({
  devices,
  notify,
  reload,
}: {
  devices: Device[] | null
  notify: (text: string) => void
  reload: () => void
}) {
  const { t } = useI18n()
  const [target, setTarget] = useState<Device | null>(null)
  const active = devices?.filter((d) => d.revokedAt === null) ?? []
  const now = Date.now()

  async function revoke(device: Device) {
    const result = await api(`/api/devices/${device.id}/revoke`, z.unknown(), {
      body: {},
    })
    setTarget(null)
    if (result.ok) {
      notify(`${device.label} · ${t('revokedAt')}`)
      reload()
    }
  }

  return (
    <section
      aria-labelledby="device-list"
      className="grid content-start gap-4 lg:pt-5"
    >
      <h2 id="device-list" className="text-2xl font-medium">
        {t('devices')}
      </h2>
      {devices && active.length === 0 && (
        <p className="text-ink-soft">{t('noDevices')}</p>
      )}
      <ul className="grid gap-2">
        {active.map((device, index) => {
          const Icon =
            device.role === 'manager'
              ? ROLE_ICON.waiter
              : ROLE_ICON[device.role]
          return (
            <li
              key={device.id}
              style={stagger(index)}
              className="rise flex min-h-16 items-center gap-4 rounded-md bg-wash px-4 py-2"
            >
              <Icon size={22} aria-hidden />
              <div className="flex min-w-0 flex-1 flex-col items-start gap-1.5 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                <div className="grid min-w-0">
                  <span className="font-medium break-words">
                    {device.label}
                  </span>
                  <span className="text-sm text-ink-soft">
                    {roleName(device.role, t)}
                  </span>
                </div>
                <span
                  className={`flex shrink-0 items-center gap-2 rounded-full px-3 py-1 text-sm ${device.online ? 'bg-tonal font-medium' : 'border border-line text-ink-soft'}`}
                >
                  <span
                    aria-hidden
                    className={`size-2 rounded-full ${device.online ? 'bg-ink' : 'border border-ink-soft'}`}
                  />
                  {lastSeen(device, now, t)}
                </span>
              </div>
              <Button
                variant="text"
                icon={<Trash2 size={18} aria-hidden />}
                aria-label={`${t('revoke')} ${device.label}`}
                className="-mr-2 max-sm:size-12 max-sm:px-0"
                onClick={() => setTarget(device)}
              >
                <span className="hidden sm:inline">{t('revoke')}</span>
              </Button>
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
      />
    </section>
  )
}
