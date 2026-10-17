import { LoaderCircle, RefreshCw } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, Navigate, useSearchParams } from 'react-router'
import { z } from 'zod'
import { LanguageToggle } from '../app-bar'
import { formatTime, useI18n } from '../i18n'
import { api } from '../lib/api'
import {
  CenterNote,
  HOME_BY_ROLE,
  sessionSchema,
  useSession,
} from '../lib/session'
import { stagger } from '../lib/stagger'
import { Button } from '../ui/button'

const POLL_MS = 2_000

const challengeSchema = z.object({
  challengeId: z.string(),
  code: z.string().regex(/^\d{6}$/),
  pollSecret: z.string(),
  expiresAt: z.number(),
})
type Challenge = z.infer<typeof challengeSchema>

const pollResultSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('pending') }),
  sessionSchema.extend({ status: z.literal('approved') }),
])

type State =
  | { status: 'starting' }
  | { status: 'waiting'; challenge: Challenge }
  | { status: 'expired' }
  | { status: 'error'; message: string }

export function EnrollPage() {
  const { state: session } = useSession()
  if (session.status === 'ok') {
    return <Navigate to={HOME_BY_ROLE[session.session.role]} replace />
  }
  if (session.status === 'loading') return null
  if (session.status === 'closed') {
    return <CenterNote>{session.message}</CenterNote>
  }
  return <Pairing />
}

function Pairing() {
  const { t } = useI18n()
  const [params] = useSearchParams()
  const [state, setState] = useState<State>({ status: 'starting' })

  const start = useCallback(async () => {
    setState({ status: 'starting' })
    // Drop a stale or revoked pairing so the new one is the only cookie.
    await api('/api/devices/forget', z.null(), { method: 'POST' })
    const result = await api('/api/devices/enroll/start', challengeSchema, {
      method: 'POST',
    })
    if (result.ok) setState({ status: 'waiting', challenge: result.data })
    else
      setState({
        status: 'error',
        message:
          result.code === 'rate_limited'
            ? t('enrollRateLimited')
            : t('networkError'),
      })
  }, [t])

  // Once per page: StrictMode's double effect or a language switch would
  // otherwise ask for a second code and spend the rate limit.
  const started = useRef(false)
  useEffect(() => {
    if (started.current) return
    started.current = true
    void start()
  }, [start])

  const challenge = state.status === 'waiting' ? state.challenge : null
  useEffect(() => {
    if (!challenge) return
    let stopped = false
    const timer = setInterval(async () => {
      if (Date.now() > challenge.expiresAt) {
        setState({ status: 'expired' })
        return
      }
      const result = await api('/api/devices/enroll/poll', pollResultSchema, {
        body: {
          challengeId: challenge.challengeId,
          pollSecret: challenge.pollSecret,
        },
      })
      if (stopped) return
      if (result.ok && result.data.status === 'approved') {
        // Full load so every page starts from the new cookie.
        window.location.assign(HOME_BY_ROLE[result.data.role])
      } else if (!result.ok && result.status !== 0) {
        setState({ status: 'expired' })
      }
    }, POLL_MS)
    return () => {
      stopped = true
      clearInterval(timer)
    }
  }, [challenge])

  return (
    <main className="grid min-h-dvh grid-rows-[auto_1fr_auto] bg-surface">
      <div className="flex justify-end p-4">
        <LanguageToggle />
      </div>
      <section className="mx-auto grid w-full max-w-2xl content-center justify-items-center gap-8 px-6 text-center">
        <h1 className="text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
          {t('enrollTitle')}
        </h1>
        {params.get('revoked') && (
          <p
            className="rounded-sm bg-ink px-4 py-3 font-medium text-surface"
            role="alert"
          >
            {t('revoked')}
          </p>
        )}

        {state.status === 'starting' && (
          <LoaderCircle
            className="animate-spin"
            size={40}
            aria-label={t('loading')}
          />
        )}

        {state.status === 'waiting' && (
          <>
            <CodeTiles code={state.challenge.code} />
            <p className="max-w-md text-lg text-ink-soft">{t('enrollSteps')}</p>
            <p
              className="flex flex-wrap items-center justify-center gap-2 text-[15px] font-medium"
              role="status"
            >
              <LoaderCircle className="animate-spin" size={18} aria-hidden />
              {t('enrollWaiting')} ·{' '}
              {t('enrollExpires', {
                time: formatTime(state.challenge.expiresAt),
              })}
            </p>
          </>
        )}

        {(state.status === 'expired' || state.status === 'error') && (
          <>
            <p className="text-lg font-medium" role="alert">
              {state.status === 'error' ? state.message : t('enrollExpired')}
            </p>
            <Button
              size="lg"
              icon={<RefreshCw size={20} aria-hidden />}
              onClick={() => void start()}
            >
              {t('enrollNewCode')}
            </Button>
          </>
        )}
      </section>
      <footer className="p-6 text-center">
        <Link
          to="/admin"
          className="text-[15px] font-medium text-ink-soft underline underline-offset-4"
        >
          {t('enrollAdminLink')}
        </Link>
      </footer>
    </main>
  )
}

/** Six digits as two groups of three tiles, readable from across the room. */
function CodeTiles({ code }: { code: string }) {
  const groups = [code.slice(0, 3), code.slice(3)]
  return (
    <p className="flex gap-3 sm:gap-6">
      <span className="sr-only">{code.split('').join(' ')}</span>
      {groups.map((group) => (
        <span
          key={group + groups.indexOf(group)}
          className="flex gap-1.5 sm:gap-2"
          aria-hidden
        >
          {group.split('').map((digit, i) => (
            <span
              // biome-ignore lint/suspicious/noArrayIndexKey: digits repeat and never reorder
              key={i}
              style={stagger(groups.indexOf(group) * 3 + i)}
              className="rise grid h-[min(6rem,18vw)] w-[min(4rem,12.5vw)] place-items-center rounded-md bg-tonal text-[min(3.75rem,11vw)] font-extrabold tabular-nums sm:h-32 sm:w-22 sm:text-7xl"
            >
              {digit}
            </span>
          ))}
        </span>
      ))}
    </p>
  )
}
