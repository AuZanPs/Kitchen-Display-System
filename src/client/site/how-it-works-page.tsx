import {
  ArrowRight,
  Check,
  KeyRound,
  Layers,
  ShieldCheck,
  WifiOff,
} from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import { type DictKey, formatIdr, useI18n } from '../i18n'
import { stagger } from '../lib/stagger'
import { Ticket } from '../ticket'
import { Device, DeviceStage } from './home/device'
import { Age, SendFace } from './home/hero'
import { delay, line } from './home/shared'
import { SiteFooter } from './home/site-footer'
import { SiteBar } from './site-pages'

const VENUE_PHOTOS = [
  { src: '/site/warung.webp', alt: 'homePhotoWarung' },
  { src: '/site/kedai.webp', alt: 'homePhotoCafe' },
  { src: '/site/rumah-makan.webp', alt: 'homePhotoRestaurant' },
] as const

type ScreenId = 'waiter' | 'tv' | 'kitchen' | 'admin'

const SCREENS: {
  id: ScreenId
  label: DictKey
  desc: DictKey
  points: [DictKey, DictKey, DictKey]
}[] = [
  {
    id: 'waiter',
    label: 'roleWaiter',
    desc: 'howTabWaiterDesc',
    points: ['howTabWaiterPoint1', 'howTabWaiterPoint2', 'howTabWaiterPoint3'],
  },
  {
    id: 'tv',
    label: 'roleTv',
    desc: 'howTabTvDesc',
    points: ['howTabTvPoint1', 'howTabTvPoint2', 'howTabTvPoint3'],
  },
  {
    id: 'kitchen',
    label: 'roleKitchen',
    desc: 'howTabKitchenDesc',
    points: [
      'howTabKitchenPoint1',
      'howTabKitchenPoint2',
      'howTabKitchenPoint3',
    ],
  },
  {
    id: 'admin',
    label: 'adminTitle',
    desc: 'howTabAdminDesc',
    points: ['howTabAdminPoint1', 'howTabAdminPoint2', 'howTabAdminPoint3'],
  },
]

const FLOW: { no: string; title: DictKey; body: DictKey }[] = [
  { no: '01', title: 'howFlow1Title', body: 'howFlow1Body' },
  { no: '02', title: 'howFlow2Title', body: 'howFlow2Body' },
  { no: '03', title: 'howFlow3Title', body: 'howFlow3Body' },
  { no: '04', title: 'howFlow4Title', body: 'howFlow4Body' },
]

const TRUST = [
  {
    icon: WifiOff,
    title: 'howTrust1Title',
    body: 'howTrust1Body',
  },
  {
    icon: Layers,
    title: 'howTrust2Title',
    body: 'howTrust2Body',
  },
  {
    icon: KeyRound,
    title: 'howTrust3Title',
    body: 'howTrust3Body',
  },
  {
    icon: ShieldCheck,
    title: 'howTrust4Title',
    body: 'howTrust4Body',
  },
] as const

/** Dedicated page walking through every screen, order step, pairing and security. */
export function HowItWorksPage() {
  const { t } = useI18n()
  const [activeScreen, setActiveScreen] = useState<ScreenId>('waiter')

  const currentScreen = SCREENS.find((s) => s.id === activeScreen) ?? SCREENS[0]

  return (
    <div className="min-h-dvh bg-surface text-ink">
      <SiteBar />
      <main className="mx-auto grid max-w-5xl gap-16 px-4 pt-8 sm:px-6 md:gap-24 md:pt-14">
        {/* Hero */}
        <section className="rise grid max-w-3xl gap-5">
          <span className="w-fit rounded-full bg-tonal px-3.5 py-1 text-[13px] font-semibold tracking-wide uppercase">
            {t('howEyebrow')}
          </span>
          <h1 className="text-[clamp(34px,5.6vw,56px)] leading-[1.04] font-semibold tracking-[-0.03em]">
            {t('howPageTitle')}
          </h1>
          <p className="max-w-[58ch] text-[17px] leading-relaxed text-ink-soft md:text-[19px]">
            {t('howPageLead')}
          </p>
          <div className="flex flex-wrap items-center gap-3 pt-1">
            <Link
              to="/sign-in"
              className="state inline-flex min-h-12 items-center gap-2 rounded-full px-7 text-[15px] font-semibold text-surface transition-[background-color,scale] duration-150 active:scale-[0.97] [--bg:var(--color-ink)] [--on:var(--color-surface)]"
            >
              {t('startFree')}
              <ArrowRight size={18} aria-hidden />
            </Link>
            <Link
              to="/pricing"
              className="state inline-flex min-h-12 items-center rounded-full px-6 text-[15px] font-semibold [--bg:var(--color-wash)]"
            >
              {t('pricingTitle')}
            </Link>
          </div>
        </section>

        {/* Interactive 4-Screen Live Explorer */}
        <section
          aria-labelledby="screens-title"
          className="on-ink rise grid gap-6 rounded-lg bg-ink p-5 text-surface sm:p-8 md:p-10"
        >
          <div className="grid gap-2">
            <h2
              id="screens-title"
              className="text-[24px] leading-tight font-medium tracking-[-0.02em] sm:text-[32px]"
            >
              {t('howScreensTitle')}
            </h2>
            <p className="text-[15px] text-on-ink-soft sm:text-[17px]">
              {t('howScreensLead')}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {SCREENS.map((screen) => {
              const selected = screen.id === activeScreen
              return (
                <button
                  key={screen.id}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => setActiveScreen(screen.id)}
                  className={`state min-h-12 rounded-full px-4 text-[14px] font-semibold transition-colors sm:text-[15px] ${
                    selected
                      ? 'text-ink [--bg:var(--color-surface)] [--on:var(--color-ink)]'
                      : 'text-surface [--bg:var(--color-ink-raised)] [--on:var(--color-surface)]'
                  }`}
                >
                  {t(screen.label)}
                </button>
              )
            })}
          </div>

          <div
            key={currentScreen.id}
            aria-live="polite"
            className="rise grid items-start gap-6 pt-2 md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] md:gap-8"
          >
            <div className="grid gap-4">
              <h3 className="text-xl font-medium">{t(currentScreen.label)}</h3>
              <p className="text-[15px] leading-relaxed text-on-ink-soft sm:text-[16px]">
                {t(currentScreen.desc)}
              </p>
              <ul className="grid gap-3 pt-1 text-[15px] leading-snug">
                {currentScreen.points.map((pt) => (
                  <li key={pt} className="flex gap-3">
                    <Check
                      size={18}
                      strokeWidth={2.5}
                      aria-hidden
                      className="mt-0.5 shrink-0"
                    />
                    <span>{t(pt)}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div data-ui className="min-w-0">
              {currentScreen.id === 'waiter' && <PreviewWaiter />}
              {currentScreen.id === 'tv' && <PreviewTv />}
              {currentScreen.id === 'kitchen' && <PreviewKitchen />}
              {currentScreen.id === 'admin' && <PreviewAdmin />}
            </div>
          </div>
        </section>

        {/* 4-Step Order Lifecycle */}
        <section aria-labelledby="flow-title" className="grid gap-6">
          <h2
            id="flow-title"
            className="text-[26px] leading-tight font-medium tracking-[-0.02em] sm:text-[34px]"
          >
            {t('howFlowTitle')}
          </h2>
          <div className="grid gap-3 sm:grid-cols-3">
            <DeviceStage className="relative w-full overflow-hidden rounded-md bg-ink">
              <div inert className="absolute inset-0">
                <StepTablet />
              </div>
            </DeviceStage>
            <DeviceStage className="relative w-full overflow-hidden rounded-md bg-ink">
              <div inert className="absolute inset-0">
                <StepTv />
              </div>
            </DeviceStage>
            <DeviceStage className="relative w-full overflow-hidden rounded-md bg-ink">
              <div inert className="absolute inset-0">
                <StepPhone />
              </div>
            </DeviceStage>
          </div>
          <ol className="grid gap-4 md:grid-cols-2">
            {FLOW.map((step, index) => (
              <li
                key={step.no}
                style={stagger(index)}
                className="rise grid content-start gap-3 rounded-lg bg-wash p-6 sm:p-7"
              >
                <span className="w-fit rounded-full bg-tonal px-3 py-1 text-[13px] font-semibold tabular-nums">
                  {step.no}
                </span>
                <h3 className="text-xl font-medium">{t(step.title)}</h3>
                <p className="text-[15px] leading-relaxed text-ink-soft">
                  {t(step.body)}
                </p>
              </li>
            ))}
          </ol>
        </section>

        {/* Full-Width Kitchen Photo */}
        <section aria-label={t('homePhotoKitchen')}>
          <img
            src="/site/kitchen.webp"
            width={2000}
            height={1249}
            alt={t('homePhotoKitchen')}
            className="h-[34svh] w-full rounded-lg object-cover md:h-[52svh]"
          />
        </section>

        {/* Architecture & Security Pillars */}
        <section aria-labelledby="trust-title" className="grid gap-6">
          <h2
            id="trust-title"
            className="text-[26px] leading-tight font-medium tracking-[-0.02em] sm:text-[34px]"
          >
            {t('howTrustTitle')}
          </h2>
          <div className="grid gap-4 md:grid-cols-2">
            {TRUST.map((item, index) => {
              const Icon = item.icon
              return (
                <div
                  key={item.title}
                  style={stagger(index)}
                  className="rise grid content-start gap-3 rounded-lg border border-line p-6 sm:p-7"
                >
                  <span className="grid size-10 place-items-center rounded-full bg-tonal text-ink">
                    <Icon size={20} aria-hidden />
                  </span>
                  <h3 className="text-xl font-medium">{t(item.title)}</h3>
                  <p className="text-[15px] leading-relaxed text-ink-soft">
                    {t(item.body)}
                  </p>
                </div>
              )
            })}
          </div>
        </section>

        {/* Built for Every Kitchen Photo Grid */}
        <section aria-labelledby="every-title" className="grid gap-5">
          <h2
            id="every-title"
            className="text-[26px] leading-tight font-medium tracking-[-0.02em] sm:text-[34px]"
          >
            {t('homeEveryTitle')}
          </h2>
          <p className="max-w-[54ch] text-[16px] leading-relaxed text-ink-soft sm:text-[17px]">
            {t('homeEveryBody')}
          </p>
          <div className="grid gap-3 pt-2 sm:grid-cols-3">
            {VENUE_PHOTOS.map((photo, index) => (
              <img
                key={photo.src}
                style={delay(index)}
                src={photo.src}
                width={800}
                height={1000}
                alt={t(photo.alt)}
                className="rise aspect-[4/5] w-full rounded-md object-cover"
              />
            ))}
          </div>
        </section>

        {/* Interactive 60-Second Device Pairing */}
        <PairingSection />

        {/* Bottom CTA */}
        <section aria-labelledby="cta-title">
          <div className="on-ink grid gap-6 rounded-lg bg-ink p-6 text-surface sm:p-10 md:flex md:items-center md:justify-between">
            <div className="grid max-w-xl gap-2">
              <h2
                id="cta-title"
                className="text-[24px] leading-tight font-medium tracking-[-0.02em] sm:text-[32px]"
              >
                {t('howCtaTitle')}
              </h2>
              <p className="text-[15px] leading-relaxed text-on-ink-soft sm:text-[16px]">
                {t('howCtaBody')}
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link
                to="/sign-in"
                className="state inline-flex min-h-12 items-center gap-2 rounded-full px-7 text-[15px] font-semibold text-ink transition-[background-color,scale] duration-150 active:scale-[0.97] [--bg:var(--color-surface)] [--on:var(--color-ink)]"
              >
                {t('startFree')}
                <ArrowRight size={18} aria-hidden />
              </Link>
              <Link
                to="/pricing"
                className="state inline-flex min-h-12 items-center rounded-full px-6 text-[15px] font-semibold text-surface [--bg:var(--color-ink-raised)] [--on:var(--color-surface)]"
              >
                {t('pricingTitle')}
              </Link>
            </div>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  )
}

const PAIRING_DEVICES: {
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

function PairingSection() {
  const { t } = useI18n()
  const [shown, setShown] = useState('tv')
  const device =
    PAIRING_DEVICES.find((d) => d.id === shown) ?? PAIRING_DEVICES[0]
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
    <section aria-labelledby="setup-title" className="grid gap-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h2
          id="setup-title"
          className="text-[26px] leading-[1.1] font-medium tracking-[-0.02em] sm:text-[34px]"
        >
          <span className="block text-ink-soft">{t('homeSetupTitle1')}</span>
          <span className="block">{t('homeSetupTitle2')}</span>
        </h2>
      </div>
      <div className="grid gap-4 md:grid-cols-[160px_1fr] md:gap-8">
        <div className="grid grid-cols-3 gap-1.5 md:grid-cols-1 md:content-start">
          {PAIRING_DEVICES.map((d) => (
            <button
              key={d.id}
              type="button"
              aria-pressed={shown === d.id}
              onClick={() => setShown(d.id)}
              className={`state min-h-14 rounded-sm px-3 text-left text-[15px] font-medium transition-[background-color] duration-200 ${
                shown === d.id
                  ? 'text-surface [--bg:var(--color-ink)] [--on:var(--color-surface)]'
                  : '[--bg:var(--color-wash)]'
              }`}
            >
              {t(d.role)}
            </button>
          ))}
        </div>
        <ul aria-live="polite" className="grid gap-1.5">
          {rows.map(([verb, title, note], index) => (
            <li
              key={`${shown}-${verb}`}
              style={delay(index)}
              className={`rise grid gap-1 rounded-sm px-5 py-4 md:grid-cols-[130px_1fr] md:items-center md:gap-6 ${
                index % 2 === 0 ? 'bg-wash' : 'bg-tonal'
              }`}
            >
              <span className="text-[16px] font-semibold">{t(verb)}</span>
              <span className="grid gap-0.5">
                <span className="text-[16px] font-medium">{title}</span>
                <span className="text-[15px] text-ink-soft">{note}</span>
              </span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}

function sampleLines(lang: 'en' | 'id') {
  return lang === 'id'
    ? [
        line('a', 1, 'Ayam Bakar Madu', {
          note: 'Potong kecil',
          allergy: 'kacang',
        }),
        line('t', 2, 'Es Teh Lemon'),
      ]
    : [
        line('a', 1, 'Honey Grilled Chicken', {
          note: 'Cut small',
          allergy: 'peanuts',
        }),
        line('t', 2, 'Iced Lemon Tea'),
      ]
}

function StepTablet() {
  const { lang, t } = useI18n()
  return (
    <Device kind="tablet" className="rounded-[10px] bg-wash text-ink">
      <div data-ui className="flex h-full flex-col justify-between gap-3 p-5">
        <Ticket
          ticketNo={null}
          where={`${t('table')} 4`}
          takeaway={false}
          lines={sampleLines(lang)}
          orderNote={null}
          size="paper"
        />
        <div className="flex min-h-16 items-center justify-between gap-4 rounded-full bg-ink py-2 pr-2 pl-6 text-surface">
          <SendFace count={3} total={92_000} />
        </div>
      </div>
    </Device>
  )
}

function StepTv() {
  const { lang, t } = useI18n()
  return (
    <Device kind="tv" className="bg-ink-raised text-surface">
      <div data-ui className="grid gap-3 p-5">
        <p className="flex items-center justify-between text-[15px] font-medium">
          <span className="flex items-center gap-2">
            <span aria-hidden className="size-2 rounded-full bg-tonal" />
            {t('laneNew')}
          </span>
          <span className="grid size-7 place-items-center rounded-full bg-surface text-[13px] font-semibold text-ink">
            2
          </span>
        </p>
        <div className="grid grid-cols-2 items-start gap-3">
          <Ticket
            ticketNo={3}
            where={`${t('table')} 9`}
            takeaway={false}
            lines={
              lang === 'id'
                ? [
                    line('s', 3, 'Sate Ayam'),
                    line('n', 1, 'Nasi Goreng Kampung'),
                  ]
                : [
                    line('s', 3, 'Chicken Satay'),
                    line('n', 1, 'Kampung Fried Rice'),
                  ]
            }
            orderNote={null}
            size="paper"
            aside={<Age since={0} now={195_000} />}
          />
          <Ticket
            ticketNo={4}
            where={`${t('table')} 4`}
            takeaway={false}
            lines={sampleLines(lang)}
            orderNote={null}
            size="paper"
            aside={<Age since={0} now={42_000} />}
          />
        </div>
      </div>
    </Device>
  )
}

function StepPhone() {
  const { lang, t } = useI18n()
  const steps: DictKey[] = ['saved', 'onTv', 'accepted', 'ready']
  return (
    <Device kind="phone" className="rounded-[29px] bg-wash text-ink">
      <span
        aria-hidden
        className="absolute top-0 left-1/2 h-[23px] w-[57%] -translate-x-1/2 rounded-b-[16px] bg-ink"
      />
      <div data-ui className="grid gap-3 px-3 pt-10">
        <Ticket
          ticketNo={4}
          where={`${t('table')} 4`}
          takeaway={false}
          lines={sampleLines(lang)}
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
        <p className="mt-3 text-[13px] font-semibold text-ink-soft">
          {t('lanePreparing')}
        </p>
        <Ticket
          ticketNo={3}
          where={`${t('table')} 9`}
          takeaway={false}
          lines={[line('s', 3, lang === 'id' ? 'Sate Ayam' : 'Chicken Satay')]}
          orderNote={null}
          size="paper"
        />
        <span className="flex min-h-12 items-center justify-center rounded-full bg-ink text-[15px] font-semibold text-surface">
          {t('markReady')}
        </span>
      </div>
    </Device>
  )
}

function PreviewWaiter() {
  return (
    <DeviceStage className="relative w-full overflow-hidden rounded-md bg-ink-raised">
      <div inert className="absolute inset-0">
        <StepTablet />
      </div>
    </DeviceStage>
  )
}

function PreviewTv() {
  return (
    <DeviceStage className="relative w-full overflow-hidden rounded-md bg-ink-raised">
      <div inert className="absolute inset-0">
        <StepTv />
      </div>
    </DeviceStage>
  )
}

function PreviewKitchen() {
  return (
    <DeviceStage className="relative w-full overflow-hidden rounded-md bg-ink-raised">
      <div inert className="absolute inset-0">
        <StepPhone />
      </div>
    </DeviceStage>
  )
}

function PreviewAdmin() {
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
    <div className="grid gap-3 rounded-md bg-surface p-4 text-ink sm:p-5">
      <p className="text-lg font-medium">{t('homeOutToday')}</p>
      <div className="grid grid-cols-2 gap-2">
        {stats.map(([label, value]) => (
          <div key={label} className="grid gap-0.5 rounded-sm bg-wash p-3">
            <span className="text-[13px] text-ink-soft">{t(label)}</span>
            <span className="text-xl font-medium tabular-nums">{value}</span>
          </div>
        ))}
        <div className="col-span-2 grid gap-0.5 rounded-sm bg-wash p-3">
          <span className="text-[13px] text-ink-soft">{t('statRevenue')}</span>
          <span className="text-xl font-medium tabular-nums">
            {formatIdr(2_316_000)}
          </span>
        </div>
      </div>
      <ul className="grid gap-1.5 text-[14px]">
        {screens.map(([role, online, total]) => (
          <li
            key={role}
            className="flex items-center justify-between rounded-sm bg-wash px-3 py-2"
          >
            {t(role)}
            <span className="flex items-center gap-2 text-[13px] tabular-nums">
              <span aria-hidden className="size-2 rounded-full bg-ink" />
              {t('onlineCount', { online, total })}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
