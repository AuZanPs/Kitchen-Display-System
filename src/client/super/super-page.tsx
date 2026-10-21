import {
  ExternalLink,
  KeyRound,
  Mail,
  Pencil,
  Plus,
  Shuffle,
} from 'lucide-react'
import { type SubmitEvent, useCallback, useEffect, useState } from 'react'
import { z } from 'zod'
import { jakartaDate } from '../../shared/order'
import {
  RESERVED_SLUGS,
  SLUG_PATTERN,
  suggestSlug,
  type Venue,
  venueListSchema,
} from '../../shared/venue'
import { AppBar, SignOutButton } from '../app-bar'
import { formatDay, useI18n } from '../i18n'
import { api } from '../lib/api'
import { stagger } from '../lib/stagger'
import { PasswordSignIn } from '../password-sign-in'
import { Monogram } from '../staff-sign-in'
import { Button, IconButton } from '../ui/button'
import { Dialog } from '../ui/dialog'
import { useSnackbar } from '../ui/snackbar'
import { Switch } from '../ui/switch'
import { TextField } from '../ui/text-field'

/** The console runs on console.<base>; every dapur lives on <slug>.<base>. */
function venueHost(slug: string) {
  return `${slug}.${window.location.host.replace(/^console\./, '')}`
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** Twelve readable characters, no look-alikes (0/O, 1/l). */
function randomPassword() {
  const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789'
  const bytes = crypto.getRandomValues(new Uint8Array(12))
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('')
}

export function SuperPage() {
  const [state, setState] = useState<'loading' | 'out' | 'in'>('loading')
  useEffect(() => {
    void api('/api/super/session', z.null()).then((r) =>
      setState(r.ok ? 'in' : 'out'),
    )
  }, [])
  if (state === 'loading') return null
  if (state === 'out') return <Login onSignedIn={() => setState('in')} />
  return <Venues onSignedOut={() => setState('out')} />
}

function Login({ onSignedIn }: { onSignedIn: () => void }) {
  const { t } = useI18n()
  return (
    <PasswordSignIn
      title={t('superTitle')}
      endpoint="/api/super/login"
      errorText={(result) =>
        result.status === 0 ? t('networkError') : result.message
      }
      onSignedIn={onSignedIn}
    />
  )
}

function Venues({ onSignedOut }: { onSignedOut: () => void }) {
  const { t, lang } = useI18n()
  const snackbar = useSnackbar()
  const [venues, setVenues] = useState<Venue[] | null>(null)
  const [adding, setAdding] = useState(false)
  const [resetting, setResetting] = useState<Venue | null>(null)
  const [owning, setOwning] = useState<Venue | null>(null)
  const [renaming, setRenaming] = useState<Venue | null>(null)
  const [disabling, setDisabling] = useState<Venue | null>(null)

  const load = useCallback(async () => {
    const result = await api('/api/super/venues', venueListSchema)
    if (result.ok) setVenues(result.data.venues)
    else if (result.status === 401) onSignedOut()
    else snackbar.show(t('networkError'))
  }, [onSignedOut, snackbar.show, t])

  useEffect(() => {
    void load()
  }, [load])

  async function setDisabled(venue: Venue, disabled: boolean) {
    setDisabling(null)
    const result = await api(
      `/api/super/venues/${venue.slug}/status`,
      z.unknown(),
      { method: 'PUT', body: { disabled } },
    )
    if (!result.ok) return snackbar.show(result.message)
    snackbar.show(
      t(disabled ? 'venueDisabled' : 'venueEnabled', { name: venue.name }),
    )
    await load()
  }

  async function signOut() {
    await api('/api/super/logout', z.null(), { body: {} })
    onSignedOut()
  }

  return (
    <div className="min-h-dvh bg-surface pb-16">
      <AppBar title={t('appName')} device={t('superTitle')}>
        <SignOutButton onClick={() => void signOut()} />
      </AppBar>

      <main className="rise mx-auto grid max-w-3xl gap-6 px-4 pt-8 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="flex items-center gap-3 text-2xl font-medium">
            {t('venuesTitle')}
            {venues && (
              <span className="grid h-7 min-w-7 place-items-center rounded-full bg-tonal px-2 text-sm font-semibold tabular-nums">
                {venues.length}
              </span>
            )}
          </h2>
          <Button
            icon={<Plus size={18} aria-hidden />}
            onClick={() => setAdding(true)}
          >
            {t('addVenue')}
          </Button>
        </div>

        <ul className="grid gap-3">
          {venues?.map((venue, index) => {
            const host = venueHost(venue.slug)
            return (
              <li
                key={venue.slug}
                style={stagger(index)}
                className={`rise grid gap-4 rounded-md p-4 sm:p-5 ${venue.disabled ? 'border border-line' : 'bg-wash'}`}
              >
                <div className="flex flex-wrap items-start gap-x-4 gap-y-2">
                  <Monogram name={venue.name} muted={venue.disabled} />
                  <div className="grid min-w-48 flex-1 gap-0.5">
                    <span className="text-lg font-medium break-words">
                      {venue.name}
                    </span>
                    <a
                      href={`${window.location.protocol}//${host}/admin`}
                      target="_blank"
                      rel="noreferrer"
                      className="w-fit text-[15px] wrap-anywhere text-ink-soft underline-offset-4 hover:underline"
                    >
                      {host}
                    </a>
                    <span className="text-[13px] wrap-anywhere text-ink-soft">
                      {venue.ownerEmail ?? t('noOwner')}
                    </span>
                    {venue.createdAt > 0 && (
                      <span className="text-[13px] text-ink-soft">
                        {t('createdOn', {
                          date: formatDay(jakartaDate(venue.createdAt), lang),
                        })}
                      </span>
                    )}
                  </div>
                  {/* Drops under the details on a phone instead of squeezing them. */}
                  <div className="ml-auto">
                    <Switch
                      label={venue.disabled ? t('venueOff') : t('venueActive')}
                      checked={!venue.disabled}
                      onChange={(on) =>
                        on
                          ? void setDisabled(venue, false)
                          : setDisabling(venue)
                      }
                    />
                  </div>
                </div>
                <div className="-mx-2 -mb-1 flex flex-wrap gap-1 border-t border-line pt-2">
                  <a
                    href={`${window.location.protocol}//${host}/admin`}
                    target="_blank"
                    rel="noreferrer"
                    className="state inline-flex min-h-12 items-center gap-2 rounded-full px-4 text-[15px] font-semibold"
                  >
                    <ExternalLink size={18} aria-hidden />
                    {t('openAdmin')}
                  </a>
                  <Button
                    variant="text"
                    icon={<KeyRound size={18} aria-hidden />}
                    onClick={() => setResetting(venue)}
                  >
                    {t('resetPassword')}
                  </Button>
                  <Button
                    variant="text"
                    icon={<Mail size={18} aria-hidden />}
                    onClick={() => setOwning(venue)}
                  >
                    {t('ownerEmail')}
                  </Button>
                  <Button
                    variant="text"
                    icon={<Pencil size={18} aria-hidden />}
                    onClick={() => setRenaming(venue)}
                  >
                    {t('renameVenue')}
                  </Button>
                </div>
              </li>
            )
          })}
        </ul>
      </main>

      <AddVenue
        open={adding}
        onOpenChange={setAdding}
        onCreated={(name) => {
          setAdding(false)
          snackbar.show(t('venueCreated', { name }))
          void load()
        }}
      />
      <OwnerEmail
        venue={owning}
        onDone={(saved) => {
          setOwning(null)
          if (saved) {
            snackbar.show(t('ownerSaved', { name: saved }))
            void load()
          }
        }}
      />
      <RenameVenue
        venue={renaming}
        onDone={(saved) => {
          setRenaming(null)
          if (saved) {
            snackbar.show(t('venueRenamed', { name: saved }))
            void load()
          }
        }}
      />
      <ResetPassword
        venue={resetting}
        onDone={(name) => {
          setResetting(null)
          if (name) snackbar.show(t('passwordReset', { name }))
        }}
      />
      <Dialog
        open={disabling !== null}
        onOpenChange={(open) => !open && setDisabling(null)}
        title={t('disableTitle', { name: disabling?.name ?? '' })}
        description={t('disableConfirm')}
        footer={
          <>
            <Button variant="text" onClick={() => setDisabling(null)}>
              {t('cancel')}
            </Button>
            <Button
              onClick={() => disabling && void setDisabled(disabling, true)}
            >
              {t('disable')}
            </Button>
          </>
        }
      />
      {snackbar.node}
    </div>
  )
}

function PasswordField({
  value,
  onChange,
  label,
  error,
}: {
  value: string
  onChange: (value: string) => void
  label: string
  error: string | null
}) {
  const { t } = useI18n()
  return (
    <div className="flex items-start gap-2">
      <div className="min-w-0 flex-1">
        <TextField
          label={label}
          hint={t('venueAdminPasswordHint')}
          // Shown in clear: the super admin hands it to the kitchen owner.
          type="text"
          autoComplete="off"
          spellCheck={false}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          error={error}
          required
        />
      </div>
      <IconButton
        label={t('generatePassword')}
        className="mt-7"
        onClick={() => onChange(randomPassword())}
      >
        <Shuffle size={20} aria-hidden />
      </IconButton>
    </div>
  )
}

function AddVenue({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated: (name: string) => void
}) {
  const { t } = useI18n()
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [slugEdited, setSlugEdited] = useState(false)
  const [password, setPassword] = useState('')
  const [owner, setOwner] = useState('')
  const [showErrors, setShowErrors] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    setName('')
    setOwner('')
    setSlug('')
    setSlugEdited(false)
    setPassword(randomPassword())
    setShowErrors(false)
    setServerError(null)
  }, [open])

  const slugOk = SLUG_PATTERN.test(slug) && !RESERVED_SLUGS.has(slug)
  const passwordOk = password.length >= 8
  const ownerOk = owner.trim() === '' || EMAIL_PATTERN.test(owner.trim())
  const base = venueHost('x').replace(/^x\./, '')

  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    setShowErrors(true)
    if (!name.trim() || !slugOk || !passwordOk || !ownerOk) return
    setBusy(true)
    const result = await api('/api/super/venues', z.unknown(), {
      body: {
        slug,
        name: name.trim(),
        adminPassword: password,
        ...(owner.trim() ? { ownerEmail: owner.trim() } : {}),
      },
    })
    setBusy(false)
    if (result.ok) return onCreated(name.trim())
    setServerError(result.message)
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('addVenue')}
      footer={
        <>
          <Button variant="text" onClick={() => onOpenChange(false)}>
            {t('cancel')}
          </Button>
          <Button type="submit" form="add-venue" disabled={busy}>
            {t('createVenue')}
          </Button>
        </>
      }
    >
      <form id="add-venue" onSubmit={submit} className="grid gap-4" noValidate>
        <TextField
          label={t('venueName')}
          hint={t('venueNameHint')}
          max={60}
          value={name}
          onChange={(e) => {
            setName(e.target.value)
            if (!slugEdited) setSlug(suggestSlug(e.target.value))
            setServerError(null)
          }}
          error={showErrors && !name.trim() ? t('fieldRequired') : null}
          required
          autoFocus
        />
        <TextField
          label={t('venueAddress')}
          hint={
            <>
              {t('venueAddressHint')}{' '}
              <span className="font-medium text-ink break-all">
                {slug || '…'}.{base}
              </span>
            </>
          }
          value={slug}
          autoCapitalize="none"
          autoComplete="off"
          spellCheck={false}
          onChange={(e) => {
            setSlug(e.target.value.toLowerCase().trim())
            setSlugEdited(true)
            setServerError(null)
          }}
          error={
            serverError ?? (showErrors && !slugOk ? t('slugInvalid') : null)
          }
          required
        />
        <TextField
          label={t('ownerEmail')}
          hint={t('ownerEmailHint')}
          type="email"
          autoComplete="off"
          value={owner}
          onChange={(e) => setOwner(e.target.value)}
          error={showErrors && !ownerOk ? t('emailInvalid') : null}
        />
        <PasswordField
          label={t('venueAdminPassword')}
          value={password}
          onChange={setPassword}
          error={showErrors && !passwordOk ? t('passwordTooShort') : null}
        />
      </form>
    </Dialog>
  )
}

function ResetPassword({
  venue,
  onDone,
}: {
  venue: Venue | null
  onDone: (name: string | null) => void
}) {
  const { t } = useI18n()
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!venue) return
    setPassword(randomPassword())
    setError(null)
  }, [venue])

  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!venue) return
    if (password.length < 8) return setError(t('passwordTooShort'))
    setBusy(true)
    const result = await api(
      `/api/super/venues/${venue.slug}/password`,
      z.unknown(),
      { method: 'PUT', body: { adminPassword: password } },
    )
    setBusy(false)
    if (result.ok) return onDone(venue.name)
    setError(result.message)
  }

  return (
    <Dialog
      open={venue !== null}
      onOpenChange={(open) => !open && onDone(null)}
      title={t('resetPasswordFor', { name: venue?.name ?? '' })}
      description={t('resetPasswordHint')}
      footer={
        <>
          <Button variant="text" onClick={() => onDone(null)}>
            {t('cancel')}
          </Button>
          <Button type="submit" form="reset-password" disabled={busy}>
            {t('save')}
          </Button>
        </>
      }
    >
      <form id="reset-password" onSubmit={submit} noValidate>
        <PasswordField
          label={t('newPassword')}
          value={password}
          onChange={(value) => {
            setPassword(value)
            setError(null)
          }}
          error={error}
        />
      </form>
    </Dialog>
  )
}

function OwnerEmail({
  venue,
  onDone,
}: {
  venue: Venue | null
  onDone: (savedFor: string | null) => void
}) {
  const { t } = useI18n()
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!venue) return
    setEmail(venue.ownerEmail ?? '')
    setError(null)
  }, [venue])

  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!venue) return
    const value = email.trim()
    if (value && !EMAIL_PATTERN.test(value)) return setError(t('emailInvalid'))
    setBusy(true)
    const result = await api(
      `/api/super/venues/${venue.slug}/owner`,
      z.null(),
      { method: 'PUT', body: { ownerEmail: value || null } },
    )
    setBusy(false)
    if (result.ok) return onDone(venue.name)
    setError(result.message)
  }

  return (
    <Dialog
      open={venue !== null}
      onOpenChange={(open) => !open && onDone(null)}
      title={t('ownerEmailFor', { name: venue?.name ?? '' })}
      description={t('ownerEmailHint')}
      footer={
        <>
          <Button variant="text" onClick={() => onDone(null)}>
            {t('cancel')}
          </Button>
          <Button type="submit" form="owner-email" disabled={busy}>
            {t('save')}
          </Button>
        </>
      }
    >
      <form id="owner-email" onSubmit={submit} noValidate>
        <TextField
          label={t('ownerEmail')}
          type="email"
          autoComplete="off"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value)
            setError(null)
          }}
          error={error}
          autoFocus
        />
      </form>
    </Dialog>
  )
}

function RenameVenue({
  venue,
  onDone,
}: {
  venue: Venue | null
  onDone: (savedAs: string | null) => void
}) {
  const { t } = useI18n()
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!venue) return
    setName(venue.name)
    setError(null)
  }, [venue])

  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!venue) return
    const value = name.trim()
    if (!value) return setError(t('required'))
    if (value.length > 60) return
    setBusy(true)
    const result = await api(`/api/super/venues/${venue.slug}/name`, z.null(), {
      method: 'PUT',
      body: { name: value },
    })
    setBusy(false)
    if (result.ok) return onDone(value)
    setError(result.message)
  }

  return (
    <Dialog
      open={venue !== null}
      onOpenChange={(open) => !open && onDone(null)}
      title={t('renameVenueFor', { name: venue?.name ?? '' })}
      description={t('venueNameHint')}
      footer={
        <>
          <Button variant="text" onClick={() => onDone(null)}>
            {t('cancel')}
          </Button>
          <Button type="submit" form="rename-venue" disabled={busy}>
            {t('save')}
          </Button>
        </>
      }
    >
      <form id="rename-venue" onSubmit={submit} noValidate>
        <TextField
          label={t('venueName')}
          value={name}
          max={60}
          onChange={(e) => {
            setName(e.target.value)
            setError(null)
          }}
          error={error}
          autoFocus
        />
      </form>
    </Dialog>
  )
}
