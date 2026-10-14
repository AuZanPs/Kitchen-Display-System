import { z } from 'zod'
import type { OrderStatus } from './board'
import {
  type ErrorCode,
  LIMITS,
  orderLineInputSchema,
  type Role,
} from './order'

const base = {
  operationId: z.uuid(),
  expectedVersion: z.number().int().min(1),
}
const reason = z.string().trim().min(1).max(LIMITS.reason)

export const commandSchema = z.discriminatedUnion('type', [
  z.object({
    ...base,
    type: z.literal('accept'),
    allergyAcknowledged: z.boolean().default(false),
  }),
  z.object({
    ...base,
    type: z.literal('ackChange'),
    allergyAcknowledged: z.boolean().default(false),
  }),
  z.object({ ...base, type: z.literal('ready') }),
  z.object({ ...base, type: z.literal('serve') }),
  z.object({
    ...base,
    type: z.literal('addLines'),
    lines: z.array(orderLineInputSchema).min(1).max(LIMITS.lines),
  }),
  z.object({
    ...base,
    type: z.literal('moveTable'),
    tableId: z.string().min(1).max(64),
  }),
  z.object({ ...base, type: z.literal('requestCancel'), reason }),
  z.object({ ...base, type: z.literal('ackCancel') }),
  z.object({ ...base, type: z.literal('managerCancel'), reason }),
])

export type Command = z.infer<typeof commandSchema>
export type CommandType = Command['type']

export const COMMAND_ROLES: Record<CommandType | 'create', readonly Role[]> = {
  create: ['waiter', 'manager'],
  accept: ['kitchen', 'manager'],
  ackChange: ['kitchen', 'manager'],
  ready: ['kitchen', 'manager'],
  serve: ['waiter', 'manager'],
  addLines: ['waiter', 'manager'],
  moveTable: ['waiter', 'manager'],
  requestCancel: ['waiter', 'manager'],
  ackCancel: ['kitchen', 'manager'],
  managerCancel: ['manager'],
}

export const commandResultSchema = z.object({
  orderId: z.string(),
  version: z.number().int(),
  status: z.string(),
  noop: z.boolean(),
  linkedOrderId: z.string().optional(),
  linkedTicketNo: z.number().int().optional(),
  rev: z.number().int(),
  replayed: z.boolean().optional(),
})
export type CommandResult = z.infer<typeof commandResultSchema>

/** What the state machine needs to know about an order. */
export type OrderState = {
  status: OrderStatus
  version: number
  changePending: boolean
  cancelRequested: boolean
  /** Any line on the ticket carries an allergy. */
  hasAllergy: boolean
  /** An unacknowledged change adds a line with an allergy. */
  pendingChangeHasAllergy: boolean
  lineCount: number
}

export type OrderPatch = {
  status?: OrderStatus
  changePending?: boolean
  cancelRequested?: boolean
}

export type Decision =
  | { kind: 'noop' }
  | { kind: 'reject'; code: ErrorCode; message: string }
  | { kind: 'apply'; patch: OrderPatch }
  /** addLines on a ready or served ticket becomes a new linked ticket. */
  | { kind: 'linked' }

const NOOP_TARGET: Partial<Record<CommandType, OrderStatus>> = {
  accept: 'accepted',
  ready: 'ready',
  serve: 'served',
}

const ACTIVE: OrderStatus[] = ['new', 'accepted', 'ready']

function reject(code: ErrorCode, message: string): Decision {
  return { kind: 'reject', code, message }
}

/**
 * The order state machine. Pure: the Durable Object applies the patch,
 * bumps the version and writes the event.
 */
export function decide(order: OrderState, command: Command): Decision {
  // Two people tapping the same button both succeed.
  if (NOOP_TARGET[command.type] === order.status) return { kind: 'noop' }
  if (command.expectedVersion !== order.version) {
    return reject('stale_version', 'Pesanan sudah berubah. Muat ulang.')
  }

  switch (command.type) {
    case 'accept':
      if (order.status !== 'new') {
        return reject('invalid_transition', 'Hanya pesanan baru bisa diterima.')
      }
      if (order.cancelRequested) {
        return reject('invalid_transition', 'Ada permintaan pembatalan.')
      }
      if (order.hasAllergy && !command.allergyAcknowledged) {
        return reject('allergy_ack_required', 'Konfirmasi alergi dulu.')
      }
      // Accepting covers the whole current ticket, including changes.
      return {
        kind: 'apply',
        patch: { status: 'accepted', changePending: false },
      }

    case 'ackChange':
      if (!order.changePending) {
        return reject('invalid_transition', 'Tidak ada perubahan tertunda.')
      }
      if (order.pendingChangeHasAllergy && !command.allergyAcknowledged) {
        return reject('allergy_ack_required', 'Konfirmasi alergi dulu.')
      }
      return { kind: 'apply', patch: { changePending: false } }

    case 'ready':
      if (order.status !== 'accepted') {
        return reject('invalid_transition', 'Terima pesanan dulu.')
      }
      if (order.cancelRequested) {
        return reject('invalid_transition', 'Ada permintaan pembatalan.')
      }
      if (order.changePending) {
        return reject('invalid_transition', 'Terima perubahan dulu.')
      }
      return { kind: 'apply', patch: { status: 'ready' } }

    case 'serve':
      if (order.status !== 'ready') {
        return reject('invalid_transition', 'Pesanan belum siap.')
      }
      if (order.cancelRequested) {
        return reject('invalid_transition', 'Ada permintaan pembatalan.')
      }
      return { kind: 'apply', patch: { status: 'served' } }

    case 'addLines':
      if (order.cancelRequested) {
        return reject('invalid_transition', 'Ada permintaan pembatalan.')
      }
      if (order.status === 'ready' || order.status === 'served') {
        return { kind: 'linked' }
      }
      if (order.status !== 'new' && order.status !== 'accepted') {
        return reject('invalid_transition', 'Pesanan sudah ditutup.')
      }
      if (order.lineCount + command.lines.length > LIMITS.lines) {
        return reject(
          'too_many_lines',
          `Maksimal ${LIMITS.lines} baris per pesanan.`,
        )
      }
      return { kind: 'apply', patch: { changePending: true } }

    case 'moveTable':
      if (!ACTIVE.includes(order.status)) {
        return reject('invalid_transition', 'Pesanan sudah ditutup.')
      }
      // Ready food only needs the new table; there is nothing left to cook.
      return order.status === 'ready'
        ? { kind: 'apply', patch: {} }
        : { kind: 'apply', patch: { changePending: true } }

    case 'requestCancel':
      if (!ACTIVE.includes(order.status)) {
        return reject('invalid_transition', 'Pesanan sudah ditutup.')
      }
      if (order.cancelRequested) {
        return reject('invalid_transition', 'Pembatalan sudah diminta.')
      }
      return { kind: 'apply', patch: { cancelRequested: true } }

    case 'ackCancel':
      if (!order.cancelRequested) {
        return reject('invalid_transition', 'Tidak ada permintaan pembatalan.')
      }
      return {
        kind: 'apply',
        patch: { status: 'cancelled', cancelRequested: false },
      }

    case 'managerCancel':
      if (!ACTIVE.includes(order.status)) {
        return reject('invalid_transition', 'Pesanan sudah ditutup.')
      }
      return {
        kind: 'apply',
        patch: { status: 'cancelled', cancelRequested: false },
      }
  }
}
