import { Link } from 'react-router'
import { useI18n } from '../../i18n'

export function SiteFooter() {
  const { t } = useI18n()
  return (
    <footer className="mx-auto grid max-w-6xl gap-8 px-5 pt-[24svh] pb-6 text-[15px] md:px-10 md:pt-[30svh]">
      <div className="grid gap-2 md:grid-cols-[1fr_auto_1fr] md:items-baseline">
        <span className="text-ink-soft">{t('homeFooterWhat')}</span>
        <nav
          aria-label={t('appName')}
          className="flex flex-wrap gap-x-6 gap-y-2"
        >
          <Link
            to="/how-it-works"
            className="underline-offset-4 hover:underline"
          >
            {t('homeHowShort')}
          </Link>
          <Link to="/pricing" className="underline-offset-4 hover:underline">
            {t('pricingTitle')}
          </Link>
          <Link to="/sign-in" className="underline-offset-4 hover:underline">
            {t('signInTitle')}
          </Link>
        </nav>
        <span className="text-ink-soft md:text-right">
          © 2026 {t('appName')}
        </span>
      </div>
    </footer>
  )
}
