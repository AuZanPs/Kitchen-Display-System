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

// A new owner reads the pricing, signs up by email, creates a dapur and lands
// in its admin without another password.
test('a new owner signs up and creates their own dapur', async ({
  browser,
  baseURL,
}) => {
  test.setTimeout(120_000)
  const port = new URL(baseURL ?? 'http://localhost:5199').port
  const site = `http://localhost:${port}`
  const slug = `kedai-${Date.now().toString(36)}`
  const page = await (await browser.newContext()).newPage()

  await page.goto(`${site}/harga`)
  await expect(page.getByRole('heading', { name: 'Harga' })).toBeVisible()
  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 900 })
    await expectAccessible(page, `pricing ${width}`)
    await noSidewaysScroll(page)
    await page.screenshot({
      path: `test-results/pricing-${width}.png`,
      fullPage: true,
    })
  }

  await page.getByRole('link', { name: 'Mulai gratis' }).click()
  await expect(page).toHaveURL(/\/masuk$/)
  await page.getByLabel('Email').fill(`${slug}@contoh.id`)
  await page.getByRole('button', { name: 'Kirim tautan' }).click()
  await page.getByRole('link', { name: /Buka tautan/ }).click()
  await expect(page).toHaveURL(/\/akun$/)

  const form = page.getByRole('form').or(page.locator('form')).first()
  await expect(
    page.getByRole('heading', { name: 'Buat dapur pertamamu' }),
  ).toBeVisible()
  await page.getByLabel('Nama dapur').fill('Kedai Bu Siti')
  await expect(page.getByLabel('Alamat')).toHaveValue('kedai-bu-siti')
  await page.getByLabel('Alamat').fill(slug)
  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 900 })
    await expectAccessible(page, `account create ${width}`)
    await noSidewaysScroll(page)
    await page.screenshot({
      path: `test-results/account-create-${width}.png`,
      fullPage: true,
    })
  }
  await form.getByRole('button', { name: 'Buat dan buka admin' }).click()
  await expect(form.getByText('Minimal 8 karakter.')).toBeVisible()
  await page.getByLabel('Kata sandi admin').fill('rahasia-kedai')
  await form.getByRole('button', { name: 'Buat dan buka admin' }).click()

  await expect(page).toHaveURL(
    new RegExp(`^http://${slug}\\.localhost:${port}/admin`),
  )
  await expect(page.getByRole('heading', { name: 'Layar' })).toBeVisible()
  await settle(page)
})
