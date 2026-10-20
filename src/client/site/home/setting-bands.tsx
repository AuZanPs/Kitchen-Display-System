import { useState } from 'react'
import { useI18n } from '../../i18n'
import { Switch } from '../../ui/switch'
import { delay } from './shared'

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
export function SettingBands() {
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
