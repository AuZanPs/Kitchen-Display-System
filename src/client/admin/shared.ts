import { ChefHat, MonitorPlay, Tablet } from 'lucide-react'
import { useState } from 'react'
import type { OrderStatus } from '../../shared/board'
import type { DictKey, Translate } from '../i18n'

export const ROLE_ICON = {
  waiter: Tablet,
  kitchen: ChefHat,
  tv: MonitorPlay,
} as const

export const STATUS_KEY: Record<OrderStatus, DictKey> = {
  new: 'laneNew',
  accepted: 'lanePreparing',
  ready: 'laneReady',
  served: 'served',
  cancelled: 'cancelled',
}

export function roleName(role: string, t: Translate) {
  if (role === 'waiter') return t('roleWaiter')
  if (role === 'kitchen') return t('roleKitchen')
  if (role === 'tv') return t('roleTv')
  return t('roleManager')
}

type Editing<T> = { open: boolean; target: T | null; key: number }

/** Which row a dialog edits; null target means a new one. */
export function useEditing<T>() {
  const [state, setState] = useState<Editing<T>>({
    open: false,
    target: null,
    key: 0,
  })
  return {
    ...state,
    // A fresh key resets the form; the target stays while the dialog closes.
    start: (target: T | null) =>
      setState((s) => ({ open: true, target, key: s.key + 1 })),
    close: () => setState((s) => ({ ...s, open: false })),
  }
}
