import { LogIn, Plus } from 'lucide-react'
import {
  type CSSProperties,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from 'react'
import { Link } from 'react-router'
import { LanguageToggle } from '../app-bar'
import { type DictKey, formatIdr, useI18n } from '../i18n'
import { Ticket, type TicketLine } from '../ticket'
import { Switch } from '../ui/switch'

// Sample content for the fragments: dishes and tables of the demo dapur.
const DISHES = [
  { id: 'ayam', name: 'Ayam Bakar Madu', price: 56_000 },
  { id: 'nasi', name: 'Nasi Goreng Kampung', price: 42_000 },
  { id: 'teh', name: 'Es Teh Lemon', price: 18_000 },
] as const
const TABLES = ['Meja 4', 'Meja 9', 'Meja 2', 'Meja 11']

const line = (
  key: string,
  qty: number,
  name: string,
  extra: Partial<TicketLine> = {},
): TicketLine => ({
  key,
  qty,
  name,
  modifiers: [],
  note: null,
  allergy: null,
  ...extra,
})

const delay = (d: number) => ({ '--d': d }) as CSSProperties

/** The bare domain's front page: the product doing its job, in pieces. */
export function SiteHome() {
  useReveal()
  return (
    <div className="bg-surface text-ink">
      <Hero />
      <figure className="h-[38svh] overflow-hidden md:h-[62svh]">
        <PhotoGrill />
      </figure>
      <HowItWorks />
      <SettingBands />
      <OwnerView />
      <EveryKitchen />
      <Setup />
      <SiteFooter />
    </div>
  )
}

/** Marks [data-reveal] elements `is-in` once they scroll into view. */
function useReveal() {
  useEffect(() => {
    const items = document.querySelectorAll('[data-reveal]')
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue
          entry.target.classList.add('is-in')
          io.unobserve(entry.target)
        }
      },
      { rootMargin: '0px 0px -8% 0px' },
    )
    for (const item of items) io.observe(item)
    return () => io.disconnect()
  }, [])
}

function useNow(everyMs: number) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), everyMs)
    return () => clearInterval(timer)
  }, [everyMs])
  return now
}

function Hero() {
  const { t } = useI18n()
  return (
    <section className="on-ink grid bg-ink text-surface md:min-h-svh md:grid-cols-2">
      <div className="order-2 flex flex-col justify-between gap-16 px-5 pt-10 pb-12 md:order-1 md:p-10">
        <Wordmark className="hidden md:flex" />
        <div className="grid max-w-[46ch] gap-5">
          <h1 className="text-[clamp(26px,6.4vw,32px)] leading-[1.15] font-medium tracking-[-0.02em] md:text-[32px]">
            <span className="mask-line">
              <span>{t('homeHeadline1')}</span>
            </span>
            <span className="mask-line">
              <span style={delay(1)}>{t('homeHeadline2')}</span>
            </span>
          </h1>
          <p className="after-lines text-[17px] leading-relaxed text-on-ink-soft">
            {t('siteLead')}
          </p>
          <a
            href="#cara-kerja"
            className="after-lines state inline-flex min-h-12 w-fit items-center rounded-full px-6 text-[15px] font-semibold text-ink transition-[background-color,scale] duration-150 active:scale-[0.97] [--bg:var(--color-surface)]"
          >
            {t('homeSeeHow')}
          </a>
        </div>
      </div>
      <div className="relative order-1 grid place-items-center bg-ink-raised px-4 pt-24 pb-10 md:order-2 md:px-10 md:pt-28">
        {/* One row, so the wordmark and the controls never meet on a phone. */}
        <div className="absolute inset-x-0 top-0 flex items-center justify-between gap-2 p-4 md:justify-end md:gap-4 md:px-10 md:pt-8">
          <Wordmark className="md:hidden" />
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
        <HeroDemo />
      </div>
    </section>
  )
}

function Wordmark({ className = '' }: { className?: string }) {
  const { t } = useI18n()
  return (
    <span
      translate="no"
      className={`flex items-center gap-3 text-lg font-semibold ${className}`}
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
      className="w-full max-w-[460px] overflow-hidden rounded-md bg-surface text-ink"
    >
      <div className="grid gap-3 p-4">
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
      <div className="grid gap-3 bg-ink p-4 text-surface">
        <p className="flex items-center justify-between text-[15px] font-medium">
          <span className="flex items-center gap-2">
            <span aria-hidden className="size-2 rounded-full bg-tonal" />
            {t('laneNew')}
          </span>
          <span className="grid size-7 place-items-center rounded-full bg-surface text-[13px] font-semibold text-ink tabular-nums">
            {tickets.length}
          </span>
        </p>
        {/* Phones keep the newest ticket only; wider screens the last two. */}
        <div
          aria-live="polite"
          className="grid gap-3 max-md:[&>*:not(:last-child)]:hidden"
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

function PhotoGrill() {
  const { t } = useI18n()
  return (
    <img
      src="/site/sate-grill.webp"
      width={1600}
      height={600}
      alt={t('homePhotoGrill')}
      loading="lazy"
      className="drift size-full object-cover"
    />
  )
}

const STEPS: { title: DictKey; note: DictKey }[] = [
  { title: 'homeHow1', note: 'homeHow1Note' },
  { title: 'homeHow2', note: 'homeHow2Note' },
  { title: 'homeHow3', note: 'homeHow3Note' },
]

/** Three statements scroll past one stage that shows each step. */
function HowItWorks() {
  const { t } = useI18n()
  const [active, setActive] = useState(0)
  const blocks = useRef<(HTMLDivElement | null)[]>([])

  useEffect(() => {
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue
          const index = blocks.current.indexOf(entry.target as HTMLDivElement)
          if (index >= 0) setActive(index)
        }
      },
      { rootMargin: '-45% 0px -45% 0px' },
    )
    for (const block of blocks.current) if (block) io.observe(block)
    return () => io.disconnect()
  }, [])

  return (
    <section
      id="cara-kerja"
      aria-labelledby="how-title"
      className="mx-auto grid max-w-6xl scroll-mt-4 px-5 pt-28 pb-16 md:grid-cols-12 md:gap-x-10 md:px-10 md:pt-40"
    >
      <h2
        id="how-title"
        data-reveal
        className="text-[28px] font-medium tracking-[-0.02em] md:col-span-5 md:row-start-1"
      >
        {t('homeHowTitle')}
      </h2>
      <div
        aria-hidden
        className="sticky top-0 z-10 -mx-5 mt-6 h-[46svh] overflow-hidden bg-wash md:top-[14vh] md:col-span-7 md:col-start-6 md:row-span-2 md:row-start-1 md:mx-0 md:mt-0 md:h-[540px] md:self-start"
      >
        {[
          <StepTablet key="tablet" />,
          <StepTv key="tv" />,
          <StepPhone key="phone" />,
        ].map((fragment, index) => (
          <div
            key={STEPS[index]?.title}
            inert
            className={`absolute inset-0 grid place-items-center p-4 transition-[opacity,translate] duration-500 ease-[var(--ease-out)] md:p-10 ${index === active ? 'opacity-100' : 'pointer-events-none translate-y-4 opacity-0'}`}
          >
            {fragment}
          </div>
        ))}
      </div>
      <div className="md:col-span-5 md:row-start-2">
        {STEPS.map((step, index) => (
          <div
            key={step.title}
            ref={(el) => {
              blocks.current[index] = el
            }}
            className="flex min-h-[60svh] flex-col justify-center gap-3 md:min-h-[80vh]"
          >
            <p
              className={`text-[22px] leading-tight font-medium tracking-[-0.02em] transition-colors duration-300 md:text-[32px] ${index === active ? 'text-ink' : 'text-ink-soft'}`}
            >
              {t(step.title)}
            </p>
            <p className="max-w-[44ch] text-[17px] leading-relaxed">
              {t(step.note)}
            </p>
          </div>
        ))}
      </div>
    </section>
  )
}

const REVIEW_LINES = [
  line('a', 1, 'Ayam Bakar Madu', { note: 'Potong kecil', allergy: 'kacang' }),
  line('t', 2, 'Es Teh Lemon'),
]

function StepTablet() {
  const { t } = useI18n()
  return (
    <div data-ui className="grid w-full max-w-[360px] gap-3">
      <Ticket
        ticketNo={null}
        where="Meja 4"
        takeaway={false}
        lines={REVIEW_LINES}
        orderNote={null}
        size="paper"
      />
      <div className="flex min-h-12 items-center justify-between rounded-full bg-ink px-5 text-[15px] font-semibold text-surface">
        <span>{t('send')}</span>
        <span className="tabular-nums">{formatIdr(92_000)}</span>
      </div>
    </div>
  )
}

function StepTv() {
  const { t } = useI18n()
  return (
    <div
      data-ui
      className="grid w-full max-w-[400px] gap-3 rounded-md bg-ink p-4 text-surface"
    >
      <p className="flex items-center justify-between text-[15px] font-medium">
        <span className="flex items-center gap-2">
          <span aria-hidden className="size-2 rounded-full bg-tonal" />
          {t('laneNew')}
        </span>
        <span className="grid size-7 place-items-center rounded-full bg-surface text-[13px] font-semibold text-ink">
          1
        </span>
      </p>
      <Ticket
        ticketNo={4}
        where="Meja 4"
        takeaway={false}
        lines={REVIEW_LINES}
        orderNote={null}
        size="paper"
        aside={
          <span className="shrink-0 rounded-full bg-tonal px-3 py-1 text-[15px] tabular-nums text-ink">
            0:42
          </span>
        }
      />
    </div>
  )
}

function StepPhone() {
  const { t } = useI18n()
  const steps: DictKey[] = ['saved', 'onTv', 'accepted', 'ready']
  return (
    <div data-ui className="grid w-full max-w-[340px] gap-3">
      <Ticket
        ticketNo={4}
        where="Meja 4"
        takeaway={false}
        lines={REVIEW_LINES}
        orderNote={null}
        size="paper"
        tonalHeader
        aside={
          <span className="shrink-0 rounded-full bg-surface px-3 py-1 text-[13px] font-semibold">
            {t('ready')}
          </span>
        }
      />
      <ol className="grid grid-cols-4 gap-1.5 text-[13px] leading-tight">
        {steps.map((key) => (
          <li key={key} className="grid gap-1.5">
            <span aria-hidden className="h-1.5 rounded-full bg-ink" />
            {t(key)}
          </li>
        ))}
      </ol>
    </div>
  )
}

const SETTINGS = [
  {
    key: 'lineNotes',
    text: 'homeSwitchNotes',
    on: 'homeSwitchNotesOn',
    fill: 'bg-tonal',
  },
  {
    key: 'orderNote',
    text: 'homeSwitchOrderNote',
    on: 'homeSwitchOrderNoteOn',
    fill: 'bg-wash',
  },
  {
    key: 'allergy',
    text: 'homeSwitchAllergy',
    on: 'homeSwitchAllergyOn',
    fill: 'bg-tonal',
  },
  {
    key: 'staffPins',
    text: 'homeSwitchPins',
    on: 'homeSwitchPinsOn',
    fill: 'bg-wash',
  },
] as const

/** The admin's real switches, one sentence each. */
function SettingBands() {
  const { t } = useI18n()
  const [on, setOn] = useState<Record<string, boolean>>({
    lineNotes: true,
    allergy: true,
  })
  return (
    <section aria-labelledby="settings-title" className="pt-16 md:pt-28">
      <h2 id="settings-title" className="sr-only">
        {t('homeSettingsTitle')}
      </h2>
      {SETTINGS.map((row, index) => {
        const checked = on[row.key] ?? false
        return (
          <div
            key={row.key}
            className={`transition-colors duration-300 ${checked ? row.fill : 'bg-surface'}`}
          >
            <div
              data-reveal
              style={delay(index)}
              className="mx-auto grid min-h-[132px] max-w-6xl grid-cols-[1fr_auto] items-center gap-6 px-5 py-6 md:min-h-[20vh] md:px-10"
            >
              <div className="grid gap-2">
                <p
                  className={`text-[22px] leading-tight font-medium tracking-[-0.02em] transition-colors duration-300 md:text-[36px] ${checked ? 'text-ink' : 'text-ink-soft'}`}
                >
                  {t(row.text)}
                </p>
                {checked && (
                  <p className="rise text-[15px] md:text-[17px]">{t(row.on)}</p>
                )}
              </div>
              <div data-ui>
                <Switch
                  label={t(row.text)}
                  hideLabel
                  checked={checked}
                  onChange={(value) =>
                    setOn((s) => ({ ...s, [row.key]: value }))
                  }
                />
              </div>
            </div>
          </div>
        )
      })}
    </section>
  )
}

const OUTPUTS: { id: string; name: DictKey }[] = [
  { id: 'today', name: 'homeOutToday' },
  { id: 'history', name: 'homeOutHistory' },
  { id: 'export', name: 'homeOutExport' },
]

/** What the owner keeps: pick a name, the sheet beside it changes. */
function OwnerView() {
  const { t } = useI18n()
  const [shown, setShown] = useState('today')
  return (
    <section
      aria-labelledby="owner-title"
      className="mx-auto grid max-w-6xl gap-8 px-5 pt-32 md:grid-cols-12 md:gap-x-10 md:px-10 md:pt-48"
    >
      <h2 id="owner-title" className="sr-only">
        {t('homeOwnerTitle')}
      </h2>
      <div
        data-reveal
        className="flex snap-x gap-6 overflow-x-auto md:col-span-5 md:grid md:content-center md:gap-2 md:overflow-visible"
      >
        {OUTPUTS.map((output) => (
          <button
            key={output.id}
            type="button"
            aria-pressed={shown === output.id}
            onClick={() => setShown(output.id)}
            className={`shrink-0 snap-start text-left text-[22px] leading-[1.1] font-medium tracking-[-0.02em] transition-colors duration-200 hover:text-ink md:text-[clamp(36px,4vw,56px)] ${shown === output.id ? 'text-ink' : 'text-ink-soft'}`}
          >
            {t(output.name)}
          </button>
        ))}
        <p className="hidden max-w-[40ch] pt-6 text-[17px] leading-relaxed md:block">
          {t('homeOwnerNote')}
        </p>
      </div>
      <div
        data-reveal
        style={delay(1)}
        aria-live="polite"
        className="relative h-[70svh] overflow-hidden bg-wash md:col-span-7 md:h-[88svh] md:max-h-[760px]"
      >
        <div
          key={shown}
          className="rise absolute top-4 left-4 md:top-[72px] md:left-16"
        >
          {shown === 'today' && <SheetToday />}
          {shown === 'history' && <SheetHistory />}
          {shown === 'export' && <SheetExport />}
        </div>
      </div>
      <p className="text-[17px] leading-relaxed md:hidden">
        {t('homeOwnerNote')}
      </p>
    </section>
  )
}

function Sheet({ width, children }: { width: number; children: ReactNode }) {
  return (
    <div
      data-ui
      style={{ width }}
      className="grid gap-4 rounded-md bg-surface p-5 text-ink"
    >
      {children}
    </div>
  )
}

function SheetToday() {
  const { t } = useI18n()
  const stats: [DictKey, string][] = [
    ['statOrders', '48'],
    ['statServed', '45'],
    ['statCancelled', '1'],
    ['statReady', t('minutes', { min: 11 })],
  ]
  const screens: [DictKey, number, number][] = [
    ['roleWaiter', 2, 2],
    ['roleKitchen', 1, 1],
    ['roleTv', 1, 1],
  ]
  return (
    <Sheet width={560}>
      <p className="text-xl font-medium">{t('homeOutToday')}</p>
      <div className="grid grid-cols-2 gap-2">
        {stats.map(([label, value]) => (
          <div key={label} className="grid gap-1 rounded-sm bg-wash p-3">
            <span className="text-[13px] text-ink-soft">{t(label)}</span>
            <span className="text-2xl font-medium tabular-nums">{value}</span>
          </div>
        ))}
        <div className="col-span-2 grid gap-1 rounded-sm bg-wash p-3">
          <span className="text-[13px] text-ink-soft">{t('statRevenue')}</span>
          <span className="text-2xl font-medium tabular-nums">
            {formatIdr(2_316_000)}
          </span>
        </div>
      </div>
      <ul className="grid gap-2 text-[15px]">
        {screens.map(([role, online, total]) => (
          <li
            key={role}
            className="flex items-center justify-between rounded-sm bg-wash px-3 py-2.5"
          >
            {t(role)}
            <span className="flex items-center gap-2 text-[13px] tabular-nums">
              <span aria-hidden className="size-2 rounded-full bg-ink" />
              {t('onlineCount', { online, total })}
            </span>
          </li>
        ))}
      </ul>
    </Sheet>
  )
}

const HISTORY_ROWS = [
  {
    no: 'A-045',
    where: 'Meja 3',
    status: 'served',
    total: 74_000,
    at: '19:38',
  },
  {
    no: 'A-046',
    where: 'Bawa pulang',
    status: 'served',
    total: 42_000,
    at: '19:42',
  },
  {
    no: 'A-047',
    where: 'Meja 9',
    status: 'cancelled',
    total: 18_000,
    at: '19:47',
  },
  {
    no: 'A-048',
    where: 'Meja 4',
    status: 'served',
    total: 92_000,
    at: '19:51',
  },
] as const

function SheetHistory() {
  const { t } = useI18n()
  return (
    <Sheet width={560}>
      <p className="text-xl font-medium">{t('historyTitle')}</p>
      <table className="w-full text-left text-[13px] tabular-nums">
        <thead className="text-ink-soft">
          <tr>
            <th className="py-2 font-medium">{t('colTicket')}</th>
            <th className="py-2 font-medium">{t('colWhere')}</th>
            <th className="py-2 font-medium">{t('colStatus')}</th>
            <th className="py-2 text-right font-medium">{t('total')}</th>
            <th className="py-2 text-right font-medium">{t('colSent')}</th>
          </tr>
        </thead>
        <tbody>
          {HISTORY_ROWS.map((row) => (
            <tr key={row.no} className="border-t border-line">
              <td className="py-2.5 font-medium">{row.no}</td>
              <td className="py-2.5">{row.where}</td>
              <td className="py-2.5">{t(row.status)}</td>
              <td
                className={`py-2.5 text-right ${row.status === 'cancelled' ? 'text-ink-soft line-through' : ''}`}
              >
                {formatIdr(row.total)}
              </td>
              <td className="py-2.5 text-right">{row.at}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Sheet>
  )
}

const CSV = `service_day,ticket,status,destination,created_at,created_by,item,modifiers,qty,unit_price_idr,line_total_idr
2026-10-20,A-048,served,Meja 4,2026-10-20T12:51:04.000Z,Rina,Ayam Bakar Madu,,1,56000,56000
2026-10-20,A-048,served,Meja 4,2026-10-20T12:51:04.000Z,Rina,Es Teh Lemon,,2,18000,36000
2026-10-20,A-046,served,takeaway,2026-10-20T12:42:17.000Z,Rina,Nasi Goreng Kampung,,1,42000,42000`

function SheetExport() {
  return (
    <Sheet width={640}>
      <p className="text-xl font-medium">riwayat-2026-10-20.csv</p>
      <pre className="overflow-hidden text-[13px] leading-relaxed whitespace-pre">
        {CSV}
      </pre>
    </Sheet>
  )
}

/** Many dapur: a real warung table beside what the platform holds for each. */
function EveryKitchen() {
  const { t } = useI18n()
  return (
    <section
      aria-labelledby="every-title"
      className="mx-auto grid max-w-6xl items-center gap-8 px-5 pt-32 lg:grid-cols-12 lg:gap-x-10 md:px-10 md:pt-48"
    >
      <img
        data-reveal
        src="/site/warung-table.webp"
        width={1400}
        height={1050}
        alt={t('homePhotoWarung')}
        loading="lazy"
        className="aspect-[4/3] w-full object-cover lg:col-span-6"
      />
      <div className="grid gap-5 lg:col-span-6">
        <h2
          id="every-title"
          data-reveal
          className="text-[28px] leading-tight font-medium tracking-[-0.02em] md:text-[36px]"
        >
          {t('homeEveryTitle')}
        </h2>
        <p
          data-reveal
          style={delay(1)}
          className="max-w-[48ch] text-[17px] leading-relaxed"
        >
          {t('homeEveryBody')}
        </p>
      </div>
    </section>
  )
}

const DEVICES: {
  id: string
  role: DictKey
  done: DictKey
  doneNote: DictKey
}[] = [
  {
    id: 'tv',
    role: 'roleTv',
    done: 'homeSetupTvDone',
    doneNote: 'homeSetupTvDoneNote',
  },
  {
    id: 'tablet',
    role: 'roleWaiter',
    done: 'homeSetupTabletDone',
    doneNote: 'homeSetupTabletDoneNote',
  },
  {
    id: 'phone',
    role: 'roleKitchen',
    done: 'homeSetupPhoneDone',
    doneNote: 'homeSetupPhoneDoneNote',
  },
]

/** Setting up, per device: open, read the code, approve, done. */
function Setup() {
  const { t } = useI18n()
  const [shown, setShown] = useState('tv')
  const device = DEVICES.find((d) => d.id === shown) ?? DEVICES[0]
  if (!device) return null
  const rows: [DictKey, string, string][] = [
    ['homeSetupOpen', t('homeSetupOpenTitle'), t('homeSetupOpenNote')],
    ['homeSetupCode', t('homeSetupCodeTitle'), t('homeSetupCodeNote')],
    [
      'homeSetupApprove',
      t('homeSetupApproveTitle'),
      t('homeSetupApproveNote', { role: t(device.role) }),
    ],
    ['homeSetupDone', t(device.done), t(device.doneNote)],
  ]
  return (
    <section
      aria-labelledby="setup-title"
      className="mx-auto grid max-w-6xl gap-14 px-5 pt-32 md:px-10 md:pt-48"
    >
      <div className="flex flex-wrap items-end justify-between gap-6">
        <h2
          id="setup-title"
          data-reveal
          className="text-[28px] leading-[1.1] font-medium tracking-[-0.02em] md:text-[clamp(36px,4vw,56px)]"
        >
          <span className="block text-ink-soft">{t('homeSetupTitle1')}</span>
          <span className="block">{t('homeSetupTitle2')}</span>
        </h2>
        <Link
          to="/masuk"
          className="state inline-flex min-h-12 items-center gap-2 rounded-full px-6 text-[15px] font-semibold text-surface transition-[background-color,scale] duration-150 active:scale-[0.97] max-sm:w-full max-sm:justify-center [--bg:var(--color-ink)] [--on:var(--color-surface)]"
        >
          <LogIn size={18} aria-hidden />
          {t('homeSignInOwner')}
        </Link>
      </div>
      <div className="grid gap-4 md:grid-cols-[150px_1fr] md:gap-10">
        <div className="sticky top-0 z-10 grid grid-cols-3 gap-1.5 bg-surface py-2 md:static md:grid-cols-1 md:content-start md:py-0">
          {DEVICES.map((d) => (
            <button
              key={d.id}
              type="button"
              aria-pressed={shown === d.id}
              onClick={() => setShown(d.id)}
              className={`state min-h-16 rounded-sm px-3 text-left text-[15px] font-medium transition-[background-color] duration-200 ${shown === d.id ? 'text-surface [--bg:var(--color-ink)] [--on:var(--color-surface)]' : '[--bg:var(--color-wash)]'}`}
            >
              {t(d.role)}
            </button>
          ))}
        </div>
        <ul aria-live="polite" className="grid gap-1">
          {rows.map(([verb, title, note], index) => (
            <li
              key={`${shown}-${verb}`}
              style={delay(index)}
              className={`rise grid gap-1 rounded-sm px-5 py-4 md:grid-cols-[140px_1fr] md:items-center md:gap-6 ${index % 2 === 0 ? 'bg-wash' : 'bg-tonal'}`}
            >
              <span className="text-[17px] font-semibold">{t(verb)}</span>
              <span className="grid gap-0.5">
                <span className="text-[17px] font-medium">{title}</span>
                <span className="text-[15px] text-ink-soft">{note}</span>
              </span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}

function SiteFooter() {
  const { t } = useI18n()
  const credit = (
    title: string,
    href: string,
    by: string,
    licence: string,
    licenceHref: string,
  ) => (
    <>
      <a className="underline underline-offset-4" href={href}>
        “{title}”
      </a>{' '}
      {t('homeBy')} {by},{' '}
      <a className="underline underline-offset-4" href={licenceHref}>
        {licence}
      </a>
    </>
  )
  return (
    <footer className="mx-auto grid max-w-6xl gap-8 px-5 pt-[24svh] pb-6 text-[15px] md:px-10 md:pt-[30svh]">
      <p className="max-w-[80ch] text-ink">
        {t('homePhotos')}:{' '}
        {credit(
          'Sate ayam-Jakarta',
          'https://commons.wikimedia.org/wiki/File:Sate_ayam-Jakarta.JPG',
          'Lord Mountbatten',
          'CC BY-SA 4.0',
          'https://creativecommons.org/licenses/by-sa/4.0',
        )}{' '}
        ({t('homeCropped')});{' '}
        {credit(
          'Malang Food Warungs',
          'https://commons.wikimedia.org/wiki/File:Malang_Food_Warungs.jpg',
          'Hugo van den Bos',
          'CC BY 2.0',
          'https://creativecommons.org/licenses/by/2.0',
        )}
        . {t('homeVia')}
      </p>
      <div className="grid gap-2 md:grid-cols-[1fr_auto_1fr] md:items-baseline">
        <span className="text-ink-soft">{t('homeFooterWhat')}</span>
        <nav aria-label={t('appName')} className="flex gap-6">
          <a href="#cara-kerja" className="underline-offset-4 hover:underline">
            {t('homeHowShort')}
          </a>
          <Link to="/masuk" className="underline-offset-4 hover:underline">
            {t('signInTitle')}
          </Link>
        </nav>
        <span className="text-ink-soft md:text-right">
          © 2026 {t('appName')}
        </span>
      </div>
    </footer>
  )
}
