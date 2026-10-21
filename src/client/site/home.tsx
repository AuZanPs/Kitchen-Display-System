import { useI18n } from '../i18n'
import { EveryKitchen } from './home/every-kitchen'
import { Hero } from './home/hero'
import { HowItWorks } from './home/how-it-works'
import { OwnerView } from './home/owner-view'
import { SettingBands } from './home/setting-bands'
import { Setup } from './home/setup'
import { useReveal } from './home/shared'
import { SiteFooter } from './home/site-footer'

/** The bare domain's front page: the product doing its job, in pieces. */
export function SiteHome() {
  useReveal()
  return (
    <div className="bg-surface text-ink">
      <Hero />
      <figure className="h-[38svh] overflow-hidden md:h-[62svh]">
        <PhotoGrill />
      </figure>
      <HowItWorks />
      <SettingBands />
      <OwnerView />
      <EveryKitchen />
      <Setup />
      <SiteFooter />
    </div>
  )
}

function PhotoGrill() {
  const { t } = useI18n()
  return (
    <img
      src="/site/sate-grill.webp"
      width={1600}
      height={600}
      alt={t('homePhotoGrill')}
      loading="lazy"
      className="drift size-full object-cover"
    />
  )
}
