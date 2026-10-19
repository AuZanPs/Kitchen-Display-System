import { expect, test } from '@playwright/test'
import { expectAccessible, pair, settle, signInAdmin } from './helpers.ts'

const PHONE = { width: 360, height: 800 }
const TABLET = { width: 820, height: 1180 }
const DESKTOP = { width: 1280, height: 800 }
// A 1080p laptop at 125% scaling, and the kitchen TV itself.
const LAPTOP = { width: 1536, height: 864 }
const TV = { width: 1920, height: 1080 }

// Runs after v1: it turns staff PINs off again and looks at every screen at
// phone, portrait tablet and desktop widths. Screenshots land in test-results/.
test('every screen at phone, tablet and desktop widths', async ({
  browser,
  baseURL,
}) => {
  test.setTimeout(240_000)
  // Screens seen before pairing or signing in.
  const fresh = await (await browser.newContext()).newPage()
  for (const size of [PHONE, TABLET, DESKTOP]) {
    await fresh.setViewportSize(size)
    await fresh.goto('/admin')
    await expectAccessible(fresh, `sign-in ${size.width}`)
    await fresh.screenshot({
      path: `test-results/screen-signin-${size.width}.png`,
    })
  }
  await fresh.goto('/enroll')
  await expect(fresh.getByText(/^\d \d \d \d \d \d$/)).toBeAttached()
  for (const size of [PHONE, TABLET, DESKTOP]) {
    await fresh.setViewportSize(size)
    await expectAccessible(fresh, `enroll ${size.width}`)
    await fresh.screenshot({
      path: `test-results/screen-enroll-${size.width}.png`,
    })
  }

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
  const tv = await pair(browser, admin, 'TV dapur', 'TV layar', DESKTOP)

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
    await expectAccessible(tablet, `service ${size.width}`)
    await tablet.screenshot({
      path: `test-results/screen-service-${size.width}.png`,
      fullPage: true,
    })
    await tablet.getByRole('button', { name: 'Pesanan', exact: true }).click()
    await expectAccessible(tablet, `composer ${size.width}`)
    await tablet.screenshot({
      path: `test-results/screen-composer-${size.width}.png`,
      fullPage: true,
    })
  }

  // On a phone the order so far rides in a bar and opens as a sheet.
  await tablet.setViewportSize(PHONE)
  await tablet.getByRole('button', { name: /Es Teh Lemon/ }).click()
  await tablet.getByRole('button', { name: /Tambah ke pesanan/ }).click()
  await settle(tablet)
  await tablet.screenshot({ path: 'test-results/screen-cartbar-360.png' })
  await tablet.getByRole('button', { name: /1 item dipilih/ }).click()
  await expectAccessible(tablet, 'summary sheet 360')
  await tablet.screenshot({ path: 'test-results/screen-sheet-360.png' })
  await tablet.keyboard.press('Escape')

  for (const size of [PHONE, TABLET, DESKTOP, TV]) {
    await tv.setViewportSize(size)
    await expect(tv.getByText('Live')).toBeVisible()
    await expectAccessible(tv, `tv ${size.width}`)
    await tv.screenshot({ path: `test-results/screen-tv-${size.width}.png` })
  }

  for (const size of [PHONE, TABLET, DESKTOP]) {
    await kitchen.setViewportSize(size)
    await expectAccessible(kitchen, `kitchen ${size.width}`)
    await kitchen.screenshot({
      path: `test-results/screen-kitchen-${size.width}.png`,
      fullPage: true,
    })
  }

  // A busy day's numbers, so the widest totals are what the tiles must hold.
  await admin.route('**/api/manager/history*', async (route) => {
    const response = await route.fetch()
    const body = await response.json()
    body.stats = {
      orders: 1234,
      served: 1200,
      cancelled: 34,
      avgReadyMinutes: 125,
      revenueIdr: 987_654_321,
    }
    await route.fulfill({ response, json: body })
  })
  const tabs = [
    'Ringkasan',
    'Menu',
    'Staf',
    'Perangkat',
    'Riwayat',
    'Pengaturan',
  ]
  for (const size of [PHONE, TABLET, DESKTOP, LAPTOP]) {
    await admin.setViewportSize(size)
    for (const tab of tabs) {
      await admin.getByRole('button', { name: tab, exact: true }).click()
      await settle(admin)
      await admin.screenshot({
        path: `test-results/screen-admin-${tab.toLowerCase()}-${size.width}.png`,
        fullPage: true,
      })
      await expectAccessible(admin, `admin ${tab} ${size.width}`)
    }
  }

  // The spreadsheet view of the day, wide and on a phone.
  await admin.getByRole('button', { name: 'Riwayat', exact: true }).click()
  await admin.locator('label').filter({ hasText: 'Tabel' }).click()
  await expect(admin.getByRole('table')).toBeVisible()
  for (const size of [LAPTOP, PHONE]) {
    await admin.setViewportSize(size)
    await expectAccessible(admin, `history table ${size.width}`)
    await admin.screenshot({
      path: `test-results/screen-history-table-${size.width}.png`,
      fullPage: true,
    })
  }
  await admin.locator('label').filter({ hasText: 'Daftar' }).click()

  // Deleting lives in Pengaturan, never on the history itself.
  await admin.unroute('**/api/manager/history*')
  await admin.setViewportSize(PHONE)
  await expect(admin.getByRole('button', { name: /^Hapus/ })).toHaveCount(0)
  await admin.getByRole('button', { name: 'Pengaturan', exact: true }).click()
  await settle(admin)
  await expectAccessible(admin, 'history delete card 360')
  await admin.screenshot({
    path: 'test-results/screen-history-delete-360.png',
    fullPage: true,
  })

  // One served order, then the rest of the day.
  await admin
    .getByRole('button', { name: /^Hapus A-\d{3}$/ })
    .first()
    .click()
  await expectAccessible(admin, 'delete order 360')
  await admin.screenshot({ path: 'test-results/screen-delete-order-360.png' })
  await admin.getByRole('button', { name: 'Hapus', exact: true }).click()
  await expect(admin.getByText('1 pesanan dihapus')).toBeVisible()

  await admin.getByRole('button', { name: /^Hapus semua/ }).click()
  const deleteDay = admin.getByRole('button', { name: 'Hapus', exact: true })
  await expect(deleteDay).toBeDisabled()
  await admin.getByLabel('Ketik HAPUS untuk melanjutkan').fill('hapus')
  await expectAccessible(admin, 'delete day 360')
  await admin.screenshot({ path: 'test-results/screen-delete-day-360.png' })
  await deleteDay.click()
  await expect(admin.getByText(/^\d+ pesanan dihapus$/)).toBeVisible()
  await expect(admin.getByRole('button', { name: /^Hapus semua/ })).toBeHidden()
  await expect(
    admin.getByText('Tidak ada pesanan selesai di tanggal ini.'),
  ).toBeVisible()
})
