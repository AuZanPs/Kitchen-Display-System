import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
  useState,
} from 'react'
import { z } from 'zod'
import { en } from './en'
import { type Dict, type DictKey, id } from './id'

export type { DictKey }

export const LANGS = ['id', 'en'] as const
export type Lang = (typeof LANGS)[number]

const DICTS: Record<Lang, Dict> = { id, en }
const STORAGE_KEY = 'kds_lang'
const langSchema = z.enum(LANGS)

function storedLang(): Lang {
  try {
    const parsed = langSchema.safeParse(localStorage.getItem(STORAGE_KEY))
    return parsed.success ? parsed.data : 'id'
  } catch {
    return 'id'
  }
}

export type Translate = (
  key: DictKey,
  vars?: Record<string, string | number>,
) => string

type I18n = { lang: Lang; setLang: (lang: Lang) => void; t: Translate }

const I18nContext = createContext<I18n | null>(null)

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(storedLang)

  const setLang = useCallback((next: Lang) => {
    setLangState(next)
    document.documentElement.lang = next
    try {
      localStorage.setItem(STORAGE_KEY, next)
    } catch {
      // Private mode: the choice lasts until reload.
    }
  }, [])

  const value = useMemo<I18n>(() => {
    const dict = DICTS[lang]
    return {
      lang,
      setLang,
      t: (key, vars) =>
        dict[key].replace(/\{(\w+)\}/g, (match, name: string) =>
          vars && name in vars ? String(vars[name]) : match,
        ),
    }
  }, [lang, setLang])

  return <I18nContext value={value}>{children}</I18nContext>
}

export function useI18n(): I18n {
  const value = useContext(I18nContext)
  if (!value) throw new Error('useI18n outside I18nProvider')
  return value
}

const TIME_ZONE = 'Asia/Jakarta'

export function formatTime(at: number, withSeconds = false) {
  return new Date(at).toLocaleTimeString('en-GB', {
    timeZone: TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
    second: withSeconds ? '2-digit' : undefined,
  })
}

/** A `YYYY-MM-DD` service day in the reader's language. */
export function formatDay(day: string, lang: Lang) {
  const date = new Date(`${day}T00:00:00Z`)
  if (Number.isNaN(date.getTime())) return day
  return new Intl.DateTimeFormat(lang, {
    dateStyle: 'medium',
    timeZone: 'UTC',
  }).format(date)
}

const rupiah = new Intl.NumberFormat('id-ID', {
  style: 'currency',
  currency: 'IDR',
  maximumFractionDigits: 0,
})

/** Whole minutes; anything under one reads "< 1 min" rather than "0 min". */
export function formatMinutes(min: number, t: Translate) {
  return min < 1 ? t('underAMinute') : t('minutes', { min })
}

export function formatIdr(amount: number) {
  return rupiah.format(amount)
}
