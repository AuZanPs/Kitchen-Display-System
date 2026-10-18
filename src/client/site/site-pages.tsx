import {
  ChefHat,
  ExternalLink,
  LogIn,
  LogOut,
  MonitorPlay,
  Tablet,
} from 'lucide-react'
import { type SubmitEvent, useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { z } from 'zod'
import { BrandMark, LanguageToggle } from '../app-bar'
import { useI18n } from '../i18n'
import { api } from '../lib/api'
import { CenterNote } from '../lib/session'
import { stagger } from '../lib/stagger'
import { Monogram } from '../staff-sign-in'
import { Button } from '../ui/button'
import { TextField } from '../ui/text-field'

const accountSchema = z.object({
  email: z.string(),
  venues: z.array(
    z.object({ slug: z.string(), name: z.string(), disabled: z.boolean() }),
  ),
})

function SiteBar({ children }: { children?: React.ReactNode }) {
  const { t } = useI18n()
  return (
    <header className="mx-auto flex w-full max-w-5xl items-center gap-3 px-4 py-4 sm:px-6">
      <Link
        to="/"
        translate="no"
        className="mr-auto flex items-center gap-3 text-lg font-semibold"
      >
        <BrandMark />
        {t('appName')}
      </Link>
      {children}
      <LanguageToggle />
    </header>
  )
}

/** The bare domain's front page. A placeholder until the real homepage is designed. */
export function SiteHome() {
  const { t } = useI18n()
  const points = [
    { icon: Tablet, text: t('sitePointWaiter') },
    { icon: MonitorPlay, text: t('sitePointTv') },
    { icon: ChefHat, text: t('sitePointKitchen') },
  ]
  return (
    <div className="min-h-dvh bg-surface">
      <SiteBar>
        <Link
          to="/masuk"
          className="state hidden min-h-12 items-center gap-2 rounded-full px-5 text-[15px] font-semibold sm:inline-flex"
        >
          <LogIn size={18} aria-hidden />
          {t('signInTitle')}
        </Link>
      </SiteBar>
      <main className="rise mx-auto grid max-w-5xl gap-10 px-4 pt-10 pb-16 sm:px-6 sm:pt-20">
        <div className="grid max-w-2xl gap-5">
          <h1 className="text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
            {t('siteHeadline')}
          </h1>
          <p className="text-lg text-ink-soft">{t('siteLead')}</p>
          <div>
            <Link
              to="/masuk"
              className="state inline-flex min-h-14 items-center gap-3 rounded-full px-8 text-lg font-semibold text-surface [--bg:var(--color-ink)] [--on:var(--color-surface)]"
            >
              <LogIn size={20} aria-hidden />
              {t('signInTitle')}
            </Link>
          </div>
        </div>
        <ul className="grid gap-3 sm:grid-cols-3">
          {points.map(({ icon: Icon, text }, index) => (
            <li
              key={text}
              style={stagger(index)}
              className="rise flex items-start gap-3 rounded-md bg-wash p-5 text-[15px]"
            >
              <Icon size={22} className="mt-0.5 shrink-0" aria-hidden />
              {text}
            </li>
          ))}
        </ul>
      </main>
    </div>
  )
}

/** Email in, sign-in link out; the link comes back here with `#token=`. */
export function SignInPage() {
  const { t } = useI18n()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState<{ email: string; devLink?: string } | null>(
    null,
  )
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [verifying, setVerifying] = useState(false)
  const started = useRef(false)

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
          if (result.ok) navigate('/akun', { replace: true })
          else setError(result.message)
        },
      )
    }
    verify()
    window.addEventListener('hashchange', verify)
    return () => window.removeEventListener('hashchange', verify)
  }, [navigate])

  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    const result = await api(
      '/api/site/login/start',
      z.object({ devLink: z.string().optional() }),
      { body: { email: email.trim() } },
    )
    setBusy(false)
    if (result.ok)
      setSent({ email: email.trim(), devLink: result.data.devLink })
    else setError(result.status === 422 ? t('emailInvalid') : result.message)
  }

  if (verifying) return <CenterNote>{t('signingIn')}</CenterNote>

  return (
    <div className="grid min-h-dvh grid-rows-[auto_1fr] bg-surface">
      <SiteBar />
      <main className="grid place-items-center px-4 pb-16">
        {sent ? (
          <div className="rise grid w-[min(26rem,100%)] gap-4">
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
          <form
            onSubmit={submit}
            className="rise grid w-[min(26rem,100%)] gap-6"
            noValidate
          >
            <div className="grid gap-2">
              <h1 className="text-4xl font-semibold tracking-tight">
                {t('signInTitle')}
              </h1>
              <p className="text-ink-soft">{t('signInLead')}</p>
            </div>
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
            <Button
              type="submit"
              size="lg"
              disabled={busy || email.trim() === ''}
            >
              {t('sendLink')}
            </Button>
          </form>
        )}
      </main>
    </div>
  )
}

/** The signed-in owner's dapur; each opens its admin without another password. */
export function AccountPage() {
  const { t } = useI18n()
  const navigate = useNavigate()
  const [account, setAccount] = useState<z.infer<typeof accountSchema> | null>(
    null,
  )
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void api('/api/site/session', accountSchema).then((result) => {
      if (result.ok) setAccount(result.data)
      else if (result.status === 401) navigate('/masuk', { replace: true })
      else setError(t('networkError'))
    })
  }, [navigate, t])

  async function open(slug: string) {
    const result = await api(
      '/api/site/handoff',
      z.object({ url: z.string() }),
      { body: { slug } },
    )
    if (result.ok) window.location.assign(result.data.url)
    else setError(result.message)
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
        <Button
          variant="text"
          icon={<LogOut size={18} aria-hidden />}
          aria-label={t('signOut')}
          onClick={() => void signOut()}
        >
          <span className="hidden sm:inline">{t('signOut')}</span>
        </Button>
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
        {account && account.venues.length === 0 && (
          <p className="text-ink-soft">{t('noVenuesYet')}</p>
        )}
        <ul className="grid max-w-3xl gap-3">
          {account?.venues.map((venue, index) => (
            <li
              key={venue.slug}
              style={stagger(index)}
              className={`rise flex flex-wrap items-center gap-4 rounded-md p-4 sm:p-5 ${venue.disabled ? 'border border-line' : 'bg-wash'}`}
            >
              <Monogram name={venue.name} muted={venue.disabled} />
              <div className="grid min-w-0 flex-1 gap-0.5">
                <span className="text-lg font-medium break-words">
                  {venue.name}
                </span>
                <span className="text-[13px] text-ink-soft">
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
    </div>
  )
}
