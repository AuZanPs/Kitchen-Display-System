import { ChefHat, MonitorPlay, Tablet } from 'lucide-react'
import { z } from 'zod'
import { ROLES } from '../../shared/order'
import type { Translate } from '../i18n'

export const PAIR_ROLES = ['waiter', 'kitchen', 'tv'] as const
export type PairRole = (typeof PAIR_ROLES)[number]

export const ROLE_ICON = {
  waiter: Tablet,
  kitchen: ChefHat,
  tv: MonitorPlay,
} as const

export const ROLE_PATH: Record<PairRole, string> = {
  waiter: '/waiter',
  kitchen: '/kitchen',
  tv: '/tv',
}

export const deviceSchema = z.object({
  id: z.string(),
  label: z.string(),
  role: z.enum(ROLES),
  createdAt: z.number(),
  lastSeenAt: z.number().nullable(),
  revokedAt: z.number().nullable(),
  online: z.boolean(),
})
export type Device = z.infer<typeof deviceSchema>
export const devicesSchema = z.object({ devices: z.array(deviceSchema) })

export function roleName(role: string, t: Translate) {
  if (role === 'waiter') return t('roleWaiter')
  if (role === 'kitchen') return t('roleKitchen')
  if (role === 'tv') return t('roleTv')
  return t('roleManager')
}
