import type { BoardMessage, BoardOrder } from '../../shared/board'
import { DEFAULT_SETTINGS } from '../../shared/board'

const DISHES = [
  ['Nasi Goreng Kampung', ['Pedas sedang', 'Telur ceplok']],
  ['Ayam Bakar Madu', ['Sambal terpisah']],
  ['Mie Goreng Jawa', ['Extra pedas']],
  ['Es Teh Lemon', ['Tanpa es']],
  ['Kopi Susu Aren', ['Dingin', 'Sedikit gula']],
  ['Sate Ayam', []],
] as const
const STATUSES = ['new', 'accepted', 'ready'] as const

/** Dev-only `/tv?fixture=N`: N synthetic tickets to check paging and wrapping. */
export function fixtureBoard(count: number, now: number): BoardMessage {
  const orders: BoardOrder[] = Array.from({ length: count }, (_, i) => {
    // Every fifth ticket is long enough to need splitting across pages.
    const lineCount = i % 5 === 4 ? 16 : (i % 3) + 1
    return {
      id: `fixture-${i}`,
      ticketNo: i + 1,
      status: STATUSES[i % 3] ?? 'new',
      version: 1,
      takeaway: i % 4 === 3,
      table: i % 4 === 3 ? null : `Meja ${(i % 15) + 1}`,
      orderNote: i % 6 === 0 ? 'Tamu ulang tahun, keluarkan bersamaan' : null,
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
          note: j === 1 ? 'Piring terpisah' : null,
          allergy: i % 7 === 2 && j === 0 ? 'udang dan kacang' : null,
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
