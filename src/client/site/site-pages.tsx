import { Check, ExternalLink, Plus, ShieldCheck, X } from 'lucide-react'
import {
  type ReactNode,
  type SubmitEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react'
import { Link, useNavigate } from 'react-router'
import { z } from 'zod'
import {
  accountSchema,
  isVenueSlug,
  ownerEmailSchema,
  VENUE_LIMITS,
} from '../../shared/venue'
import { BrandMark, LanguageToggle, SignOutButton } from '../app-bar'
import { useI18n } from '../i18n'
import { api } from '../lib/api'
import { localizeError } from '../lib/commands'
import { CenterNote } from '../lib/session'
import { stagger } from '../lib/stagger'
import { Monogram } from '../staff-sign-in'
import { Button, IconButton } from '../ui/button'
import { useSnackbar } from '../ui/snackbar'
import { TextField } from '../ui/text-field'

export function SiteBar({ children }: { children?: ReactNode }) {
  const { t } = useI18n()
  return (
    <header className="mx-auto flex w-full max-w-5xl items-center gap-2 px-4 py-4 sm:gap-3 sm:px-6">
      <Link
        to="/"
        translate="no"
        className="mr-auto flex items-center gap-2 text-lg font-semibold whitespace-nowrap sm:gap-3"
      >
        <BrandMark />
        {/* Room for the sign-out button on the smallest phones. */}
        <span className={children ? 'max-[399px]:sr-only' : undefined}>
          {t('appName')}
        </span>
      </Link>
      <Link
        to="/how-it-works"
        className="state inline-flex min-h-11 items-center rounded-full px-2.5 text-[15px] font-semibold max-[479px]:hidden sm:px-3"
      >
        {t('homeHowShort')}
      </Link>
      <Link
        to="/pricing"
        className="state inline-flex min-h-11 items-center rounded-full px-2.5 text-[15px] font-semibold max-[359px]:hidden sm:px-3"
      >
        {t('pricingTitle')}
      </Link>
      {children}
      <LanguageToggle />
    </header>
  )
}

const authConfigSchema = z.object({
  googleEnabled: z.boolean(),
  turnstileSiteKey: z.string().nullable(),
})

/** Email in, sign-in link out; the link comes back here with `#token=`. Also supports Google OAuth. */
export function SignInPage() {
  const { lang, t } = useI18n()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState<{ email: string; devLink?: string } | null>(
    null,
  )
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [verifying, setVerifying] = useState(false)
  const [authConfig, setAuthConfig] = useState<{
    googleEnabled: boolean
    turnstileSiteKey: string | null
  } | null>(null)
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null)
  const turnstileRef = useRef<HTMLDivElement>(null)
  const started = useRef(false)

  useEffect(() => {
    void api('/api/site/auth/config', authConfigSchema).then((res) => {
      if (res.ok) setAuthConfig(res.data)
    })
  }, [])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const err = params.get('error')
    if (!err) return
    window.history.replaceState(
      null,
      '',
      `${window.location.pathname}${window.location.hash}`,
    )
    if (err === 'google_not_configured') setError(t('googleNotConfigured'))
    else if (err === 'rate_limited')
      setError(localizeError('Too many requests. Wait 15 minutes.', lang))
    else setError(t('googleFailed'))
  }, [lang, t])

  useEffect(() => {
    const siteKey = authConfig?.turnstileSiteKey
    const container = turnstileRef.current
    if (!siteKey || !container) return
    const key: string = siteKey
    const el: HTMLElement = container
    let widgetId: string | null = null
    const win = window as unknown as {
      turnstile?: {
        render: (
          target: HTMLElement,
          opts: {
            sitekey: string
            callback: (token: string) => void
            'expired-callback': () => void
          },
        ) => string
        remove: (id: string) => void
      }
    }
    function mount() {
      if (!win.turnstile) return
      widgetId = win.turnstile.render(el, {
        sitekey: key,
        callback: (token) => setTurnstileToken(token),
        'expired-callback': () => setTurnstileToken(null),
      })
    }
    if (win.turnstile) {
      mount()
    } else {
      const script = document.createElement('script')
      script.src =
        'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
      script.async = true
      script.onload = mount
      document.head.appendChild(script)
    }
    return () => {
      if (widgetId && win.turnstile) win.turnstile.remove(widgetId)
    }
  }, [authConfig?.turnstileSiteKey])

  // Opening the emailed link signs in once; the token never stays in the address bar.
  // Also when the link opens in this same tab, which only changes the hash.
  useEffect(() => {
    function verify() {
      const token = new URLSearchParams(window.location.hash.slice(1)).get(
        'token',
      )
      if (!token || started.current) return
      started.current = true
      window.history.replaceState(null, '', window.location.pathname)
      setVerifying(true)
      void api('/api/site/login/verify', z.null(), { body: { token } }).then(
        (result) => {
          started.current = false
          setVerifying(false)
          if (result.ok) navigate('/account', { replace: true })
          else setError(localizeError(result.message, lang))
        },
      )
    }
    verify()
    window.addEventListener('hashchange', verify)
    return () => window.removeEventListener('hashchange', verify)
  }, [lang, navigate])

  function handleGoogle() {
    setError(null)
    if (authConfig && !authConfig.googleEnabled) {
      setError(t('googleNotConfigured'))
      return
    }
    window.location.assign('/api/site/auth/google')
  }

  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    const result = await api(
      '/api/site/login/start',
      z.object({ devLink: z.string().optional() }),
      {
        body: {
          email: email.trim(),
          lang,
          ...(turnstileToken ? { turnstileToken } : {}),
        },
      },
    )
    setBusy(false)
    if (result.ok)
      setSent({ email: email.trim(), devLink: result.data.devLink })
    else
      setError(
        result.status === 422
          ? t('emailInvalid')
          : localizeError(result.message, lang),
      )
  }

  if (verifying) return <CenterNote>{t('signingIn')}</CenterNote>

  return (
    <div className="grid min-h-dvh grid-rows-[auto_1fr] bg-surface">
      <SiteBar />
      <main className="grid place-items-center px-4 pb-16">
        {sent ? (
          <div className="rise grid w-[min(28rem,100%)] gap-4 rounded-lg bg-wash p-6 sm:p-8">
            <h1 className="text-3xl font-semibold tracking-tight">
              {t('linkSentTitle')}
            </h1>
            <p className="text-ink-soft">
              {t('linkSentBody', { email: sent.email })}
            </p>
            {sent.devLink && (
              <a
                href={sent.devLink}
                className="state inline-flex min-h-12 w-fit items-center gap-2 rounded-full px-5 font-semibold [--bg:var(--color-tonal)]"
              >
                <ExternalLink size={18} aria-hidden />
                {t('openDevLink')}
              </a>
            )}
            <Button
              variant="text"
              className="w-fit"
              onClick={() => {
                setSent(null)
                setError(null)
              }}
            >
              {t('useOtherEmail')}
            </Button>
          </div>
        ) : (
          <div className="rise grid w-[min(28rem,100%)] gap-5 rounded-lg bg-wash p-6 sm:p-8">
            <div className="grid gap-2">
              <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
                {t('signInTitle')}
              </h1>
              <p className="text-[15px] leading-relaxed text-ink-soft">
                {t('signInLead')}
              </p>
            </div>

            <button
              type="button"
              onClick={handleGoogle}
              className="state flex min-h-12 w-full items-center justify-center gap-3 rounded-full border border-line px-5 text-[15px] font-semibold text-ink transition-[background-color,scale] duration-150 active:scale-[0.98] [--bg:var(--color-surface)]"
            >
              <GoogleIcon />
              <span>{t('continueWithGoogle')}</span>
            </button>

            <div className="flex items-center gap-3 text-[13px] text-ink-soft">
              <span aria-hidden className="h-px flex-1 bg-line" />
              <span>{t('orWithEmail')}</span>
              <span aria-hidden className="h-px flex-1 bg-line" />
            </div>

            <form onSubmit={submit} className="grid gap-4" noValidate>
              <TextField
                label={t('email')}
                type="email"
                autoComplete="email"
                inputMode="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value)
                  setError(null)
                }}
                error={error}
                required
                autoFocus
              />

              {authConfig?.turnstileSiteKey ? (
                <div ref={turnstileRef} className="min-h-[65px]" />
              ) : (
                <div className="flex items-center justify-between gap-2 rounded-sm border border-line bg-surface px-3.5 py-2.5 text-[13px]">
                  <span className="flex items-center gap-2 font-medium">
                    <span
                      aria-hidden
                      className="grid size-5 shrink-0 place-items-center rounded-full bg-ink text-surface"
                    >
                      <Check size={13} strokeWidth={3} />
                    </span>
                    {t('cfSecurityPassed')}
                  </span>
                  <span className="flex items-center gap-1 text-[12px] text-ink-soft">
                    <ShieldCheck size={15} aria-hidden />
                    {t('cfProtected')}
                  </span>
                </div>
              )}

              <Button
                type="submit"
                size="lg"
                disabled={
                  busy ||
                  email.trim() === '' ||
                  Boolean(authConfig?.turnstileSiteKey && !turnstileToken)
                }
              >
                {t('sendLink')}
              </Button>
            </form>
          </div>
        )}
      </main>
    </div>
  )
}

function GoogleIcon() {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className="size-5 shrink-0">
      <path
        fill="#4285F4"
        d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.47c-.29 1.48-1.14 2.73-2.4 3.58v3h3.86c2.26-2.09 3.56-5.17 3.56-8.82Z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96H1.29v3.09C3.26 21.3 7.31 24 12 24Z"
      />
      <path
        fill="#FBBC05"
        d="M5.27 14.29c-.25-.72-.38-1.49-.38-2.29s.13-1.57.38-2.29V6.62H1.29a11.99 11.99 0 0 0 0 10.76l3.98-3.09Z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.98 3.09c.95-2.85 3.6-4.96 6.73-4.96Z"
      />
    </svg>
  )
}

/** The signed-in owner's dapur; each opens its admin without another password. */
export function AccountPage() {
  const { lang, t } = useI18n()
  const navigate = useNavigate()
  const [account, setAccount] = useState<z.infer<typeof accountSchema> | null>(
    null,
  )
  const [error, setError] = useState<string | null>(null)
  const snackbar = useSnackbar()

  const load = useCallback(async () => {
    const result = await api('/api/site/session', accountSchema)
    if (result.ok) setAccount(result.data)
    else if (result.status === 401) navigate('/sign-in', { replace: true })
    else setError(t('networkError'))
  }, [navigate, t])

  useEffect(() => {
    void load()
  }, [load])

  async function open(slug: string) {
    const result = await api(
      '/api/site/handoff',
      z.object({ url: z.string() }),
      { body: { slug } },
    )
    if (result.ok) window.location.assign(result.data.url)
    else setError(localizeError(result.message, lang))
  }

  async function signOut(everywhere = false) {
    await api(
      everywhere ? '/api/site/logout-everywhere' : '/api/site/logout',
      z.null(),
      { body: {} },
    )
    navigate('/', { replace: true })
  }

  return (
    <div className="min-h-dvh bg-surface pb-16">
      <SiteBar>
        <SignOutButton onClick={() => void signOut()} />
      </SiteBar>
      <main className="rise mx-auto grid max-w-5xl gap-6 px-4 pt-6 sm:px-6">
        <div className="grid gap-1">
          <h1 className="text-3xl font-semibold tracking-tight">
            {t('accountTitle')}
          </h1>
          {account && (
            <p className="break-all text-ink-soft">{account.email}</p>
          )}
        </div>
        {error && (
          <p role="alert" className="font-medium">
            {error}
          </p>
        )}
        {account &&
          account.venues.filter((v) => v.role === 'owner').length <
            VENUE_LIMITS.ownedVenues && (
            <CreateVenue
              first={account.venues.length === 0}
              onCreated={(slug, name) => {
                snackbar.show(t('siteVenueCreated', { name }))
                void load()
                void open(slug)
              }}
            />
          )}
        <ul className="grid max-w-3xl gap-3">
          {account?.venues.map((venue, index) => (
            <li
              key={venue.slug}
              style={stagger(index)}
              className={`rise flex flex-wrap items-center gap-4 rounded-md p-4 sm:p-5 ${venue.disabled ? 'border border-line' : 'bg-wash'}`}
            >
              <Monogram name={venue.name} muted={venue.disabled} />
              <div className="grid min-w-40 flex-1 gap-0.5">
                <span className="flex flex-wrap items-center gap-x-2 text-lg font-medium break-words">
                  {venue.name}
                  {venue.role === 'admin' && (
                    <span className="rounded-full bg-tonal px-2.5 py-0.5 text-[13px] font-semibold">
                      {t('invitedAdmin')}
                    </span>
                  )}
                </span>
                <span className="text-[13px] wrap-anywhere text-ink-soft">
                  {venue.disabled
                    ? t('venueIsOff')
                    : `${venue.slug}.${window.location.host.replace(/^www\./, '')}`}
                </span>
              </div>
              {!venue.disabled && (
                <Button
                  icon={<ExternalLink size={18} aria-hidden />}
                  onClick={() => void open(venue.slug)}
                >
                  {t('openAdmin')}
                </Button>
              )}
              {venue.role === 'owner' && !venue.disabled && (
                <InvitedAdmins
                  slug={venue.slug}
                  admins={venue.admins}
                  onChanged={(message) => {
                    snackbar.show(message)
                    void load()
                  }}
                />
              )}
            </li>
          ))}
        </ul>
        {account && (
          <div className="grid max-w-3xl gap-2 border-t border-line pt-6">
            <p className="text-[15px] text-ink-soft">
              {t('signOutEverywhereHint')}
            </p>
            <Button
              variant="outlined"
              className="w-fit"
              onClick={() => void signOut(true)}
            >
              {t('signOutEverywhere')}
            </Button>
          </div>
        )}
      </main>
      {snackbar.node}
    </div>
  )
}

/** The owner's list of invited admins, with add and remove. */
function InvitedAdmins({
  slug,
  admins,
  onChanged,
}: {
  slug: string
  admins: string[]
  onChanged: (message: string) => void
}) {
  const { lang, t } = useI18n()
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function add(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    const parsed = ownerEmailSchema.safeParse(email.trim())
    if (!parsed.success) return setError(t('emailInvalid'))
    setBusy(true)
    const result = await api(`/api/site/venues/${slug}/admins`, z.null(), {
      body: { email: parsed.data },
    })
    setBusy(false)
    if (!result.ok) return setError(localizeError(result.message, lang))
    setEmail('')
    onChanged(t('adminAdded', { email: parsed.data }))
  }

  async function remove(target: string) {
    const result = await api(
      `/api/site/venues/${slug}/admins/remove`,
      z.null(),
      {
        body: { email: target },
      },
    )
    if (result.ok) onChanged(t('adminRemoved', { email: target }))
    else setError(localizeError(result.message, lang))
  }

  return (
    <div className="grid basis-full gap-3 border-t border-line pt-4">
      <div className="grid gap-0.5">
        <h2 className="font-medium">{t('otherAdmins')}</h2>
        <p className="text-[13px] text-ink-soft">{t('otherAdminsHint')}</p>
      </div>
      {admins.length > 0 && (
        <ul className="grid">
          {admins.map((admin) => (
            <li key={admin} className="flex items-center gap-2">
              <span className="min-w-0 flex-1 text-[15px] wrap-anywhere">
                {admin}
              </span>
              <IconButton
                label={t('removeAdmin', { email: admin })}
                onClick={() => void remove(admin)}
              >
                <X size={18} aria-hidden />
              </IconButton>
            </li>
          ))}
        </ul>
      )}
      {admins.length < VENUE_LIMITS.invitedAdmins && (
        <form onSubmit={add} noValidate className="grid gap-2 sm:max-w-md">
          <TextField
            label={t('email')}
            type="email"
            autoComplete="off"
            inputMode="email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value)
              setError(null)
            }}
            error={error}
          />
          <Button
            type="submit"
            variant="tonal"
            className="w-fit"
            disabled={busy || email.trim() === ''}
          >
            {t('addAdmin')}
          </Button>
        </form>
      )}
    </div>
  )
}

/** "Warung Bu Siti" becomes "warung-bu-siti". */
function slugFrom(name: string) {
  return name
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+/, '')
    .slice(0, 30)
    .replace(/-+$/, '')
}

const createdSchema = z.object({ slug: z.string(), name: z.string() })

/** An owner creates a dapur: name, address and an admin password for staff devices. */
function CreateVenue({
  first,
  onCreated,
}: {
  first: boolean
  onCreated: (slug: string, name: string) => void
}) {
  const { lang, t } = useI18n()
  const [open, setOpen] = useState(first)
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [slugTouched, setSlugTouched] = useState(false)
  const [password, setPassword] = useState('')
  const [tried, setTried] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const host = window.location.host.replace(/^www\./, '')
  const address = slugTouched ? slug : slugFrom(name)

  const nameError = tried && name.trim() === '' ? t('fieldRequired') : null
  const slugError = tried && !isVenueSlug(address) ? t('slugInvalid') : null
  const passwordError =
    tried && password.length < VENUE_LIMITS.passwordMin
      ? t('passwordTooShort')
      : null

  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    setTried(true)
    setError(null)
    if (
      name.trim() === '' ||
      name.length > VENUE_LIMITS.name ||
      !isVenueSlug(address) ||
      password.length < VENUE_LIMITS.passwordMin
    ) {
      return
    }
    setBusy(true)
    const result = await api('/api/site/venues', createdSchema, {
      body: { name: name.trim(), slug: address, adminPassword: password },
    })
    setBusy(false)
    if (!result.ok) return setError(localizeError(result.message, lang))
    onCreated(result.data.slug, result.data.name)
  }

  if (!open) {
    return (
      <Button
        variant="tonal"
        className="w-fit"
        icon={<Plus size={18} aria-hidden />}
        onClick={() => setOpen(true)}
      >
        {t('siteCreateVenue')}
      </Button>
    )
  }

  return (
    <form
      onSubmit={submit}
      noValidate
      className="rise grid max-w-3xl gap-4 rounded-lg bg-wash p-5 sm:p-6"
    >
      {first && (
        <ol className="flex flex-wrap items-center gap-2 border-b border-line pb-4 text-[13px] font-medium">
          <li className="flex items-center gap-2 rounded-full bg-surface px-3 py-1.5 font-semibold text-ink">
            <span className="grid size-5 place-items-center rounded-full bg-ink text-[11px] font-semibold text-surface tabular-nums">
              1
            </span>
            {t('stepCreateVenue')}
          </li>
          <li className="flex items-center gap-2 rounded-full px-3 py-1.5 text-ink-soft">
            <span className="grid size-5 place-items-center rounded-full bg-tonal text-[11px] font-semibold text-ink tabular-nums">
              2
            </span>
            {t('stepSetupMenu')}
          </li>
          <li className="flex items-center gap-2 rounded-full px-3 py-1.5 text-ink-soft">
            <span className="grid size-5 place-items-center rounded-full bg-tonal text-[11px] font-semibold text-ink tabular-nums">
              3
            </span>
            {t('stepPairScreens')}
          </li>
        </ol>
      )}
      <div className="grid gap-1">
        <h2 className="text-xl font-medium">
          {first ? t('createFirstVenue') : t('siteCreateVenue')}
        </h2>
        <p className="text-[15px] text-ink-soft">{t('createVenueLead')}</p>
      </div>
      <div className="grid gap-x-4 sm:grid-cols-2">
        <TextField
          label={t('venueName')}
          max={VENUE_LIMITS.name}
          autoComplete="organization"
          value={name}
          onChange={(e) => setName(e.target.value)}
          error={nameError}
          autoFocus={first}
        />
        <TextField
          label={t('venueAddress')}
          hint={
            <span className="wrap-anywhere">
              {address === '' ? t('venueAddressHint') : `${address}.${host}`}
            </span>
          }
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          value={address}
          onChange={(e) => {
            setSlugTouched(true)
            setSlug(
              e.target.value
                .toLowerCase()
                .replace(/[^a-z0-9-]/g, '')
                .slice(0, 30),
            )
          }}
          error={slugError}
        />
      </div>
      <TextField
        label={t('venueAdminPassword')}
        hint={t('siteAdminPasswordHint')}
        type="password"
        autoComplete="new-password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        error={passwordError}
      />
      {error && (
        <p role="alert" className="font-medium">
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={busy}>
          {busy ? t('creatingVenue') : t('createVenueAction')}
        </Button>
        {!first && (
          <Button variant="text" onClick={() => setOpen(false)}>
            {t('cancel')}
          </Button>
        )}
      </div>
    </form>
  )
}
