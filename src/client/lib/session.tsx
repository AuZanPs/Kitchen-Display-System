import { type ReactNode, useEffect, useState } from 'react'
import { Navigate } from 'react-router'
import { z } from 'zod'
import { ROLES, type Role } from '../../shared/order'
import { useI18n } from '../i18n'
import { Button } from '../ui/button'
import { api } from './api'

export const sessionSchema = z.object({
  role: z.enum(ROLES),
  label: z.string(),
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
  | { status: 'ok'; session: Session }

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
        else setState({ status: 'error' })
      },
    )
    return () => controller.abort()
  }, [attempt])

  return { state, retry: () => setAttempt((n) => n + 1) }
}

/** Renders the page only for a paired device of role `allow` (or the admin). */
export function RequireRole({
  allow,
  children,
}: {
  allow: Role
  children: (session: Session) => ReactNode
}) {
  const { state, retry } = useSession()
  const { t } = useI18n()
  if (state.status === 'loading') return <CenterNote>{t('loading')}</CenterNote>
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
  return children(session)
}

export function CenterNote({ children }: { children: ReactNode }) {
  return (
    <main className="grid min-h-dvh place-content-center justify-items-center gap-4 p-6 text-center text-lg">
      {children}
    </main>
  )
}
