import { LogIn } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import { type DictKey, useI18n } from '../../i18n'
import { delay } from './shared'

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
export function Setup() {
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
