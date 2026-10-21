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
  await page.getByLabel('Email pemilik').fill(`${slug}@contoh.id`)
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

  // The owner signs in on the site with an emailed link and opens the dapur.
  const site = await (await browser.newContext()).newPage()
  for (const size of SIZES) {
    await site.setViewportSize(size)
    await site.goto(`http://localhost:${port}/`)
    await expect(site.getByRole('heading', { level: 1 })).toBeVisible()
    await expectAccessible(site, `site home ${size.width}`)
    await site.screenshot({
      path: `test-results/screen-site-${size.width}.png`,
      fullPage: true,
    })
  }
  await site.getByRole('link', { name: 'Masuk' }).last().click()
  await site.getByLabel('Email').fill(`${slug}@contoh.id`)
  await site.getByRole('button', { name: 'Kirim tautan' }).click()
  await expect(site.getByText('Cek email kamu')).toBeVisible()
  await expectAccessible(site, 'link sent')
  await site.getByRole('link', { name: 'Buka tautan masuk' }).click()
  await expect(site.getByRole('heading', { name: 'Dapur kamu' })).toBeVisible()
  // The owner invites a second admin from the same page.
  const helper = `kedua-${slug}@contoh.id`
  await site.getByLabel('Email').fill(helper)
  await site.getByRole('button', { name: 'Tambah admin' }).click()
  await expect(site.getByText(helper, { exact: true })).toBeVisible()
  await expectAccessible(site, 'account')
  await site.screenshot({ path: 'test-results/screen-account-1280.png' })
  await site.setViewportSize({ width: 360, height: 800 })
  await expectAccessible(site, 'account 360')
  await site.screenshot({
    path: 'test-results/screen-account-360.png',
    fullPage: true,
  })
  await site.setViewportSize({ width: 1280, height: 800 })
  await site.getByRole('button', { name: 'Buka admin' }).click()
  await expect(site).toHaveURL(new RegExp(`${slug}.localhost:${port}/admin$`))
  await expect(site.getByRole('heading', { name: 'Layar' })).toBeVisible()

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

  // Each screen names its tab; a wrong path says so instead of jumping away.
  await expect(venue).toHaveTitle('Admin · Layar Dapur')
  await site.goto(`http://localhost:${port}/tidak-ada`)
  await expect(site.getByText('Halaman ini tidak ada.')).toBeVisible()
})
