import { useI18n } from '../../i18n'
import { delay } from './shared'

/** Many dapur: what the platform holds for each. */
export function EveryKitchen() {
  const { t } = useI18n()
  return (
    <section
      aria-labelledby="every-title"
      className="mx-auto grid max-w-6xl gap-5 px-5 pt-32 md:px-10 md:pt-48"
    >
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
    </section>
  )
}
