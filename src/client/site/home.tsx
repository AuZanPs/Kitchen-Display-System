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
      <HowItWorks />
      <SettingBands />
      <OwnerView />
      <EveryKitchen />
      <Setup />
      <SiteFooter />
    </div>
  )
}
