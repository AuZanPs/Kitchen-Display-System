import {
  ArrowRight,
  ListPlus,
  Minus,
  Plus,
  Search,
  Send,
  ShieldAlert,
  ShoppingBag,
  Trash2,
  Utensils,
  X,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import type { BoardOrder, Settings } from '../../shared/board'
import type { MenuItem, Table } from '../../shared/menu'
import {
  createOrderResultSchema,
  LIMITS,
  ticketLabel,
} from '../../shared/order'
import { formatIdr, formatTime, useI18n } from '../i18n'
import { api } from '../lib/api'
import { whereLabel } from '../lib/board'
import { failureText, sendCommand } from '../lib/commands'
import { stagger } from '../lib/stagger'
import { Ticket } from '../ticket'
import { Button, IconButton } from '../ui/button'
import { Chip } from '../ui/chip'
import { Dialog } from '../ui/dialog'
import { TextArea } from '../ui/text-field'
import {
  type Draft,
  type DraftLine,
  draftTotal,
  toCreateOrder,
  toLines,
  type useDraft,
} from './draft'
import { ItemDialog } from './item-dialog'
import { TableGrid } from './table-grid'

type Drafts = ReturnType<typeof useDraft>

export function Composer({
  menu,
  tables,
  settings,
  drafts,
  reviewOpen,
  setReviewOpen,
  onSent,
  target,
  onLeaveTarget,
}: {
  menu: MenuItem[] | null
  tables: Table[] | null
  settings: Settings
  drafts: Drafts
  reviewOpen: boolean
  setReviewOpen: (open: boolean) => void
  onSent: (message: string) => void
  /** A sent ticket the new lines are added to, instead of a new order. */
  target: BoardOrder | null
  onLeaveTarget: () => void
}) {
  const { t } = useI18n()
  const { draft, edit } = drafts
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<string | null>(null)
  const [editing, setEditing] = useState<{
    item: MenuItem
    line: DraftLine | null
  } | null>(null)
  const [pickingTable, setPickingTable] = useState(false)
  // Narrow screens keep the summary in a sheet behind a bar (BUILD.md §6).
  const [sheetOpen, setSheetOpen] = useState(false)

  const categories = useMemo(
    () => [...new Set(menu?.map((m) => m.category))],
    [menu],
  )
  const visible = (menu ?? []).filter(
    (m) =>
      (category === null || m.category === category) &&
      m.name
        .toLocaleLowerCase('id')
        .includes(query.trim().toLocaleLowerCase('id')),
  )
  const where = target ? whereLabel(target, t) : whereText(draft, tables, t)

  function editLine(line: DraftLine) {
    const item = menu?.find((m) => m.id === line.menuItemId)
    if (item) setEditing({ item, line })
  }

  function saveLine(line: DraftLine) {
    edit((d) => ({
      lines: d.lines.some((l) => l.key === line.key)
        ? d.lines.map((l) => (l.key === line.key ? line : l))
        : [...d.lines, line],
    }))
    setEditing(null)
  }

  return (
    <div className="grid gap-6 px-4 pt-6 pb-20 sm:px-6 min-[950px]:grid-cols-[minmax(0,1fr)_minmax(320px,380px)] min-[950px]:items-start min-[950px]:pb-0">
      <section className="grid min-w-0 gap-5" aria-label={t('search')}>
        {target ? (
          <div className="rise flex flex-wrap items-center gap-3 rounded-md border-2 border-ink py-2 pr-2 pl-4">
            <ListPlus size={22} aria-hidden />
            <span className="mr-auto text-[17px] font-medium">
              {t('addingTo', {
                ticket: ticketLabel(target.ticketNo),
                where,
              })}
            </span>
            <Button
              variant="text"
              icon={<X size={18} aria-hidden />}
              onClick={onLeaveTarget}
            >
              {t('cancel')}
            </Button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-[15px] font-medium">{t('table')}</span>
            <Button variant="outlined" onClick={() => setPickingTable(true)}>
              {draft.destination?.type === 'table' ? where : t('chooseTable')}
            </Button>
            <fieldset className="grid w-full grid-cols-2 rounded-full border border-ink-soft p-1 sm:ml-auto sm:w-auto">
              <legend className="sr-only">{t('table')}</legend>
              {(['table', 'takeaway'] as const).map((type) => (
                <label
                  key={type}
                  className={`state flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-full px-3 text-sm font-medium whitespace-nowrap sm:px-4 has-focus-visible:outline-3 has-focus-visible:outline-ink ${draft.destination?.type === type ? '[--bg:var(--color-tonal)]' : ''}`}
                >
                  <input
                    type="radio"
                    name="destination"
                    className="sr-only"
                    checked={draft.destination?.type === type}
                    onChange={() =>
                      type === 'takeaway'
                        ? edit(() => ({ destination: { type: 'takeaway' } }))
                        : setPickingTable(true)
                    }
                  />
                  {type === 'table' ? (
                    <Utensils size={16} aria-hidden />
                  ) : (
                    <ShoppingBag size={16} aria-hidden />
                  )}
                  {type === 'table' ? t('dineIn') : t('takeaway')}
                </label>
              ))}
            </fieldset>
          </div>
        )}

        <label className="flex h-14 max-w-md items-center gap-3 rounded-full bg-tonal px-5 focus-within:outline-3 focus-within:outline-ink">
          <Search size={20} aria-hidden />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={`${t('search')}…`}
            name="menu-search"
            autoComplete="off"
            spellCheck={false}
            aria-label={t('search')}
            className="h-full min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-ink-soft"
          />
        </label>

        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
          <Chip selected={category === null} onClick={() => setCategory(null)}>
            {t('all')}
          </Chip>
          {categories.map((c) => (
            <Chip
              key={c}
              selected={category === c}
              onClick={() => setCategory(c)}
            >
              {c}
            </Chip>
          ))}
        </div>

        {menu && visible.length === 0 && (
          <p className="py-10 text-ink-soft">{t('noResults')}</p>
        )}
        <ul className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3">
          {visible.map((item, index) => (
            <li key={item.id} className="rise" style={stagger(index)}>
              <button
                type="button"
                disabled={!item.available}
                onClick={() => setEditing({ item, line: null })}
                className={`state group grid h-full min-h-36 w-full content-between gap-6 rounded-[20px] p-5 text-left transition-[background-color,scale] duration-150 ease-out active:scale-[0.98] disabled:active:scale-100 ${item.available ? '[--bg:var(--color-tonal)]' : 'border border-dashed border-ink-soft'}`}
              >
                <span className="text-lg leading-snug">{item.name}</span>
                <span className="flex items-end justify-between gap-2">
                  <span className="text-[15px] tabular-nums">
                    {item.available ? formatIdr(item.priceIdr) : t('soldOut')}
                  </span>
                  {item.available && (
                    <span
                      className="grid size-12 place-items-center rounded-sm bg-surface"
                      aria-hidden
                    >
                      <Plus size={22} />
                    </span>
                  )}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </section>

      <Summary
        draft={draft}
        where={where}
        onEdit={editLine}
        drafts={drafts}
        showOrderNote={settings.orderNote && !target}
        needsTable={!target && !draft.destination}
        onReview={() => setReviewOpen(true)}
        className="hidden min-[950px]:grid"
      />

      <CartBar
        draft={draft}
        canReview={
          (target !== null || draft.destination !== null) &&
          draft.lines.length > 0
        }
        onOpen={() => setSheetOpen(true)}
        onReview={() => setReviewOpen(true)}
      />
      <Dialog
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        title={where}
        description={t('itemsSelected', {
          count: draft.lines.reduce((n, l) => n + l.qty, 0),
        })}
      >
        <Summary
          sheet
          draft={draft}
          where={where}
          onEdit={(line) => {
            setSheetOpen(false)
            editLine(line)
          }}
          drafts={drafts}
          showOrderNote={settings.orderNote && !target}
          needsTable={!target && !draft.destination}
          onReview={() => {
            setSheetOpen(false)
            setReviewOpen(true)
          }}
        />
      </Dialog>

      {editing && (
        <ItemDialog
          key={editing.line?.key ?? editing.item.id}
          item={editing.item}
          initial={editing.line}
          settings={settings}
          onClose={() => setEditing(null)}
          onSave={saveLine}
        />
      )}

      <Dialog
        open={pickingTable}
        onOpenChange={setPickingTable}
        title={t('chooseTable')}
      >
        <TableGrid
          tables={tables}
          isCurrent={(table) =>
            draft.destination?.type === 'table' &&
            draft.destination.tableId === table.id
          }
          onPick={(table) => {
            edit(() => ({
              destination: { type: 'table', tableId: table.id },
            }))
            setPickingTable(false)
          }}
        />
      </Dialog>

      <ReviewDialog
        open={reviewOpen}
        onOpenChange={setReviewOpen}
        drafts={drafts}
        where={where}
        target={target}
        onSent={(message) => {
          setReviewOpen(false)
          onSent(message)
        }}
      />
    </div>
  )
}

function whereText(
  draft: Draft,
  tables: Table[] | null,
  t: ReturnType<typeof useI18n>['t'],
) {
  const d = draft.destination
  if (!d) return t('chooseTable')
  if (d.type === 'takeaway') return t('takeaway')
  return tables?.find((tb) => tb.id === d.tableId)?.label ?? t('table')
}

function Summary({
  draft,
  where,
  drafts,
  showOrderNote,
  needsTable,
  onEdit,
  onReview,
  sheet = false,
  className = '',
}: {
  draft: Draft
  where: string
  drafts: Drafts
  showOrderNote: boolean
  needsTable: boolean
  onEdit: (line: DraftLine) => void
  onReview: () => void
  /** Inside the narrow-screen sheet: the dialog already shows the header. */
  sheet?: boolean
  className?: string
}) {
  const { t } = useI18n()
  const [confirmDiscard, setConfirmDiscard] = useState(false)
  const { edit } = drafts
  const count = draft.lines.reduce((n, l) => n + l.qty, 0)
  const noteTooLong = draft.orderNote.trim().length > LIMITS.orderNote

  function setQty(key: string, qty: number) {
    edit((d) => ({
      lines:
        qty <= 0
          ? d.lines.filter((l) => l.key !== key)
          : d.lines.map((l) => (l.key === key ? { ...l, qty } : l)),
    }))
  }

  return (
    <aside
      aria-label={t('review')}
      className={
        sheet
          ? 'grid gap-5 pb-2'
          : `gap-5 rounded-lg bg-tonal p-5 min-[950px]:sticky min-[950px]:top-24 min-[950px]:max-h-[calc(100dvh-7rem)] min-[950px]:grid-rows-[auto_minmax(0,1fr)_auto] min-[950px]:overflow-hidden ${className}`
      }
    >
      <header className={sheet ? 'hidden' : 'flex items-start gap-3'}>
        <ShoppingBag size={24} className="mt-1" aria-hidden />
        <div className="mr-auto grid">
          <h2 className="text-[26px] leading-tight">{where}</h2>
          <span className="text-[13px]">{t('itemsSelected', { count })}</span>
        </div>
        {draft.lines.length > 0 && (
          <IconButton
            label={t('discard')}
            onClick={() => setConfirmDiscard(true)}
          >
            <Trash2 size={20} aria-hidden />
          </IconButton>
        )}
      </header>

      <div className="-mx-1 grid content-start gap-0 overflow-y-auto px-1">
        {draft.lines.length === 0 && (
          <p className="py-6 text-[15px]">{t('emptyOrder')}</p>
        )}
        {draft.lines.map((line, index) => (
          <div
            key={line.key}
            style={stagger(index)}
            className="rise grid gap-2.5 border-b border-ink-soft/40 py-4"
          >
            <button
              type="button"
              onClick={() => onEdit(line)}
              className="grid gap-0.5 text-left"
            >
              <span className="text-[17px]">{line.name}</span>
              {(line.modifierNames.length > 0 || line.note) && (
                <span className="text-[13px] text-ink-soft">
                  {[...line.modifierNames, line.note]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
              )}
            </button>
            {line.allergy && (
              <p className="flex items-start gap-2 rounded-sm bg-ink px-3 py-2 text-[13px] font-semibold text-surface">
                <ShieldAlert size={16} className="mt-px shrink-0" aria-hidden />
                <span>
                  {t('allergyBlock')} · {line.allergy}
                </span>
              </p>
            )}
            <div className="flex items-center justify-between">
              <div className="flex items-center rounded-full bg-surface">
                <IconButton
                  label={`${t('qty')} -1`}
                  onClick={() => setQty(line.key, line.qty - 1)}
                >
                  <Minus size={18} aria-hidden />
                </IconButton>
                <output className="w-7 text-center font-medium tabular-nums">
                  {line.qty}
                </output>
                <IconButton
                  label={`${t('qty')} +1`}
                  disabled={line.qty >= LIMITS.qty}
                  onClick={() => setQty(line.key, line.qty + 1)}
                >
                  <Plus size={18} aria-hidden />
                </IconButton>
              </div>
              <span className="text-[15px] tabular-nums">
                {formatIdr(line.qty * line.unitPriceIdr)}
              </span>
            </div>
          </div>
        ))}
      </div>

      <div className="grid gap-4">
        {showOrderNote && (
          <TextArea
            label={t('orderNote')}
            max={LIMITS.orderNote}
            value={draft.orderNote}
            onChange={(e) => {
              const orderNote = e.target.value
              edit(() => ({ orderNote }))
            }}
            className={sheet ? '' : 'border-transparent'}
          />
        )}
        <div className="flex items-end justify-between gap-4">
          <span className="text-[13px]">{t('estimatedTotal')}</span>
          <span className="text-[28px] leading-none font-medium tabular-nums">
            {formatIdr(draftTotal(draft))}
          </span>
        </div>
        <Button
          size="lg"
          disabled={needsTable || draft.lines.length === 0 || noteTooLong}
          onClick={onReview}
          icon={<ArrowRight size={20} aria-hidden />}
          className="flex-row-reverse"
        >
          {t('review')}
        </Button>
        {needsTable && draft.lines.length > 0 && (
          <p className="text-center text-[13px]">{t('pickTableFirst')}</p>
        )}
      </div>

      <Dialog
        open={confirmDiscard}
        onOpenChange={setConfirmDiscard}
        title={t('discard')}
        footer={
          <>
            <Button variant="text" onClick={() => setConfirmDiscard(false)}>
              {t('cancel')}
            </Button>
            <Button
              onClick={() => {
                drafts.reset()
                setConfirmDiscard(false)
              }}
            >
              {t('discard')}
            </Button>
          </>
        }
      />
    </aside>
  )
}

type SendState =
  | { status: 'idle' }
  | { status: 'sending' }
  | { status: 'failed'; message: string }

function ReviewDialog({
  open,
  onOpenChange,
  drafts,
  where,
  target,
  onSent,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  drafts: Drafts
  where: string
  target: BoardOrder | null
  onSent: (message: string) => void
}) {
  const { t } = useI18n()
  const [send, setSend] = useState<SendState>({ status: 'idle' })
  const { draft } = drafts
  const body = toCreateOrder(draft)
  const ready = target ? draft.lines.length > 0 : body !== null

  async function create() {
    if (!body) return null
    const result = await api('/api/orders', createOrderResultSchema, { body })
    return result.ok
      ? {
          ok: true as const,
          message: t('sent', { ticket: ticketLabel(result.data.ticketNo) }),
        }
      : result
  }

  async function addLines(order: BoardOrder) {
    const result = await sendCommand(order.id, {
      // Reused on retry, so a lost response never adds the lines twice.
      operationId: draft.operationId,
      type: 'addLines',
      expectedVersion: order.version,
      lines: toLines(draft),
    })
    if (!result.ok) return result
    const linked = result.data.linkedTicketNo
    return {
      ok: true as const,
      message:
        linked === undefined
          ? t('itemsAdded', { ticket: ticketLabel(order.ticketNo) })
          : t('sent', { ticket: ticketLabel(linked) }),
    }
  }

  async function submit() {
    if (!ready || send.status === 'sending') return
    setSend({ status: 'sending' })
    drafts.markAttempted()
    const result = await (target ? addLines(target) : create())
    if (!result) return
    if (result.ok) {
      setSend({ status: 'idle' })
      drafts.reset()
      onSent(result.message)
      return
    }
    // The ticket moved on: the next try is a new operation on the new version.
    if (result.code === 'stale_version') drafts.edit(() => ({}))
    setSend({
      status: 'failed',
      message: result.status === 0 ? t('notSent') : failureText(result, t),
    })
  }

  return (
    <Dialog
      open={open && ready}
      onOpenChange={(next) => {
        if (send.status !== 'sending') onOpenChange(next)
      }}
      title={t('review')}
      description={t('reviewHint')}
      wide
      footer={
        <>
          <Button
            variant="text"
            disabled={send.status === 'sending'}
            onClick={() => onOpenChange(false)}
          >
            {t('cancel')}
          </Button>
          <Button
            size="lg"
            icon={<Send size={20} aria-hidden />}
            disabled={send.status === 'sending'}
            onClick={() => void submit()}
          >
            {send.status === 'sending'
              ? t('sending')
              : send.status === 'failed'
                ? t('retry')
                : t('send')}
          </Button>
        </>
      }
    >
      <div className="grid gap-4 pt-2">
        {draft.attempted && send.status !== 'sending' && (
          <p
            role="alert"
            className="rounded-sm border-2 border-ink px-4 py-3 font-semibold"
          >
            {send.status === 'failed' ? send.message : t('unsentDraft')}
            {draft.attemptedAt && (
              <span className="block text-sm font-normal">
                {t('waitingSince', { time: formatTime(draft.attemptedAt) })}
              </span>
            )}
          </p>
        )}
        <Ticket
          size="paper"
          className="border border-line"
          ticketNo={target?.ticketNo ?? null}
          where={where}
          takeaway={
            target ? target.takeaway : draft.destination?.type === 'takeaway'
          }
          lines={draft.lines.map((l) => ({
            key: l.key,
            qty: l.qty,
            name: l.name,
            modifiers: l.modifierNames,
            note: l.note || null,
            allergy: l.allergy || null,
          }))}
          orderNote={draft.orderNote.trim() || null}
        />
      </div>
    </Dialog>
  )
}

/** Narrow screens: the order so far, always one tap from review. */
function CartBar({
  draft,
  canReview,
  onOpen,
  onReview,
}: {
  draft: Draft
  canReview: boolean
  onOpen: () => void
  onReview: () => void
}) {
  const { t } = useI18n()
  if (draft.lines.length === 0) return null
  const count = draft.lines.reduce((n, l) => n + l.qty, 0)
  return (
    <div className="on-ink rise fixed inset-x-4 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-20 flex items-center gap-2 rounded-full bg-ink p-1.5 text-surface min-[950px]:hidden">
      <button
        type="button"
        onClick={onOpen}
        aria-label={`${t('itemsSelected', { count })}, ${formatIdr(draftTotal(draft))}`}
        className="state flex min-h-12 min-w-0 flex-1 items-center gap-3 rounded-full pr-3 pl-2 text-left [--on:var(--color-surface)]"
      >
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-surface text-[15px] font-semibold text-ink tabular-nums">
          {count}
        </span>
        <span className="text-base font-medium whitespace-nowrap tabular-nums">
          {formatIdr(draftTotal(draft))}
        </span>
      </button>
      <Button
        variant="tonal"
        disabled={!canReview}
        onClick={onReview}
        className="shrink-0 whitespace-nowrap"
      >
        {t('review')}
      </Button>
    </div>
  )
}
