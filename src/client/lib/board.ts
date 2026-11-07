import type { BoardOrder } from '../../shared/board'
import type { Lang, Translate } from '../i18n'
import type { TicketLine } from '../ticket'

export function whereLabel(order: BoardOrder, t: Translate) {
  return order.takeaway ? t('takeaway') : (order.table ?? t('table'))
}

/** Whole minutes since `since`, never negative. */
export function minutesSince(since: number, now: number) {
  return Math.floor(Math.max(0, now - since) / 60_000)
}

export function boardLines(order: BoardOrder): TicketLine[] {
  return order.lines.map((line) => ({ key: line.id, ...line }))
}

export function localizeSummary(summary: string, lang: Lang): string {
  if (lang === 'en') return summary
  return summary
    .replace(/^Moved from Takeaway to (.+)$/, 'Pindah dari Bungkus ke $1')
    .replace(/^Moved from (.+) to (.+)$/, 'Pindah dari $1 ke $2')
    .replace(/^Add (.+)$/, 'Tambah $1')
    .replace(/^Added as (.+)$/, 'Ditambah sebagai $1')
    .replace(/^Cancel requested: (.+)$/, 'Minta batal: $1')
    .replace(/^Cancelled by manager: (.+)$/, 'Dibatalkan pengelola: $1')
}
