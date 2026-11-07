import type { BoardMessage, BoardOrder } from '../../shared/board'
import { ACTIVE_STATUSES, DEFAULT_SETTINGS } from '../../shared/board'
import type { Lang } from '../i18n'

const DISHES_EN = [
  ['Kampung Fried Rice', ['Medium spicy', 'Fried egg']],
  ['Honey Grilled Chicken', ['Sambal on the side']],
  ['Javanese Fried Noodles', ['Extra spicy']],
  ['Iced Lemon Tea', ['No ice']],
  ['Palm Sugar Iced Latte', ['Iced', 'Less sugar']],
  ['Chicken Satay', []],
] as const

const DISHES_ID = [
  ['Nasi Goreng Kampung', ['Pedas sedang', 'Telur ceplok']],
  ['Ayam Bakar Madu', ['Sambal terpisah']],
  ['Mie Goreng Jawa', ['Ekstra pedas']],
  ['Es Teh Lemon', ['Tanpa es']],
  ['Es Kopi Susu Gula Aren', ['Dingin', 'Sedikit gula']],
  ['Sate Ayam', []],
] as const

/** Dev-only `/tv?fixture=N`: N synthetic tickets to check fitting and wrapping. */
export function fixtureBoard(
  count: number,
  now: number,
  lang: Lang = 'en',
): BoardMessage {
  const dishes = lang === 'id' ? DISHES_ID : DISHES_EN
  const orders: BoardOrder[] = Array.from({ length: count }, (_, i) => {
    // Every fifth ticket is long enough to need a second column.
    const lineCount = i % 5 === 4 ? 16 : (i % 3) + 1
    return {
      id: `fixture-${i}`,
      ticketNo: i + 1,
      status: ACTIVE_STATUSES[i % 3] ?? 'new',
      version: 1,
      takeaway: i % 4 === 3,
      table:
        i % 4 === 3
          ? null
          : `${lang === 'id' ? 'Meja' : 'Table'} ${(i % 15) + 1}`,
      orderNote:
        i % 6 === 0
          ? lang === 'id'
            ? 'Meja ulang tahun, sajikan bersamaan'
            : 'Birthday table, serve together'
          : null,
      changePending: false,
      cancelRequested: false,
      cancelReason: null,
      linkedTo: null,
      pendingChanges: [],
      createdAt: now - (count - i) * 95_000,
      acceptedAt: null,
      readyAt: null,
      servedAt: null,
      cancelledAt: null,
      createdByName: null,
      shownOnTv: true,
      lines: Array.from({ length: lineCount }, (_, j) => {
        const [name, modifiers] = dishes[(i + j) % dishes.length] ?? dishes[0]
        return {
          id: `fixture-${i}-${j}`,
          name,
          qty: (j % 3) + 1,
          modifiers: [...modifiers],
          note:
            j === 1
              ? lang === 'id'
                ? 'Piring tambahan'
                : 'Extra plate'
              : null,
          allergy:
            i % 7 === 2 && j === 0
              ? lang === 'id'
                ? 'udang dan kacang'
                : 'shrimp and peanuts'
              : null,
          addedInVersion: 1,
        }
      }),
    }
  })
  return {
    type: 'board',
    rev: 1,
    serverTime: now,
    serviceDay: '',
    serviceOpen: true,
    instanceStartedAt: now,
    tvCount: 1,
    tvControl: { paused: false, page: 0 },
    settings: DEFAULT_SETTINGS,
    menuVersion: 0,
    orders,
  }
}
