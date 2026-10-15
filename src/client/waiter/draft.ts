import { useEffect, useState } from 'react'
import { z } from 'zod'
import {
  type CreateOrder,
  destinationSchema,
  orderLineInputSchema,
} from '../../shared/order'
import { uuid } from '../lib/uuid'

const STORAGE_KEY = 'kds_draft'

export const draftLineSchema = orderLineInputSchema.extend({
  key: z.string(),
  name: z.string(),
  modifierNames: z.array(z.string()),
  unitPriceIdr: z.number().int(),
})
export type DraftLine = z.infer<typeof draftLineSchema>

export const draftSchema = z.object({
  /** Reused for every retry of this exact draft, so a retry never duplicates. */
  operationId: z.uuid(),
  destination: destinationSchema.nullable(),
  lines: z.array(draftLineSchema),
  orderNote: z.string(),
  /** A send was attempted and not confirmed: reopen the review on reload. */
  attempted: z.boolean(),
  /** When the first unconfirmed send happened, to show how long it waited. */
  attemptedAt: z.number().nullable(),
})
export type Draft = z.infer<typeof draftSchema>

export function emptyDraft(): Draft {
  return {
    operationId: uuid(),
    destination: null,
    lines: [],
    orderNote: '',
    attempted: false,
    attemptedAt: null,
  }
}

function load(): Draft {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return emptyDraft()
    const parsed = draftSchema.safeParse(JSON.parse(raw))
    return parsed.success ? parsed.data : emptyDraft()
  } catch {
    return emptyDraft()
  }
}

/** The draft lives in localStorage before anything is sent (BUILD.md I6). */
export function useDraft() {
  const [draft, setDraft] = useState<Draft>(load)

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(draft))
    } catch {
      // Storage full or blocked: the draft still lives in memory.
    }
  }, [draft])

  /** Any edit makes it a different order, so it gets a new operationId. */
  function edit(change: (draft: Draft) => Partial<Draft>) {
    setDraft((current) => ({
      ...current,
      ...change(current),
      operationId: uuid(),
      attempted: false,
      attemptedAt: null,
    }))
  }

  return {
    draft,
    edit,
    markAttempted: () =>
      setDraft((d) => ({
        ...d,
        attempted: true,
        attemptedAt: d.attemptedAt ?? Date.now(),
      })),
    /** After a confirmed send the tablet starts a fresh order. */
    reset: () => setDraft(emptyDraft()),
  }
}

export function toCreateOrder(draft: Draft): CreateOrder | null {
  if (!draft.destination || draft.lines.length === 0) return null
  return {
    operationId: draft.operationId,
    destination: draft.destination,
    orderNote: draft.orderNote.trim(),
    lines: draft.lines.map(({ menuItemId, qty, optionIds, note, allergy }) => ({
      menuItemId,
      qty,
      optionIds,
      note: note.trim(),
      allergy: allergy.trim(),
    })),
  }
}

export function draftTotal(draft: Draft) {
  return draft.lines.reduce(
    (sum, line) => sum + line.qty * line.unitPriceIdr,
    0,
  )
}
