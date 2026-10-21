import { NotebookPen, ShieldAlert, ShoppingBag } from 'lucide-react'
import type { ReactNode } from 'react'
import { ticketLabel } from '../shared/order'
import { useI18n } from './i18n'

export type TicketLine = {
  key: string
  qty: number
  name: string
  modifiers: string[]
  note: string | null
  allergy: string | null
}

type Size = 'tv' | 'paper'

// TV sizes follow BUILD.md §6 at 1920x1080: table 40px, items 32px, notes >= 22px.
const TYPE: Record<
  Size,
  {
    where: string
    no: string
    item: string
    note: string
    pad: string
    icon: number
  }
> = {
  tv: {
    where: 'text-tv-table',
    no: 'text-[22px]',
    item: 'text-tv-item',
    note: 'text-tv-note',
    pad: 'px-6',
    icon: 24,
  },
  paper: {
    where: 'text-[26px] leading-tight',
    no: 'text-sm',
    item: 'text-lg leading-snug',
    note: 'text-[15px] leading-snug',
    pad: 'px-4',
    icon: 18,
  },
}

/**
 * One ticket as the kitchen reads it. The waiter's review renders this same
 * component, so what the waiter checks is what the kitchen sees. Text wraps;
 * nothing is ever truncated.
 */
export function Ticket({
  ticketNo,
  where,
  takeaway,
  lines,
  orderNote,
  size,
  tonalHeader = false,
  aside,
  banner,
  className = '',
}: {
  ticketNo: number | null
  where: string
  takeaway: boolean
  lines: TicketLine[]
  orderNote: string | null
  size: Size
  /** Ready tickets get a soft blue header. */
  tonalHeader?: boolean
  /** Top-right slot: the age on the TV, a status elsewhere. */
  aside?: ReactNode
  /** First thing under the header, e.g. change flags; spaced like the lines. */
  banner?: ReactNode
  className?: string
}) {
  const { t } = useI18n()
  const s = TYPE[size]
  const allergies = lines.filter((line) => line.allergy)
  return (
    <article
      className={`overflow-hidden rounded-md bg-surface break-words text-ink ${className}`}
      aria-label={`${ticketNo === null ? '' : `${ticketLabel(ticketNo)} `}${where}`}
    >
      <header
        className={`flex items-start justify-between gap-3 ${s.pad} ${size === 'tv' ? 'pt-5 pb-4' : 'pt-4 pb-3'} ${tonalHeader ? 'bg-tonal' : ''}`}
      >
        <div className="grid min-w-0">
          <span
            className={`${s.where} flex items-center gap-2 font-medium tracking-tight`}
          >
            {takeaway && <ShoppingBag size={s.icon + 6} aria-hidden />}
            {where}
          </span>
          <span className={`${s.no} tabular-nums text-ink-soft`}>
            {ticketNo === null ? t('draft') : ticketLabel(ticketNo)}
          </span>
        </div>
        {aside}
      </header>
      {/* The banner shares the body's spacing; a coloured header needs room below it. */}
      <div
        className={`grid ${size === 'tv' ? 'gap-4 pb-5' : 'gap-3 pb-4'} ${s.pad} ${tonalHeader ? (size === 'tv' ? 'pt-4' : 'pt-3') : ''}`}
      >
        {banner}
        {allergies.length > 0 && (
          <AllergyBlock
            size={size}
            items={allergies.map((line) => ({
              key: line.key,
              // With one line the item is obvious; with more, name it.
              text:
                lines.length > 1
                  ? `${line.name}: ${line.allergy}`
                  : (line.allergy ?? ''),
            }))}
          />
        )}
        <ol className={`grid ${size === 'tv' ? 'gap-3' : 'gap-2.5'}`}>
          {lines.map((line) => (
            <li
              key={line.key}
              className={`${s.item} grid grid-cols-[minmax(1.5em,auto)_1fr] gap-x-[0.35em]`}
            >
              <span className="tabular-nums">{line.qty}×</span>
              <span>{line.name}</span>
              {(line.modifiers.length > 0 || line.note) && (
                <div className={`${s.note} col-start-2 grid text-ink-soft`}>
                  {line.modifiers.length > 0 && (
                    <span>{line.modifiers.join(' · ')}</span>
                  )}
                  {line.note && (
                    <span className="flex items-start gap-1.5 text-ink">
                      <NotebookPen
                        size={s.icon - 2}
                        className="mt-[0.2em] shrink-0"
                        aria-label={t('note')}
                      />
                      {line.note}
                    </span>
                  )}
                </div>
              )}
            </li>
          ))}
        </ol>
        {orderNote && (
          <p className={`${s.note} rounded-sm bg-tonal px-3 py-2`}>
            <span className="sr-only">{t('orderNote')}: </span>
            {orderNote}
          </p>
        )}
      </div>
    </article>
  )
}

/** Charcoal panel, off-white text, the word ALERGI and an icon: never colour alone. */
export function AllergyBlock({
  items,
  size,
}: {
  items: { key: string; text: string }[]
  size: Size
}) {
  const { t } = useI18n()
  const s = TYPE[size]
  return (
    <div
      className={`${s.note} grid gap-1 rounded-sm bg-ink px-3 py-2 text-surface`}
      role="note"
    >
      {items.map((item) => (
        <p key={item.key} className="flex items-start gap-2">
          <ShieldAlert
            size={s.icon}
            strokeWidth={2.5}
            className="mt-[0.15em] shrink-0"
            aria-hidden
          />
          <span>
            <strong className="font-bold tracking-[0.06em]">
              {t('allergyBlock')}
            </strong>
            {' · '}
            <span className="font-semibold">{item.text}</span>
          </span>
        </p>
      ))}
    </div>
  )
}
