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
  const { t } = useI18n()
  useReveal()
  return (
    <div className="bg-surface text-ink">
      <Hero />
      <HowItWorks />
      <img
        src="/site/kitchen.webp"
        width={2000}
        height={1249}
        alt={t('homePhotoKitchen')}
        loading="lazy"
        className="h-[38svh] w-full object-cover md:h-[62svh]"
      />
      <SettingBands />
      <OwnerView />
      <EveryKitchen />
      <Setup />
      <SiteFooter />
    </div>
  )
}
