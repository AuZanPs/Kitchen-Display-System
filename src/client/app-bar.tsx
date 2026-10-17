import type { ReactNode } from 'react'
import { LANGS, useI18n } from './i18n'

export function LanguageToggle() {
  const { lang, setLang, t } = useI18n()
  return (
    <fieldset className="flex rounded-full border border-line p-0.5">
      <legend className="sr-only">{t('language')}</legend>
      {LANGS.map((code) => (
        <label
          key={code}
          className={`grid h-11 min-w-12 cursor-pointer place-items-center rounded-full px-3 text-sm font-semibold uppercase transition-colors duration-150 has-focus-visible:outline-3 has-focus-visible:outline-current ${lang === code ? 'bg-ink text-surface' : ''}`}
        >
          <input
            type="radio"
            name="lang"
            value={code}
            checked={lang === code}
            onChange={() => setLang(code)}
            className="sr-only"
          />
          {code}
        </label>
      ))}
    </fieldset>
  )
}

/** Top bar for tablet, phone and admin pages. */
export function AppBar({
  title,
  device,
  children,
}: {
  title: string
  device?: string
  children?: ReactNode
}) {
  return (
    <header className="sticky top-0 z-30 flex min-h-16 items-center gap-3 border-b border-line bg-surface/95 px-4 backdrop-blur sm:px-6">
      <BrandMark />
      <div className="mr-auto grid leading-tight">
        <h1 className="text-lg font-semibold">{title}</h1>
        {device && <span className="text-[13px] text-ink-soft">{device}</span>}
      </div>
      {children}
      <LanguageToggle />
    </header>
  )
}

/** The Layar Dapur monogram tile. */
export function BrandMark() {
  return (
    <span
      translate="no"
      aria-hidden
      className="grid size-9 shrink-0 place-items-center rounded-sm bg-ink text-[13px] font-extrabold tracking-wider text-surface"
    >
      LD
    </span>
  )
}
