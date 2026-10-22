import { useI18n } from '../../i18n'
import { delay } from './shared'

// One shot per kind of place the headline names, in its order.
const PHOTOS = [
  { src: '/site/warung.webp', alt: 'homePhotoWarung' },
  { src: '/site/kedai.webp', alt: 'homePhotoCafe' },
  { src: '/site/rumah-makan.webp', alt: 'homePhotoRestaurant' },
] as const

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
      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        {PHOTOS.map((photo, index) => (
          <img
            key={photo.src}
            data-reveal
            style={delay(index)}
            src={photo.src}
            width={800}
            height={1000}
            alt={t(photo.alt)}
            loading="lazy"
            className="aspect-[4/5] w-full rounded-sm object-cover"
          />
        ))}
      </div>
    </section>
  )
}
