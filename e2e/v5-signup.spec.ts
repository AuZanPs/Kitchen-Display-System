import { expect, type Page, test } from '@playwright/test'
import { expectAccessible, settle } from './helpers.ts'

const WIDTHS = [320, 360, 820, 1280]

async function noSidewaysScroll(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    ),
  ).toBeLessThanOrEqual(0)
}

// A new owner reads the pricing, signs up by email, creates a kitchen and lands
// in its admin without another password.
test('a new owner signs up and creates their own kitchen', async ({
  browser,
  baseURL,
}) => {
  test.setTimeout(120_000)
  const port = new URL(baseURL ?? 'http://localhost:5199').port
  const site = `http://localhost:${port}`
  const slug = `kedai-${Date.now().toString(36)}`
  const page = await (await browser.newContext()).newPage()

  // Legacy Indonesian routes redirect cleanly to the English SEO routes.
  await page.goto(`${site}/cara-kerja`)
  await expect(page).toHaveURL(/\/how-it-works$/)
  await expect(
    page.getByRole('heading', {
      name: 'From the table to the kitchen TV in under a second.',
    }),
  ).toBeVisible()
  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 900 })
    await settle(page)
    await expectAccessible(page, `how-it-works ${width}`)
    await noSidewaysScroll(page)
    await page.screenshot({
      path: `test-results/how-it-works-${width}.png`,
      fullPage: true,
    })
  }

  await page.goto(`${site}/harga`)
  await expect(page).toHaveURL(/\/pricing$/)
  await expect(page.getByRole('heading', { name: 'Pricing' })).toBeVisible()

  // Indonesian remains available as the second language option.
  await page.locator('label').filter({ hasText: 'id' }).click()
  await expect(page.getByRole('heading', { name: 'Harga' })).toBeVisible()
  await page.locator('label').filter({ hasText: 'en' }).click()
  await expect(page.getByRole('heading', { name: 'Pricing' })).toBeVisible()

  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 900 })
    await expectAccessible(page, `pricing ${width}`)
    await noSidewaysScroll(page)
    await page.screenshot({
      path: `test-results/pricing-${width}.png`,
      fullPage: true,
    })
  }

  await page.getByRole('link', { name: 'Start free' }).click()
  await expect(page).toHaveURL(/\/sign-in$/)
  await expect(
    page.getByRole('button', { name: 'Continue with Google' }),
  ).toBeVisible()
  await expect(page.getByText('Security check passed')).toBeVisible()
  await settle(page)
  await expectAccessible(page, 'sign-in 1280')
  await page.screenshot({
    path: 'test-results/sign-in-1280.png',
    fullPage: true,
  })
  await page.getByLabel('Email').fill(`${slug}@contoh.id`)
  await page.getByRole('button', { name: 'Send link' }).click()
  await page.getByRole('link', { name: /Open sign-in link/ }).click()
  await expect(page).toHaveURL(/\/account$/)

  const form = page.getByRole('form').or(page.locator('form')).first()
  await expect(
    page.getByRole('heading', { name: 'Create your first kitchen' }),
  ).toBeVisible()
  await page.getByLabel('Kitchen name').fill('Kedai Bu Siti')
  await expect(page.getByLabel('Address')).toHaveValue('kedai-bu-siti')
  await page.getByLabel('Address').fill(slug)
  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 900 })
    await expectAccessible(page, `account create ${width}`)
    await noSidewaysScroll(page)
    await page.screenshot({
      path: `test-results/account-create-${width}.png`,
      fullPage: true,
    })
  }
  await form.getByRole('button', { name: 'Create and open admin' }).click()
  await expect(form.getByText('At least 8 characters.')).toBeVisible()
  await page.getByLabel('Admin password').fill('rahasia-kedai')
  await form.getByRole('button', { name: 'Create and open admin' }).click()

  await expect(page).toHaveURL(
    new RegExp(`^http://${slug}\\.localhost:${port}/admin`),
  )
  await expect(
    page.getByRole('heading', { name: 'Get your kitchen ready' }),
  ).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Screens' })).toBeVisible()
  await settle(page)
  await expectAccessible(page, 'admin onboarding 1280')
  await page.screenshot({
    path: 'test-results/admin-onboard-1280.png',
    fullPage: true,
  })
})
