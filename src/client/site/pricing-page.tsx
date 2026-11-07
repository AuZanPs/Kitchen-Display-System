import { Check } from 'lucide-react'
import { Link } from 'react-router'
import { VENUE_LIMITS } from '../../shared/venue'
import { type DictKey, useI18n } from '../i18n'
import { stagger } from '../lib/stagger'
import { SiteFooter } from './home/site-footer'
import { SiteBar } from './site-pages'

const FREE: DictKey[] = [
  'priceFreeVenues',
  'priceFreeScreens',
  'priceFreeMenu',
  'priceFreeHistory',
  'priceFreeStaff',
]
const PRO: DictKey[] = [
  'priceProVenues',
  'priceProDashboard',
  'priceProHistory',
  'priceProAnalytics',
  'priceProStaff',
  'priceProHelp',
]
const FAQ: [DictKey, DictKey][] = [
  ['faqAppQ', 'faqAppA'],
  ['faqDevicesQ', 'faqDevicesA'],
  ['faqProQ', 'faqProA'],
  ['faqAfterQ', 'faqAfterA'],
]

/** Generous free plan for daily service; Pro adds multi-branch control and full reporting. */
export function PricingPage() {
  const { t } = useI18n()
  return (
    <div className="min-h-dvh bg-surface text-ink">
      <SiteBar />
      <main className="mx-auto grid max-w-5xl gap-12 px-4 pt-8 sm:px-6 md:pt-14">
        <div className="rise grid max-w-2xl gap-3">
          <h1 className="text-[clamp(36px,6vw,56px)] leading-[1.02] font-semibold tracking-[-0.03em]">
            {t('pricingTitle')}
          </h1>
          <p className="text-[17px] leading-relaxed text-ink-soft md:text-[19px]">
            {t('pricingLead')}
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <section
            aria-labelledby="plan-free"
            style={stagger(0)}
            className="rise flex flex-col justify-between gap-8 rounded-lg bg-wash p-6 sm:p-8"
          >
            <div className="grid gap-6">
              <div className="grid gap-2">
                <h2 id="plan-free" className="text-xl font-medium">
                  {t('planFree')}
                </h2>
                <p className="flex flex-wrap items-baseline gap-x-2">
                  <span className="text-5xl font-semibold tracking-tight tabular-nums">
                    Rp0
                  </span>
                  <span className="text-ink-soft">{t('planFreePeriod')}</span>
                </p>
                <p className="pt-1 text-[15px] leading-relaxed text-ink-soft">
                  {t('planFreeSub')}
                </p>
              </div>
              <Features
                items={FREE.map((key) =>
                  t(key, { count: VENUE_LIMITS.ownedVenues }),
                )}
              />
            </div>
            <Link
              to="/sign-in"
              className="state inline-flex min-h-12 items-center justify-center rounded-full px-7 text-[15px] font-semibold text-surface transition-[background-color,scale] duration-150 active:scale-[0.97] [--bg:var(--color-ink)] [--on:var(--color-surface)] sm:w-fit"
            >
              {t('startFree')}
            </Link>
          </section>

          <section
            aria-labelledby="plan-pro"
            style={stagger(1)}
            className="on-ink rise flex flex-col justify-between gap-6 rounded-lg bg-ink p-6 text-surface sm:p-8"
          >
            <div className="grid gap-5">
              <div className="grid gap-2">
                <h2
                  id="plan-pro"
                  className="flex flex-wrap items-center gap-2.5 text-xl font-medium"
                >
                  {t('planPro')}
                  <span className="rounded-full bg-tonal px-2.5 py-0.5 text-[13px] font-semibold text-ink">
                    {t('comingSoon')}
                  </span>
                </h2>
                <p className="text-[16px] leading-relaxed text-on-ink-soft">
                  {t('planProLead')}
                </p>
              </div>
              <div className="grid gap-3">
                <p className="text-[13px] font-semibold tracking-wide text-on-ink-soft uppercase">
                  {t('planProIncludes')}
                </p>
                <Features items={PRO.map((key) => t(key))} />
              </div>
            </div>
            <p className="rounded-md bg-ink-raised p-4 text-[14px] leading-relaxed text-on-ink-soft">
              {t('planProNote')}
            </p>
          </section>
        </div>

        <section aria-labelledby="faq-title" className="grid max-w-3xl gap-4">
          <h2 id="faq-title" className="text-2xl font-medium">
            {t('faqTitle')}
          </h2>
          <dl className="grid gap-2">
            {FAQ.map(([q, a]) => (
              <div key={q} className="grid gap-1 rounded-md bg-wash p-5">
                <dt className="font-medium">{t(q)}</dt>
                <dd className="text-[15px] leading-relaxed text-ink-soft">
                  {t(a)}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      </main>
      <SiteFooter />
    </div>
  )
}

function Features({ items }: { items: string[] }) {
  return (
    <ul className="grid gap-3 text-[15px] leading-snug">
      {items.map((item) => (
        <li key={item} className="flex gap-3">
          <Check
            size={18}
            strokeWidth={2.5}
            aria-hidden
            className="mt-0.5 shrink-0"
          />
          {item}
        </li>
      ))}
    </ul>
  )
}
