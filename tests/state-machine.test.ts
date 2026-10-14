import { describe, expect, it } from 'vitest'
import type { OrderStatus } from '../src/shared/board'
import {
  COMMAND_ROLES,
  type Command,
  decide,
  type OrderState,
} from '../src/shared/commands'
import { chooseOptions, type ModifierGroup } from '../src/shared/menu'
import { ticketLabel } from '../src/shared/order'
import { line } from './helpers'

const OP = '00000000-0000-4000-8000-000000000000'

function state(overrides: Partial<OrderState> = {}): OrderState {
  return {
    status: 'new',
    version: 3,
    changePending: false,
    cancelRequested: false,
    hasAllergy: false,
    pendingChangeHasAllergy: false,
    lineCount: 2,
    ...overrides,
  }
}

const cmd = {
  accept: (ack = false): Command => ({
    type: 'accept',
    operationId: OP,
    expectedVersion: 3,
    allergyAcknowledged: ack,
  }),
  ackChange: (ack = false): Command => ({
    type: 'ackChange',
    operationId: OP,
    expectedVersion: 3,
    allergyAcknowledged: ack,
  }),
  ready: (): Command => ({
    type: 'ready',
    operationId: OP,
    expectedVersion: 3,
  }),
  serve: (): Command => ({
    type: 'serve',
    operationId: OP,
    expectedVersion: 3,
  }),
  addLines: (n = 1): Command => ({
    type: 'addLines',
    operationId: OP,
    expectedVersion: 3,
    lines: Array.from({ length: n }, () => line()),
  }),
  moveTable: (): Command => ({
    type: 'moveTable',
    operationId: OP,
    expectedVersion: 3,
    tableId: 't02',
  }),
  requestCancel: (): Command => ({
    type: 'requestCancel',
    operationId: OP,
    expectedVersion: 3,
    reason: 'Tamu pergi',
  }),
  ackCancel: (): Command => ({
    type: 'ackCancel',
    operationId: OP,
    expectedVersion: 3,
  }),
  managerCancel: (): Command => ({
    type: 'managerCancel',
    operationId: OP,
    expectedVersion: 3,
    reason: 'Salah input',
  }),
}

function rejectedWith(code: string) {
  return expect.objectContaining({ kind: 'reject', code })
}

describe('decide', () => {
  describe('accept', () => {
    it('moves new to accepted and clears pending changes', () => {
      expect(decide(state({ changePending: true }), cmd.accept())).toEqual({
        kind: 'apply',
        patch: { status: 'accepted', changePending: false },
      })
    })
    it('needs the allergy acknowledged when a line has one', () => {
      expect(decide(state({ hasAllergy: true }), cmd.accept())).toEqual(
        rejectedWith('allergy_ack_required'),
      )
      expect(decide(state({ hasAllergy: true }), cmd.accept(true)).kind).toBe(
        'apply',
      )
    })
    it('is refused while a cancellation is requested', () => {
      expect(decide(state({ cancelRequested: true }), cmd.accept())).toEqual(
        rejectedWith('invalid_transition'),
      )
    })
    it.each<OrderStatus>(['ready', 'served', 'cancelled'])(
      'is refused from %s',
      (status) => {
        expect(decide(state({ status }), cmd.accept())).toEqual(
          rejectedWith('invalid_transition'),
        )
      },
    )
  })

  describe('noop rule', () => {
    it.each([
      ['accept', 'accepted', cmd.accept()],
      ['ready', 'ready', cmd.ready()],
      ['serve', 'served', cmd.serve()],
    ] as const)(
      '%s on an order already %s is a noop even with a stale version',
      (_, status, command) => {
        const order = state({ status, version: 9 })
        expect(decide(order, command)).toEqual({ kind: 'noop' })
      },
    )
  })

  it('rejects any other command with a stale version', () => {
    for (const make of Object.values(cmd)) {
      const order = state({ version: 4, changePending: true })
      expect(decide(order, make())).toEqual(rejectedWith('stale_version'))
    }
  })

  describe('ackChange', () => {
    it('clears a pending change', () => {
      expect(
        decide(
          state({ status: 'accepted', changePending: true }),
          cmd.ackChange(),
        ),
      ).toEqual({ kind: 'apply', patch: { changePending: false } })
    })
    it('needs the allergy acknowledged when the change adds one', () => {
      const order = state({
        changePending: true,
        pendingChangeHasAllergy: true,
      })
      expect(decide(order, cmd.ackChange())).toEqual(
        rejectedWith('allergy_ack_required'),
      )
      expect(decide(order, cmd.ackChange(true)).kind).toBe('apply')
    })
    it('is refused without a pending change', () => {
      expect(decide(state(), cmd.ackChange())).toEqual(
        rejectedWith('invalid_transition'),
      )
    })
  })

  describe('ready', () => {
    it('moves accepted to ready', () => {
      expect(decide(state({ status: 'accepted' }), cmd.ready())).toEqual({
        kind: 'apply',
        patch: { status: 'ready' },
      })
    })
    it.each([
      ['a pending change', { changePending: true }],
      ['a cancel request', { cancelRequested: true }],
    ])('is refused with %s', (_, overrides) => {
      expect(
        decide(state({ status: 'accepted', ...overrides }), cmd.ready()),
      ).toEqual(rejectedWith('invalid_transition'))
    })
    it.each<OrderStatus>(['new', 'served', 'cancelled'])(
      'is refused from %s',
      (status) => {
        expect(decide(state({ status }), cmd.ready())).toEqual(
          rejectedWith('invalid_transition'),
        )
      },
    )
  })

  describe('serve', () => {
    it('moves ready to served', () => {
      expect(decide(state({ status: 'ready' }), cmd.serve())).toEqual({
        kind: 'apply',
        patch: { status: 'served' },
      })
    })
    it('is refused while a cancellation is requested', () => {
      expect(
        decide(state({ status: 'ready', cancelRequested: true }), cmd.serve()),
      ).toEqual(rejectedWith('invalid_transition'))
    })
    it.each<OrderStatus>(['new', 'accepted', 'cancelled'])(
      'is refused from %s',
      (status) => {
        expect(decide(state({ status }), cmd.serve())).toEqual(
          rejectedWith('invalid_transition'),
        )
      },
    )
  })

  describe('addLines', () => {
    it.each<OrderStatus>(['new', 'accepted'])(
      'appends to a %s ticket and marks the change pending',
      (status) => {
        expect(decide(state({ status }), cmd.addLines())).toEqual({
          kind: 'apply',
          patch: { changePending: true },
        })
      },
    )
    it.each<OrderStatus>(['ready', 'served'])(
      'creates a linked ticket for a %s ticket',
      (status) => {
        expect(decide(state({ status }), cmd.addLines())).toEqual({
          kind: 'linked',
        })
      },
    )
    it('caps a ticket at 25 lines', () => {
      expect(decide(state({ lineCount: 24 }), cmd.addLines(1)).kind).toBe(
        'apply',
      )
      expect(decide(state({ lineCount: 24 }), cmd.addLines(2))).toEqual(
        rejectedWith('too_many_lines'),
      )
    })
    it('is refused on cancelled tickets and during a cancel request', () => {
      expect(decide(state({ status: 'cancelled' }), cmd.addLines())).toEqual(
        rejectedWith('invalid_transition'),
      )
      expect(decide(state({ cancelRequested: true }), cmd.addLines())).toEqual(
        rejectedWith('invalid_transition'),
      )
    })
  })

  describe('moveTable', () => {
    it.each<OrderStatus>(['new', 'accepted'])(
      'marks a %s ticket as changed',
      (status) => {
        expect(decide(state({ status }), cmd.moveTable())).toEqual({
          kind: 'apply',
          patch: { changePending: true },
        })
      },
    )
    it('just moves a ready ticket', () => {
      expect(decide(state({ status: 'ready' }), cmd.moveTable())).toEqual({
        kind: 'apply',
        patch: {},
      })
    })
    it.each<OrderStatus>(['served', 'cancelled'])(
      'is refused from %s',
      (status) => {
        expect(decide(state({ status }), cmd.moveTable())).toEqual(
          rejectedWith('invalid_transition'),
        )
      },
    )
  })

  describe('requestCancel', () => {
    it.each<OrderStatus>(['new', 'accepted', 'ready'])(
      'flags a %s ticket',
      (status) => {
        expect(decide(state({ status }), cmd.requestCancel())).toEqual({
          kind: 'apply',
          patch: { cancelRequested: true },
        })
      },
    )
    it('is refused twice and on closed tickets', () => {
      expect(
        decide(state({ cancelRequested: true }), cmd.requestCancel()),
      ).toEqual(rejectedWith('invalid_transition'))
      expect(decide(state({ status: 'served' }), cmd.requestCancel())).toEqual(
        rejectedWith('invalid_transition'),
      )
    })
  })

  describe('ackCancel', () => {
    it('cancels a ticket with a cancel request', () => {
      expect(decide(state({ cancelRequested: true }), cmd.ackCancel())).toEqual(
        {
          kind: 'apply',
          patch: { status: 'cancelled', cancelRequested: false },
        },
      )
    })
    it('is refused without a request', () => {
      expect(decide(state(), cmd.ackCancel())).toEqual(
        rejectedWith('invalid_transition'),
      )
    })
  })

  describe('managerCancel', () => {
    it.each<OrderStatus>(['new', 'accepted', 'ready'])(
      'cancels a %s ticket at once',
      (status) => {
        expect(decide(state({ status }), cmd.managerCancel())).toEqual({
          kind: 'apply',
          patch: { status: 'cancelled', cancelRequested: false },
        })
      },
    )
    it.each<OrderStatus>(['served', 'cancelled'])(
      'is refused from %s',
      (status) => {
        expect(decide(state({ status }), cmd.managerCancel())).toEqual(
          rejectedWith('invalid_transition'),
        )
      },
    )
  })
})

describe('command roles', () => {
  it('keeps the TV read-only and override to managers', () => {
    for (const roles of Object.values(COMMAND_ROLES)) {
      expect(roles).not.toContain('tv')
      expect(roles).toContain('manager')
    }
    expect(COMMAND_ROLES.managerCancel).toEqual(['manager'])
    expect(COMMAND_ROLES.create).not.toContain('kitchen')
    expect(COMMAND_ROLES.accept).not.toContain('waiter')
  })
})

describe('chooseOptions', () => {
  const groups: ModifierGroup[] = [
    {
      id: 'pedas',
      name: 'Level pedas',
      required: true,
      multi: false,
      options: [
        { id: 'tidak', name: 'Tidak pedas', priceDeltaIdr: 0 },
        { id: 'extra', name: 'Extra pedas', priceDeltaIdr: 0 },
      ],
    },
    {
      id: 'tambahan',
      name: 'Tambahan',
      required: false,
      multi: true,
      options: [
        { id: 'telur', name: 'Telur', priceDeltaIdr: 5000 },
        { id: 'keju', name: 'Keju', priceDeltaIdr: 7000 },
      ],
    },
  ]

  it('returns names in menu order and the price delta', () => {
    expect(chooseOptions(groups, ['keju', 'extra', 'telur'])).toEqual({
      ok: true,
      names: ['Extra pedas', 'Telur', 'Keju'],
      priceDeltaIdr: 12000,
    })
  })
  it.each([
    ['a required group is empty', ['telur']],
    ['a single-choice group has two', ['tidak', 'extra']],
    ['an option is unknown', ['tidak', 'nanas']],
    ['an option is repeated', ['tidak', 'telur', 'telur']],
  ])('fails when %s', (_, ids) => {
    expect(chooseOptions(groups, ids).ok).toBe(false)
  })
  it('accepts no options when nothing is required', () => {
    expect(chooseOptions([], [])).toEqual({
      ok: true,
      names: [],
      priceDeltaIdr: 0,
    })
  })
})

it('formats ticket numbers', () => {
  expect(ticketLabel(1)).toBe('A-001')
  expect(ticketLabel(42)).toBe('A-042')
  expect(ticketLabel(1234)).toBe('A-1234')
})
