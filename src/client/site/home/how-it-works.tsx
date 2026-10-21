import { useEffect, useRef, useState } from 'react'
import { type DictKey, formatIdr, useI18n } from '../../i18n'
import { Ticket } from '../../ticket'
import { line } from './shared'

const STEPS: { title: DictKey; note: DictKey }[] = [
  { title: 'homeHow1', note: 'homeHow1Note' },
  { title: 'homeHow2', note: 'homeHow2Note' },
  { title: 'homeHow3', note: 'homeHow3Note' },
]

/** Three statements scroll past one stage that shows each step. */
export function HowItWorks() {
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
