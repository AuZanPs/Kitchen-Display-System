import { type ReactNode, useEffect, useState } from 'react'
import { Navigate } from 'react-router'
import { z } from 'zod'
import { ROLES, type Role } from '../../shared/order'
import { staffMemberSchema } from '../../shared/staff'
import { useI18n } from '../i18n'
import { Button } from '../ui/button'
import { api, PIN_REQUIRED_EVENT } from './api'

export const sessionSchema = z.object({
  role: z.enum(ROLES),
  label: z.string(),
  staff: staffMemberSchema.nullable().default(null),
})
export type Session = z.infer<typeof sessionSchema>

export const HOME_BY_ROLE: Record<Role, string> = {
  waiter: '/waiter',
  kitchen: '/kitchen',
  tv: '/tv',
  manager: '/admin',
}

type State =
  | { status: 'loading' }
  | { status: 'none' }
  | { status: 'error' }
  /** The dapur is switched off or does not exist; the server says which. */
  | { status: 'closed'; message: string }
  | { status: 'ok'; session: Session }

const placeSchema = z.object({
  kind: z.enum(['site', 'venue', 'console', 'unknown']),
})

/** What this host is: the public site, a dapur, or the console. */
export function usePlace() {
  const [kind, setKind] = useState<z.infer<typeof placeSchema>['kind'] | null>(
    null,
  )
  useEffect(() => {
    void api('/api/place', placeSchema).then((r) =>
      setKind(r.ok ? r.data.kind : 'venue'),
    )
  }, [])
  return kind
}

export function useSession() {
  const [state, setState] = useState<State>({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)

  // biome-ignore lint/correctness/useExhaustiveDependencies: `attempt` re-runs the check on retry
  useEffect(() => {
    const controller = new AbortController()
    void api('/api/session', sessionSchema, { signal: controller.signal }).then(
      (result) => {
        if (controller.signal.aborted) return
        if (result.ok) setState({ status: 'ok', session: result.data })
        else if (result.status === 401) setState({ status: 'none' })
        else if (result.status === 403 || result.status === 404) {
          setState({ status: 'closed', message: result.message })
        } else setState({ status: 'error' })
      },
    )
    return () => controller.abort()
  }, [attempt])

  useEffect(() => {
    const recheck = () => setAttempt((n) => n + 1)
    window.addEventListener(PIN_REQUIRED_EVENT, recheck)
    return () => window.removeEventListener(PIN_REQUIRED_EVENT, recheck)
  }, [])

  return { state, retry: () => setAttempt((n) => n + 1) }
}

/** Renders the page only for a paired device of role `allow` (or the admin). */
export function RequireRole({
  allow,
  children,
}: {
  allow: Role
  children: (session: Session, refresh: () => void) => ReactNode
}) {
  const { state, retry } = useSession()
  const { t } = useI18n()
  // A re-check keeps the page mounted; only the first load shows a note.
  const [last, setLast] = useState<Session | null>(null)
  useEffect(() => {
    if (state.status === 'ok') setLast(state.session)
  }, [state])
  if (state.status === 'loading' && last) return children(last, retry)
  if (state.status === 'loading') return <CenterNote>{t('loading')}</CenterNote>
  if (state.status === 'closed') return <CenterNote>{state.message}</CenterNote>
  if (state.status === 'error') {
    return (
      <CenterNote>
        <span>{t('networkError')}</span>
        <Button variant="tonal" onClick={retry}>
          {t('retry')}
        </Button>
      </CenterNote>
    )
  }
  if (state.status === 'none') return <Navigate to="/enroll" replace />
  const { session } = state
  if (session.role !== allow && session.role !== 'manager') {
    return <Navigate to={HOME_BY_ROLE[session.role]} replace />
  }
  return children(session, retry)
}

export function CenterNote({ children }: { children: ReactNode }) {
  return (
    <main className="grid min-h-dvh place-content-center justify-items-center gap-4 p-6 text-center text-lg">
      {children}
    </main>
  )
}
