import { expect, test } from '@playwright/test'
import { expectAccessible, pair, signInAdmin } from './helpers.ts'

const PHONE = { width: 390, height: 844 }
const TABLET = { width: 820, height: 1180 }
const DESKTOP = { width: 1280, height: 800 }

// Runs after v1: it turns staff PINs off again and looks at every screen at
// phone, portrait tablet and desktop widths. Screenshots land in test-results/.
test('every screen at phone, tablet and desktop widths', async ({
  browser,
  baseURL,
}) => {
  test.setTimeout(180_000)
  const admin = await signInAdmin(browser)
  const settings = await admin.request.post('/api/admin/settings', {
    data: { allergy: true, lineNotes: true, orderNote: true, staffPins: false },
    headers: { origin: baseURL ?? '' },
  })
  expect(settings.status()).toBe(200)
  await admin.getByRole('button', { name: 'Perangkat', exact: true }).click()
  const tablet = await pair(
    browser,
    admin,
    'Tablet pelayan',
    'Tablet layar',
    PHONE,
  )
  const kitchen = await pair(browser, admin, 'HP dapur', 'HP layar', PHONE)

  // An order placed on a phone-sized tablet, with an allergy and a note.
  await expect(tablet).toHaveURL(/\/waiter/)
  await tablet.getByRole('button', { name: 'Pilih meja' }).first().click()
  await tablet.getByRole('button', { name: 'Meja 4', exact: true }).click()
  await tablet.getByRole('button', { name: /Ayam Bakar Madu/ }).click()
  await tablet.getByLabel('Catatan', { exact: true }).fill('Potong kecil')
  await tablet.getByLabel('Alergi').fill('kacang')
  await tablet.getByRole('button', { name: /Tambah ke pesanan/ }).click()
  await tablet.getByRole('button', { name: 'Periksa pesanan' }).click()
  await tablet.getByRole('button', { name: 'Kirim ke dapur' }).click()
  await expect(tablet.getByText('Layanan meja').first()).toBeVisible()

  for (const size of [PHONE, TABLET, DESKTOP]) {
    await tablet.setViewportSize(size)
    await tablet.getByRole('button', { name: 'Layanan meja' }).click()
    await tablet.screenshot({
      path: `test-results/screen-service-${size.width}.png`,
      fullPage: true,
    })
    await expectAccessible(tablet, `service ${size.width}`)
    await tablet.getByRole('button', { name: 'Pesanan', exact: true }).click()
    await tablet.screenshot({
      path: `test-results/screen-composer-${size.width}.png`,
      fullPage: true,
    })
    await expectAccessible(tablet, `composer ${size.width}`)
  }

  for (const size of [PHONE, TABLET]) {
    await kitchen.setViewportSize(size)
    await kitchen.screenshot({
      path: `test-results/screen-kitchen-${size.width}.png`,
      fullPage: true,
    })
    await expectAccessible(kitchen, `kitchen ${size.width}`)
  }

  const tabs = [
    'Ringkasan',
    'Menu',
    'Staf',
    'Perangkat',
    'Riwayat',
    'Pengaturan',
  ]
  for (const size of [PHONE, TABLET, DESKTOP]) {
    await admin.setViewportSize(size)
    for (const tab of tabs) {
      await admin.getByRole('button', { name: tab, exact: true }).click()
      await admin.screenshot({
        path: `test-results/screen-admin-${tab.toLowerCase()}-${size.width}.png`,
        fullPage: true,
      })
      if (size === PHONE)
        await expectAccessible(admin, `admin ${tab} ${size.width}`)
    }
  }
})
