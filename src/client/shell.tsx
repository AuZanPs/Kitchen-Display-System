import { RefreshCw } from 'lucide-react'
import { useEffect } from 'react'
import { Link, Outlet, useLocation } from 'react-router'
import { type DictKey, useI18n } from './i18n'
import { CenterNote } from './lib/session'
import { Button } from './ui/button'

const TITLES: Record<string, DictKey> = {
  '/enroll': 'enrollTitle',
  '/admin': 'adminTitle',
  '/waiter': 'roleWaiter',
  '/kitchen': 'kitchenTitle',
  '/tv': 'roleTv',
  '/super': 'superTitle',
  '/masuk': 'signInTitle',
  '/akun': 'accountTitle',
}

/** Every route renders inside this: it names the browser tab after the screen. */
export function Shell() {
  const { pathname } = useLocation()
  const { t } = useI18n()
  useEffect(() => {
    const key = TITLES[pathname]
    document.title = key ? `${t(key)} · ${t('appName')}` : t('appName')
  }, [pathname, t])
  return <Outlet />
}

/** A screen crashed: say so plainly and offer the one fix that usually works. */
export function CrashScreen() {
  const { t } = useI18n()
  return (
    <CenterNote>
      <p role="alert">{t('crashed')}</p>
      <Button
        variant="tonal"
        icon={<RefreshCw size={18} aria-hidden />}
        onClick={() => window.location.reload()}
      >
        {t('reload')}
      </Button>
    </CenterNote>
  )
}

export function NotFound() {
  const { t } = useI18n()
  useEffect(() => {
    document.title = `${t('pageNotFound')} · ${t('appName')}`
  }, [t])
  return (
    <CenterNote>
      <p>{t('pageNotFound')}</p>
      <Link
        to="/"
        className="state inline-flex min-h-12 items-center rounded-full px-6 font-semibold [--bg:var(--color-tonal)]"
      >
        {t('backHome')}
      </Link>
    </CenterNote>
  )
}
