import { ChevronRight } from 'lucide-react'
import { type ReactNode, useState } from 'react'
import { type DictKey, formatIdr, useI18n } from '../../i18n'
import { delay } from './shared'

const OUTPUTS: { id: string; name: DictKey }[] = [
  { id: 'today', name: 'homeOutToday' },
  { id: 'history', name: 'homeOutHistory' },
  { id: 'export', name: 'homeOutExport' },
]

/** What the owner keeps: pick a name, the sheet beside it changes. */
export function OwnerView() {
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
        className="flex flex-wrap gap-2 md:col-span-5 md:grid md:content-center"
      >
        {OUTPUTS.map((output) => {
          const active = shown === output.id
          return (
            <button
              key={output.id}
              type="button"
              aria-pressed={active}
              onClick={() => setShown(output.id)}
              className={`state group flex min-h-12 border items-center justify-between gap-3 rounded-full px-5 text-left text-[17px] font-medium tracking-[-0.01em] transition-[background-color,color,scale] duration-200 active:scale-[0.98] md:min-h-16 md:rounded-md md:text-[clamp(24px,2.6vw,36px)] ${active ? 'border-transparent text-ink [--bg:var(--color-tonal)]' : 'border-line text-ink-soft hover:text-ink md:border-transparent'}`}
            >
              {t(output.name)}
              <ChevronRight
                aria-hidden
                className={`hidden size-7 shrink-0 transition-[opacity,translate] duration-200 md:block ${active ? 'opacity-100' : 'opacity-0 group-hover:translate-x-1 group-hover:opacity-60'}`}
              />
            </button>
          )
        })}
        <p className="hidden max-w-[40ch] pt-6 text-[17px] leading-relaxed md:block">
          {t('homeOwnerNote')}
        </p>
      </div>
      <div
        data-reveal
        style={delay(1)}
        aria-live="polite"
        className="grid place-items-center bg-wash p-3 sm:p-6 md:col-span-7 md:min-h-[620px] md:p-10"
      >
        <div
          key={shown}
          className="rise grid w-full min-w-0 justify-items-center"
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

function Sheet({ children }: { children: ReactNode }) {
  return (
    <div
      data-ui
      className="grid w-full max-w-[560px] min-w-0 gap-4 rounded-md bg-surface p-4 text-ink sm:p-5"
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
    <Sheet>
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
    tableNo: 3,
    status: 'served',
    total: 74_000,
    at: '19:38',
  },
  {
    no: 'A-046',
    tableNo: null,
    status: 'served',
    total: 42_000,
    at: '19:42',
  },
  {
    no: 'A-047',
    tableNo: 9,
    status: 'cancelled',
    total: 18_000,
    at: '19:47',
  },
  {
    no: 'A-048',
    tableNo: 4,
    status: 'served',
    total: 92_000,
    at: '19:51',
  },
] as const

function SheetHistory() {
  const { t } = useI18n()
  return (
    <Sheet>
      <p className="text-xl font-medium">{t('historyTitle')}</p>
      <div className="-mx-1 overflow-x-auto px-1">
        <table className="w-full min-w-[420px] text-left text-[13px] tabular-nums">
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
                <td className="py-2.5">
                  {row.tableNo === null
                    ? t('takeaway')
                    : `${t('table')} ${row.tableNo}`}
                </td>
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
      </div>
    </Sheet>
  )
}

const CSV = {
  en: `service_day,ticket,status,destination,created_at,created_by,item,modifiers,qty,unit_price_idr,line_total_idr
2026-10-20,A-048,served,Table 4,2026-10-20T12:51:04.000Z,Rina,Honey Grilled Chicken,,1,56000,56000
2026-10-20,A-048,served,Table 4,2026-10-20T12:51:04.000Z,Rina,Iced Lemon Tea,,2,18000,36000
2026-10-20,A-046,served,takeaway,2026-10-20T12:42:17.000Z,Rina,Kampung Fried Rice,,1,42000,42000`,
  id: `service_day,ticket,status,destination,created_at,created_by,item,modifiers,qty,unit_price_idr,line_total_idr
2026-10-20,A-048,served,Meja 4,2026-10-20T12:51:04.000Z,Rina,Ayam Bakar Madu,,1,56000,56000
2026-10-20,A-048,served,Meja 4,2026-10-20T12:51:04.000Z,Rina,Es Teh Lemon,,2,18000,36000
2026-10-20,A-046,served,takeaway,2026-10-20T12:42:17.000Z,Rina,Nasi Goreng Kampung,,1,42000,42000`,
} as const

function SheetExport() {
  const { lang } = useI18n()
  return (
    <Sheet>
      <p className="text-xl font-medium break-all">
        {lang === 'id' ? 'riwayat-2026-10-20.csv' : 'history-2026-10-20.csv'}
      </p>
      <pre className="overflow-x-auto text-[12px] leading-relaxed whitespace-pre sm:text-[13px]">
        {CSV[lang]}
      </pre>
    </Sheet>
  )
}
