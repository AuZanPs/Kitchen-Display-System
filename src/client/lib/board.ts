import type { BoardOrder } from '../../shared/board'
import type { MenuItem } from '../../shared/menu'
import type { Lang, Translate } from '../i18n'
import type { TicketLine } from '../ticket'

const MENU_PAIRS: readonly [en: string, id: string][] = [
  ['Food', 'Makanan'],
  ['Snacks', 'Camilan'],
  ['Drinks', 'Minuman'],
  ['Spice level', 'Level pedas'],
  ['Not spicy', 'Tidak pedas'],
  ['Medium spicy', 'Pedas sedang'],
  ['Extra spicy', 'Extra pedas'],
  ['Extra spicy', 'Ekstra pedas'],
  ['Add-ons', 'Tambahan'],
  ['Fried egg', 'Telur ceplok'],
  ['No onions', 'Tanpa bawang'],
  ['Sambal on the side', 'Sambal terpisah'],
  ['No sambal', 'Tanpa sambal'],
  ['Rice', 'Nasi'],
  ['Half rice', 'Nasi setengah'],
  ['Extra rice', 'Tambah nasi'],
  ['Sauce', 'Saus'],
  ['Sauce on the side', 'Saus terpisah'],
  ['No sauce', 'Tanpa saus'],
  ['Rice cake', 'Lontong'],
  ['No rice cake', 'Tanpa lontong'],
  ['No celery', 'Tanpa seledri'],
  ['Boiled egg', 'Telur rebus'],
  ['Sugar', 'Gula'],
  ['Normal sugar', 'Gula normal'],
  ['Less sugar', 'Sedikit gula'],
  ['No sugar', 'Tanpa gula'],
  ['Ice', 'Es'],
  ['No ice', 'Tanpa es'],
  ['Temperature', 'Suhu'],
  ['Iced', 'Dingin'],
  ['Hot', 'Panas'],
  ['Steamed rice', 'Nasi putih'],
  ['Coconut rice', 'Nasi uduk'],
  ['No rice', 'Tanpa nasi'],
  ['Crackers', 'Kerupuk'],
  ['Extra shot', 'Tambahan espresso'],
  ['Oat milk', 'Susu oat'],
  ['Choice', 'Pilihan'],
]

const TO_EN = new Map(MENU_PAIRS.map(([en, id]) => [id.toLowerCase(), en]))
const TO_ID = new Map(MENU_PAIRS.map(([en, id]) => [en.toLowerCase(), id]))

/** Translates seeded category and modifier labels while leaving custom text as-is. */
export function localizeMenuText(text: string, lang: Lang): string {
  const map = lang === 'en' ? TO_EN : TO_ID
  return map.get(text.trim().toLowerCase()) ?? text
}

/** Localizes a menu item's category and modifier labels while keeping its dish name intact. */
export function localizeMenuItem<T extends MenuItem>(item: T, lang: Lang): T {
  return {
    ...item,
    category: localizeMenuText(item.category, lang),
    modifierGroups: item.modifierGroups.map((group) => ({
      ...group,
      name: localizeMenuText(group.name, lang),
      options: group.options.map((opt) => ({
        ...opt,
        name: localizeMenuText(opt.name, lang),
      })),
    })),
  }
}

/** Translates default `Meja N` / `Table N` labels to the active language. */
export function localizeTable(label: string, t: Translate): string {
  return label.replace(
    /^(?:Meja|Table)\s+(\d+)$/i,
    (_, n: string) => `${t('table')} ${n}`,
  )
}

/** Translates the seeded sample staff name while keeping real staff names untouched. */
export function localizeStaff(name: string, lang: Lang): string {
  if (name === 'Staf Contoh' || name === 'Sample Staff') {
    return lang === 'id' ? 'Staf Contoh' : 'Sample Staff'
  }
  return name
}

export function whereLabel(order: BoardOrder, t: Translate) {
  return order.takeaway
    ? t('takeaway')
    : order.table
      ? localizeTable(order.table, t)
      : t('table')
}

/** Whole minutes since `since`, never negative. */
export function minutesSince(since: number, now: number) {
  return Math.floor(Math.max(0, now - since) / 60_000)
}

export function boardLines(order: BoardOrder, lang: Lang = 'en'): TicketLine[] {
  return order.lines.map((line) => ({
    key: line.id,
    ...line,
    modifiers: line.modifiers.map((m) => localizeMenuText(m, lang)),
  }))
}

export function localizeSummary(summary: string, lang: Lang): string {
  if (lang === 'en') {
    return summary.replace(/\bMeja\s+(\d+)\b/g, 'Table $1')
  }
  return summary
    .replace(/\bTable\s+(\d+)\b/g, 'Meja $1')
    .replace(/^Moved from Takeaway to (.+)$/, 'Pindah dari Bawa pulang ke $1')
    .replace(/^Moved from (.+) to (.+)$/, 'Pindah dari $1 ke $2')
    .replace(/^Add (.+)$/, 'Tambah $1')
    .replace(/^Added as (.+)$/, 'Ditambah sebagai $1')
    .replace(/^Cancel requested: (.+)$/, 'Minta batal: $1')
    .replace(/^Cancelled by manager: (.+)$/, 'Dibatalkan admin: $1')
}
