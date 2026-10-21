import { Link } from 'react-router'
import { useI18n } from '../../i18n'

export function SiteFooter() {
  const { t } = useI18n()
  const credit = (
    title: string,
    href: string,
    by: string,
    licence: string,
    licenceHref: string,
  ) => (
    <>
      <a className="underline underline-offset-4" href={href}>
        “{title}”
      </a>{' '}
      {t('homeBy')} {by},{' '}
      <a className="underline underline-offset-4" href={licenceHref}>
        {licence}
      </a>
    </>
  )
  return (
    <footer className="mx-auto grid max-w-6xl gap-8 px-5 pt-[24svh] pb-6 text-[15px] md:px-10 md:pt-[30svh]">
      <p className="max-w-[80ch] text-ink">
        {t('homePhotos')}:{' '}
        {credit(
          'Sate ayam-Jakarta',
          'https://commons.wikimedia.org/wiki/File:Sate_ayam-Jakarta.JPG',
          'Lord Mountbatten',
          'CC BY-SA 4.0',
          'https://creativecommons.org/licenses/by-sa/4.0',
        )}{' '}
        ({t('homeCropped')});{' '}
        {credit(
          'Malang Food Warungs',
          'https://commons.wikimedia.org/wiki/File:Malang_Food_Warungs.jpg',
          'Hugo van den Bos',
          'CC BY 2.0',
          'https://creativecommons.org/licenses/by/2.0',
        )}
        . {t('homeVia')}
      </p>
      <div className="grid gap-2 md:grid-cols-[1fr_auto_1fr] md:items-baseline">
        <span className="text-ink-soft">{t('homeFooterWhat')}</span>
        <nav aria-label={t('appName')} className="flex gap-6">
          <a href="#cara-kerja" className="underline-offset-4 hover:underline">
            {t('homeHowShort')}
          </a>
          <Link to="/masuk" className="underline-offset-4 hover:underline">
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
