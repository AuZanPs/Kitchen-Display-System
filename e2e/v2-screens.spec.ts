import { expect, test } from '@playwright/test'
import { expectAccessible, pair, settle, signInAdmin } from './helpers.ts'

const PHONE = { width: 360, height: 800 }
const TABLET = { width: 820, height: 1180 }
const DESKTOP = { width: 1280, height: 800 }

// Runs after v1: it turns staff PINs off again and looks at every screen at
// phone, portrait tablet and desktop widths. Screenshots land in test-results/.
test('every screen at phone, tablet and desktop widths', async ({
  browser,
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
  // From the page itself: Node cannot resolve *.localhost, the browser can.
  const settings = await admin.evaluate(async () => {
    const res = await fetch('/api/admin/settings', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        allergy: true,
        lineNotes: true,
        orderNote: true,
        staffPins: false,
      }),
    })
    return res.status
  })
  expect(settings).toBe(200)
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

  for (const size of [PHONE, TABLET, DESKTOP]) {
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
      await settle(admin)
      await admin.screenshot({
        path: `test-results/screen-admin-${tab.toLowerCase()}-${size.width}.png`,
        fullPage: true,
      })
      await expectAccessible(admin, `admin ${tab} ${size.width}`)
    }
  }
})
