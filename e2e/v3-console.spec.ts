import { expect, test } from '@playwright/test'
import { expectAccessible, SUPER_ADMIN_PASSWORD, settle } from './helpers.ts'

const SIZES = [
  { width: 360, height: 800 },
  { width: 820, height: 1180 },
  { width: 1280, height: 800 },
]

// Each dapur is its own subdomain; *.localhost reaches the dev server.
test('the super admin creates a dapur that signs in on its own address', async ({
  browser,
  baseURL,
}) => {
  test.setTimeout(120_000)
  const port = new URL(baseURL ?? 'http://localhost:5199').port
  const consoleUrl = `http://console.localhost:${port}`
  const slug = `warung-${Date.now().toString(36)}`

  const page = await (await browser.newContext()).newPage()
  await page.goto(`${consoleUrl}/`)
  await expect(page).toHaveURL(/\/super$/)
  await expectAccessible(page, 'console sign-in')
  await page.getByLabel('Kata sandi').fill(SUPER_ADMIN_PASSWORD)
  await page.getByRole('button', { name: 'Masuk' }).click()
  await expect(
    page.getByRole('heading', { level: 2, name: /Semua dapur/ }),
  ).toBeVisible()

  await page.getByRole('button', { name: 'Tambah dapur' }).click()
  await page.getByLabel('Nama dapur').fill('Warung Uji')
  await page.getByLabel('Alamat').fill(slug)
  await page.getByLabel('Kata sandi admin').fill('rahasia-uji-123')
  await settle(page)
  await expectAccessible(page, 'add dapur dialog')
  await page.screenshot({ path: 'test-results/screen-console-add-360.png' })
  await page.getByRole('button', { name: 'Buat dapur' }).click()
  await expect(page.getByText('Warung Uji dibuat')).toBeVisible()

  for (const size of SIZES) {
    await page.setViewportSize(size)
    await settle(page)
    await expectAccessible(page, `console ${size.width}`)
    await page.screenshot({
      path: `test-results/screen-console-${size.width}.png`,
      fullPage: true,
    })
  }

  // The new dapur signs in with its own password, not the original one's.
  const venue = await (await browser.newContext()).newPage()
  await venue.goto(`http://${slug}.localhost:${port}/admin`)
  await venue.getByLabel('Kata sandi').fill('rahasia-uji-123')
  await venue.getByRole('button', { name: 'Masuk' }).click()
  await expect(venue.getByText('Warung Uji')).toBeVisible()
  await expect(venue.getByRole('heading', { name: 'Layar' })).toBeVisible()

  // Switched off: the dapur's own admin is turned away at once.
  const row = page.getByRole('listitem').filter({ hasText: 'Warung Uji' })
  await row.getByRole('switch').click()
  await page.getByRole('button', { name: 'Nonaktifkan' }).click()
  await expect(page.getByText('Warung Uji dinonaktifkan')).toBeVisible()
  await venue.reload()
  await venue.getByLabel('Kata sandi').fill('rahasia-uji-123')
  await venue.getByRole('button', { name: 'Masuk' }).click()
  await expect(venue.getByText('Dapur ini sedang dinonaktifkan.')).toBeVisible()

  // An address nobody created says so instead of offering a pairing code.
  const ghost = await (await browser.newContext()).newPage()
  await ghost.goto(`http://belum-ada-${Date.now()}.localhost:${port}/`)
  await expect(ghost.getByText('Dapur ini tidak ditemukan.')).toBeVisible()
})
