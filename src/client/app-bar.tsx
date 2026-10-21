import { LogOut } from 'lucide-react'
import type { ReactNode } from 'react'
import { LANGS, useI18n } from './i18n'
import { Button } from './ui/button'

/** `onInk` swaps the colours for a charcoal ground. */
export function LanguageToggle({ onInk = false }: { onInk?: boolean }) {
  const { lang, setLang, t } = useI18n()
  const selected = onInk ? 'bg-surface text-ink' : 'bg-ink text-surface'
  return (
    <fieldset
      className={`flex rounded-full border p-0.5 ${onInk ? 'border-on-ink-soft' : 'border-line'}`}
    >
      <legend className="sr-only">{t('language')}</legend>
      {LANGS.map((code) => (
        <label
          key={code}
          className={`grid h-11 min-w-12 cursor-pointer place-items-center rounded-full px-3 text-sm font-semibold uppercase transition-colors duration-150 has-focus-visible:outline-3 has-focus-visible:outline-current ${lang === code ? selected : ''}`}
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
    <header className="sticky top-0 z-30 flex min-h-16 items-center gap-2 border-b border-line bg-surface/95 px-4 backdrop-blur sm:gap-3 sm:px-6">
      <BrandMark />
      <div className="mr-auto grid min-w-0 leading-tight">
        <h1 className="text-base font-semibold text-balance sm:text-lg">
          {title}
        </h1>
        {device && <span className="text-[13px] text-ink-soft">{device}</span>}
      </div>
      {children}
      <LanguageToggle />
    </header>
  )
}

/** Sign-out for a bar; phones keep only the icon. */
export function SignOutButton({ onClick }: { onClick: () => void }) {
  const { t } = useI18n()
  return (
    <Button
      variant="text"
      icon={<LogOut size={18} aria-hidden />}
      aria-label={t('signOut')}
      onClick={onClick}
    >
      <span className="hidden sm:inline">{t('signOut')}</span>
    </Button>
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
