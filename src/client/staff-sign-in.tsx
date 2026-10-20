import { ArrowLeft, Check, Delete, UserRound } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { z } from 'zod'
import {
  type StaffMember,
  staffListSchema,
  staffMemberSchema,
} from '../shared/staff'
import { AppBar } from './app-bar'
import { useI18n } from './i18n'
import { api } from './lib/api'
import { stagger } from './lib/stagger'
import { Button, IconButton } from './ui/button'

const MIN_PIN = 4
const MAX_PIN = 6

/** Full-screen "who is working?" step for waiter and kitchen devices. */
export function StaffSignIn({
  device,
  onSignedIn,
}: {
  device: string
  onSignedIn: () => void
}) {
  const { t } = useI18n()
  const [staff, setStaff] = useState<StaffMember[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [picked, setPicked] = useState<StaffMember | null>(null)

  useEffect(() => {
    void api('/api/staff', staffListSchema).then((result) => {
      if (result.ok) setStaff(result.data.staff)
      else setFailed(true)
    })
  }, [])

  return (
    <div className="min-h-dvh bg-surface pb-6 sm:pb-10">
      <AppBar title={t('whoIsWorking')} device={device} />
      <main className="mx-auto grid max-w-3xl gap-6 px-4 pt-4 sm:px-6 sm:pt-8">
        {picked ? (
          <PinPad
            key={picked.id}
            member={picked}
            onBack={() => setPicked(null)}
            onSignedIn={onSignedIn}
          />
        ) : (
          <>
            <h2 className="text-3xl font-medium tracking-tight">
              {t('whoIsWorking')}
            </h2>
            {failed && <p role="alert">{t('networkError')}</p>}
            {staff?.length === 0 && (
              <p className="text-ink-soft">{t('noStaffForDevice')}</p>
            )}
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {staff?.map((member, index) => (
                <li key={member.id} style={stagger(index)} className="rise">
                  <button
                    type="button"
                    onClick={() => setPicked(member)}
                    className="state flex min-h-24 w-full items-center gap-4 rounded-md px-4 text-left text-lg font-medium transition-[background-color,scale] duration-150 active:scale-[0.98] [--bg:var(--color-wash)]"
                  >
                    <Monogram name={member.name} />
                    <span className="min-w-0 break-words">{member.name}</span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </main>
    </div>
  )
}

/** A person's initial in a circle; outlined when they are inactive. */
export function Monogram({
  name,
  large = false,
  muted = false,
}: {
  name: string
  large?: boolean
  muted?: boolean
}) {
  return (
    <span
      aria-hidden
      className={`grid shrink-0 place-items-center rounded-full font-semibold ${large ? 'size-16 text-2xl' : 'size-11 text-lg'} ${muted ? 'border border-ink-soft text-ink-soft' : 'bg-ink text-surface'}`}
    >
      {name.trim().charAt(0).toUpperCase()}
    </span>
  )
}

function PinPad({
  member,
  onBack,
  onSignedIn,
}: {
  member: StaffMember
  onBack: () => void
  onSignedIn: () => void
}) {
  const { t } = useI18n()
  const [pin, setPin] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [shakes, setShakes] = useState(0)
  const [busy, setBusy] = useState(false)

  const press = useCallback((digit: string) => {
    setError(null)
    setPin((p) => (p.length < MAX_PIN ? p + digit : p))
  }, [])
  const erase = useCallback(() => setPin((p) => p.slice(0, -1)), [])

  const submit = useCallback(async () => {
    if (pin.length < MIN_PIN || busy) return
    setBusy(true)
    const result = await api(
      '/api/staff/login',
      z.object({ staff: staffMemberSchema }),
      { body: { staffId: member.id, pin } },
    )
    setBusy(false)
    if (result.ok) return onSignedIn()
    setPin('')
    setShakes((n) => n + 1)
    setError(
      result.status === 429
        ? t('tooManyAttempts')
        : result.status === 0
          ? t('networkError')
          : t('wrongPin'),
    )
  }, [pin, busy, member.id, onSignedIn, t])

  // A hardware keyboard works too: digits, Backspace and Enter.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (/^\d$/.test(event.key)) press(event.key)
      else if (event.key === 'Backspace') erase()
      else if (event.key === 'Enter') void submit()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [press, erase, submit])

  const slots = Math.max(MIN_PIN, pin.length)
  return (
    <section className="rise mx-auto grid w-full max-w-sm justify-items-center gap-4 sm:gap-6">
      <div className="flex w-full items-center gap-3">
        <IconButton label={t('back')} onClick={onBack}>
          <ArrowLeft size={22} aria-hidden />
        </IconButton>
        <Monogram name={member.name} />
        <div className="grid min-w-0">
          <h2 className="text-xl font-medium break-words">{member.name}</h2>
          <p className="text-ink-soft">{t('enterPin')}</p>
        </div>
      </div>
      <div className="grid justify-items-center gap-2">
        <output
          key={shakes}
          aria-label={`${t('pin')}: ${pin.length}`}
          className={`flex h-6 items-center gap-4 ${shakes > 0 ? 'shake' : ''}`}
        >
          {Array.from({ length: slots }, (_, i) => (
            <span
              // biome-ignore lint/suspicious/noArrayIndexKey: slots are positions, not items
              key={i}
              className="grid size-4 place-items-center rounded-full border-2 border-ink"
            >
              {i < pin.length && (
                <span className="pop size-full rounded-full bg-ink" />
              )}
            </span>
          ))}
        </output>
        <p role="alert" className="min-h-6 text-center font-semibold">
          {error}
        </p>
      </div>
      <div className="grid grid-cols-3 gap-3 sm:gap-4">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
          <Key key={digit} onClick={() => press(digit)}>
            {digit}
          </Key>
        ))}
        <button
          type="button"
          aria-label={t('deleteDigit')}
          title={t('deleteDigit')}
          disabled={pin.length === 0}
          onClick={erase}
          className={`${KEY} disabled:text-ink-soft`}
        >
          <Delete size={26} aria-hidden />
        </button>
        <Key onClick={() => press('0')}>0</Key>
        <button
          type="button"
          aria-label={t('signIn')}
          disabled={pin.length < MIN_PIN || busy}
          onClick={() => void submit()}
          className={`${KEY} text-surface [--bg:var(--color-ink)] [--on:var(--color-surface)] disabled:border-2 disabled:border-ink-soft disabled:text-ink-soft disabled:[--bg:transparent]`}
        >
          <Check size={28} aria-hidden />
        </button>
      </div>
    </section>
  )
}

// 72px keys keep the whole pad on a small phone screen; 80px from sm up.
const KEY =
  'state grid size-18 place-items-center rounded-full transition-[background-color,scale] duration-150 active:scale-[0.94] sm:size-20'

function Key({ onClick, children }: { onClick: () => void; children: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`${KEY} text-[28px] font-medium tabular-nums [--bg:var(--color-tonal)]`}
    >
      {children}
    </button>
  )
}

/** Who is signed in on this device; tapping it hands the device over. */
export function StaffChip({
  name,
  onSignedOut,
}: {
  name: string
  onSignedOut: () => void
}) {
  const { t } = useI18n()
  return (
    <Button
      variant="tonal"
      title={t('switchStaff')}
      icon={<UserRound size={18} aria-hidden />}
      onClick={async () => {
        await api('/api/staff/logout', z.null(), { method: 'POST' })
        onSignedOut()
      }}
    >
      <span className="max-w-32 truncate">{name}</span>
    </Button>
  )
}
