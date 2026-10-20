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
