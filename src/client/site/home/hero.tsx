import { LogIn, Plus } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import { LanguageToggle } from '../../app-bar'
import { formatIdr, useI18n } from '../../i18n'
import { useNow } from '../../lib/use-now'
import { Ticket, type TicketLine } from '../../ticket'
import { delay, line } from './shared'

// Sample content for the fragments: dishes and tables of the demo dapur.
const DISHES = [
  { id: 'ayam', name: 'Ayam Bakar Madu', price: 56_000 },
  { id: 'nasi', name: 'Nasi Goreng Kampung', price: 42_000 },
  { id: 'mie', name: 'Mie Goreng Jawa', price: 38_000 },
  { id: 'sate', name: 'Sate Ayam', price: 45_000 },
  { id: 'teh', name: 'Es Teh Lemon', price: 18_000 },
] as const
const TABLES = ['Meja 4', 'Meja 9', 'Meja 2', 'Meja 11']

export function Hero() {
  const { t } = useI18n()
  return (
    <section className="on-ink bg-ink px-4 pb-16 text-surface md:px-10 md:pb-24">
      <div className="flex min-h-18 items-center justify-between gap-2 md:min-h-24">
        <Wordmark />
        <div className="flex items-center gap-2 md:gap-4">
          <Link
            to="/masuk"
            className="state inline-flex min-h-11 items-center gap-2 rounded-full px-3 text-[15px] font-semibold text-surface [--on:var(--color-surface)]"
          >
            <LogIn size={18} aria-hidden className="max-sm:hidden" />
            {t('signInTitle')}
          </Link>
          <LanguageToggle onInk />
        </div>
      </div>
      {/* The one centred moment of the page: the promise, then the proof. */}
      <div className="mx-auto grid max-w-[60rem] justify-items-center gap-6 pt-12 text-center md:pt-20">
        <h1 className="text-[clamp(32px,7.4vw,96px)] leading-[0.98] font-semibold tracking-[-0.035em]">
          <span className="mask-line">
            <span>{t('homeHeadline1')}</span>
          </span>
          <span className="mask-line">
            <span style={delay(1)}>{t('homeHeadline2')}</span>
          </span>
        </h1>
        <p className="after-lines max-w-[44ch] text-[17px] leading-relaxed text-on-ink-soft md:text-[19px]">
          {t('siteLead')}
        </p>
        <a
          href="#cara-kerja"
          className="after-lines state inline-flex min-h-12 items-center rounded-full px-7 text-[15px] font-semibold text-ink transition-[background-color,scale] duration-150 active:scale-[0.97] [--bg:var(--color-surface)]"
        >
          {t('homeSeeHow')}
        </a>
      </div>
      <div className="after-lines mx-auto mt-14 max-w-[68rem] md:mt-20">
        <HeroDemo />
      </div>
    </section>
  )
}

function Wordmark() {
  const { t } = useI18n()
  return (
    <span
      translate="no"
      className="flex items-center gap-3 text-lg font-semibold"
    >
      {/* BrandMark inverted for the charcoal ground. */}
      <span
        aria-hidden
        className="grid size-9 shrink-0 place-items-center rounded-sm bg-surface text-[13px] font-extrabold tracking-wider text-ink"
      >
        LD
      </span>
      <span className="max-[380px]:sr-only">{t('appName')}</span>
    </span>
  )
}

type DemoTicket = {
  no: number
  where: string
  sentAt: number
  lines: TicketLine[]
}

/** The live thing: tap dishes, send, and watch the ticket land on the TV. */
function HeroDemo() {
  const { t } = useI18n()
  const now = useNow(1000)
  const [draft, setDraft] = useState<Record<string, number>>({
    ayam: 1,
    teh: 2,
  })
  const [tickets, setTickets] = useState<DemoTicket[]>(() => [
    {
      no: 3,
      where: 'Meja 7',
      sentAt: Date.now() - 95_000,
      lines: [
        line('a', 1, 'Ayam Bakar Madu', {
          note: 'Potong kecil',
          allergy: 'kacang',
        }),
      ],
    },
  ])
  const next = (tickets.at(-1)?.no ?? 0) + 1
  const table = TABLES[(next - 4) % TABLES.length] ?? 'Meja 4'
  const picked = DISHES.filter((dish) => (draft[dish.id] ?? 0) > 0)
  const total = picked.reduce(
    (sum, dish) => sum + dish.price * (draft[dish.id] ?? 0),
    0,
  )

  function send() {
    if (picked.length === 0) return
    const sent: DemoTicket = {
      no: next,
      where: table,
      sentAt: Date.now(),
      lines: picked.map((dish) =>
        line(dish.id, draft[dish.id] ?? 1, dish.name),
      ),
    }
    setTickets((list) => [...list, sent])
    setDraft({})
  }

  return (
    <section
      data-ui
      aria-label={t('homeDemoLabel')}
      className="grid overflow-hidden rounded-md text-left md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]"
    >
      {/* The waiter's tablet. */}
      <div className="grid content-start gap-3 bg-surface p-4 text-ink md:p-6">
        <div className="flex items-center justify-between gap-3">
          <span className="rounded-full bg-tonal px-3 py-1 text-[13px] font-semibold">
            {table}
          </span>
          <span className="text-[13px] text-ink-soft">{t('homeDemoTap')}</span>
        </div>
        <ul className="grid gap-1.5">
          {DISHES.map((dish) => {
            const qty = draft[dish.id] ?? 0
            return (
              <li key={dish.id}>
                <button
                  type="button"
                  onClick={() =>
                    setDraft((d) => ({ ...d, [dish.id]: Math.min(9, qty + 1) }))
                  }
                  className="state flex min-h-12 w-full items-center justify-between gap-3 rounded-sm px-3 text-left transition-[background-color,scale] duration-150 active:scale-[0.98] [--bg:var(--color-wash)]"
                >
                  <span className="text-[15px] font-medium">{dish.name}</span>
                  <span className="flex items-center gap-2 text-[13px] text-ink-soft tabular-nums">
                    {formatIdr(dish.price)}
                    {qty > 0 ? (
                      <span className="pop grid size-6 place-items-center rounded-full bg-ink text-[13px] font-semibold text-surface">
                        {qty}
                      </span>
                    ) : (
                      <span className="grid size-6 place-items-center text-ink">
                        <Plus size={16} aria-hidden />
                      </span>
                    )}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
        <button
          type="button"
          onClick={send}
          disabled={picked.length === 0}
          className="state flex min-h-12 items-center justify-between rounded-full px-5 text-[15px] font-semibold text-surface transition-[background-color,scale] duration-150 active:scale-[0.97] [--bg:var(--color-ink)] [--on:var(--color-surface)] disabled:text-ink-soft disabled:[--bg:var(--color-line)]"
        >
          <span>{t('send')}</span>
          <span className="tabular-nums">{formatIdr(total)}</span>
        </button>
      </div>
      {/* The kitchen TV: what was just sent lands here. */}
      <div className="grid content-start gap-4 bg-ink-raised p-4 text-surface md:p-6">
        <p className="flex items-center justify-between text-[17px] font-medium">
          <span className="flex items-center gap-2">
            <span aria-hidden className="size-2.5 rounded-full bg-tonal" />
            {t('laneNew')}
          </span>
          <span className="grid size-8 place-items-center rounded-full bg-surface text-[14px] font-semibold text-ink tabular-nums">
            {tickets.length}
          </span>
        </p>
        {/* Phones keep the newest ticket only; wider screens the last two. */}
        <div
          aria-live="polite"
          className="grid items-start gap-3 sm:grid-cols-2 max-sm:[&>*:not(:last-child)]:hidden"
        >
          {tickets.slice(-2).map((ticket) => (
            <Ticket
              key={ticket.no}
              className="ticket-enter"
              ticketNo={ticket.no}
              where={ticket.where}
              takeaway={false}
              lines={ticket.lines}
              orderNote={null}
              size="paper"
              aside={<Age since={ticket.sentAt} now={now} />}
            />
          ))}
        </div>
      </div>
    </section>
  )
}

function Age({ since, now }: { since: number; now: number }) {
  const seconds = Math.max(0, Math.floor((now - since) / 1000))
  const text = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
  return (
    <span className="shrink-0 rounded-full bg-tonal px-3 py-1 text-[15px] tabular-nums">
      {text}
    </span>
  )
}
