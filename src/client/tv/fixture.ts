import type { BoardMessage, BoardOrder } from '../../shared/board'
import { ACTIVE_STATUSES, DEFAULT_SETTINGS } from '../../shared/board'

const DISHES = [
  ['Kampung Fried Rice', ['Medium spicy', 'Fried egg']],
  ['Honey Grilled Chicken', ['Sambal on the side']],
  ['Javanese Fried Noodles', ['Extra spicy']],
  ['Iced Lemon Tea', ['No ice']],
  ['Palm Sugar Iced Latte', ['Iced', 'Less sugar']],
  ['Chicken Satay', []],
] as const

/** Dev-only `/tv?fixture=N`: N synthetic tickets to check fitting and wrapping. */
export function fixtureBoard(count: number, now: number): BoardMessage {
  const orders: BoardOrder[] = Array.from({ length: count }, (_, i) => {
    // Every fifth ticket is long enough to need a second column.
    const lineCount = i % 5 === 4 ? 16 : (i % 3) + 1
    return {
      id: `fixture-${i}`,
      ticketNo: i + 1,
      status: ACTIVE_STATUSES[i % 3] ?? 'new',
      version: 1,
      takeaway: i % 4 === 3,
      table: i % 4 === 3 ? null : `Table ${(i % 15) + 1}`,
      orderNote: i % 6 === 0 ? 'Birthday table, serve together' : null,
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
        const [name, modifiers] = DISHES[(i + j) % DISHES.length] ?? DISHES[0]
        return {
          id: `fixture-${i}-${j}`,
          name,
          qty: (j % 3) + 1,
          modifiers: [...modifiers],
          note: j === 1 ? 'Extra plate' : null,
          allergy: i % 7 === 2 && j === 0 ? 'shrimp and peanuts' : null,
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
