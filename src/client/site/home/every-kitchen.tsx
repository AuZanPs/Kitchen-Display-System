import { useI18n } from '../../i18n'
import { delay } from './shared'

/** Many dapur: a real warung table beside what the platform holds for each. */
export function EveryKitchen() {
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
