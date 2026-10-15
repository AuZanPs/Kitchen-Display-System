import {
  ArrowRight,
  Minus,
  Plus,
  Search,
  Send,
  ShieldAlert,
  ShoppingBag,
  Trash2,
  Utensils,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import type { Settings } from '../../shared/board'
import type { MenuItem, Table } from '../../shared/menu'
import {
  createOrderResultSchema,
  LIMITS,
  ticketLabel,
} from '../../shared/order'
import { formatIdr, formatTime, useI18n } from '../i18n'
import { api } from '../lib/api'
import { failureText } from '../lib/commands'
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
  type useDraft,
} from './draft'
import { ItemDialog } from './item-dialog'

type Drafts = ReturnType<typeof useDraft>

export function Composer({
  menu,
  tables,
  settings,
  drafts,
  reviewOpen,
  setReviewOpen,
  onSent,
}: {
  menu: MenuItem[] | null
  tables: Table[] | null
  settings: Settings
  drafts: Drafts
  reviewOpen: boolean
  setReviewOpen: (open: boolean) => void
  onSent: (ticket: string) => void
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
  const where = whereText(draft, tables, t)

  function saveLine(line: DraftLine) {
    edit((d) => ({
      lines: d.lines.some((l) => l.key === line.key)
        ? d.lines.map((l) => (l.key === line.key ? line : l))
        : [...d.lines, line],
    }))
    setEditing(null)
  }

  return (
    <div className="grid gap-6 px-4 pt-6 sm:px-6 min-[950px]:grid-cols-[minmax(0,1fr)_minmax(320px,380px)] min-[950px]:items-start">
      <section className="grid min-w-0 gap-5" aria-label={t('search')}>
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-[15px] font-medium">{t('table')}</span>
          <Button variant="outlined" onClick={() => setPickingTable(true)}>
            {draft.destination?.type === 'table' ? where : t('chooseTable')}
          </Button>
          <fieldset className="ml-auto grid grid-cols-2 rounded-full border border-ink-soft p-1">
            <legend className="sr-only">{t('table')}</legend>
            {(['table', 'takeaway'] as const).map((type) => (
              <label
                key={type}
                className={`state flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-full px-4 text-sm font-medium has-focus-visible:outline-3 has-focus-visible:outline-ink ${draft.destination?.type === type ? '[--bg:var(--color-tonal)]' : ''}`}
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
          {visible.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                disabled={!item.available}
                onClick={() => setEditing({ item, line: null })}
                className={`state group grid h-full min-h-36 w-full content-between gap-6 rounded-[20px] p-5 text-left transition-transform duration-150 ease-out active:scale-[0.98] disabled:active:scale-100 ${item.available ? '[--bg:var(--color-tonal)]' : 'border border-dashed border-ink-soft'}`}
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
        onEdit={(line) => {
          const item = menu?.find((m) => m.id === line.menuItemId)
          if (item) setEditing({ item, line })
        }}
        drafts={drafts}
        showOrderNote={settings.orderNote}
        onReview={() => setReviewOpen(true)}
      />

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
        <ul className="grid grid-cols-3 gap-3 pb-2 sm:grid-cols-4">
          {tables?.map((table) => {
            const active =
              draft.destination?.type === 'table' &&
              draft.destination.tableId === table.id
            return (
              <li key={table.id}>
                <button
                  type="button"
                  aria-pressed={active}
                  onClick={() => {
                    edit(() => ({
                      destination: { type: 'table', tableId: table.id },
                    }))
                    setPickingTable(false)
                  }}
                  className={`state grid min-h-20 w-full place-items-center rounded-md text-lg font-medium ${active ? 'bg-ink text-surface' : '[--bg:var(--color-tonal)]'}`}
                >
                  {table.label}
                </button>
              </li>
            )
          })}
        </ul>
      </Dialog>

      <ReviewDialog
        open={reviewOpen}
        onOpenChange={setReviewOpen}
        drafts={drafts}
        where={where}
        onSent={(ticket) => {
          setReviewOpen(false)
          onSent(ticket)
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
  onEdit,
  onReview,
}: {
  draft: Draft
  where: string
  drafts: Drafts
  showOrderNote: boolean
  onEdit: (line: DraftLine) => void
  onReview: () => void
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
      className="grid gap-5 rounded-lg bg-tonal p-5 min-[950px]:sticky min-[950px]:top-24 min-[950px]:max-h-[calc(100dvh-7rem)] min-[950px]:grid-rows-[auto_minmax(0,1fr)_auto] min-[950px]:overflow-hidden"
    >
      <header className="flex items-start gap-3">
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
        {draft.lines.map((line) => (
          <div
            key={line.key}
            className="grid gap-2.5 border-b border-ink-soft/40 py-4"
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
            className="border-transparent"
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
          disabled={
            !draft.destination || draft.lines.length === 0 || noteTooLong
          }
          onClick={onReview}
          icon={<ArrowRight size={20} aria-hidden />}
          className="flex-row-reverse"
        >
          {t('review')}
        </Button>
        {!draft.destination && draft.lines.length > 0 && (
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
  onSent,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  drafts: Drafts
  where: string
  onSent: (ticket: string) => void
}) {
  const { t } = useI18n()
  const [send, setSend] = useState<SendState>({ status: 'idle' })
  const { draft } = drafts
  const body = toCreateOrder(draft)

  async function submit() {
    if (!body || send.status === 'sending') return
    setSend({ status: 'sending' })
    drafts.markAttempted()
    const result = await api('/api/orders', createOrderResultSchema, { body })
    if (result.ok) {
      setSend({ status: 'idle' })
      drafts.reset()
      onSent(ticketLabel(result.data.ticketNo))
      return
    }
    setSend({
      status: 'failed',
      message: result.status === 0 ? t('notSent') : failureText(result, t),
    })
  }

  return (
    <Dialog
      open={open && body !== null}
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
          ticketNo={null}
          where={where}
          takeaway={draft.destination?.type === 'takeaway'}
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
