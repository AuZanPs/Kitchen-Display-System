import { readFileSync } from 'node:fs'
import { type Browser, expect, type Page, test } from '@playwright/test'

// The dev server reads the same file, so the test uses the owner's local password.
const ADMIN_PASSWORD =
  /^ADMIN_PASSWORD=(.*)$/m
    .exec(readFileSync('.dev.vars', 'utf8'))?.[1]
    ?.trim() ?? ''

async function signInAdmin(browser: Browser) {
  const admin = await (await browser.newContext()).newPage()
  await admin.goto('/admin')
  await admin.getByLabel('Kata sandi').fill(ADMIN_PASSWORD)
  await admin.getByRole('button', { name: 'Masuk' }).click()
  await expect(admin.getByRole('heading', { name: 'Layar' })).toBeVisible()
  return admin
}

/** Opens /enroll in a fresh browser, approves its code from the admin page. */
async function pair(
  browser: Browser,
  admin: Page,
  role: string,
  label: string,
  viewport?: { width: number; height: number },
) {
  const page = await (await browser.newContext({ viewport })).newPage()
  await page.goto('/')
  await expect(page).toHaveURL(/\/enroll/)
  await page.screenshot({ path: 'test-results/enroll.png' })
  const spoken = await page.getByText(/^\d \d \d \d \d \d$/).textContent()
  const code = (spoken ?? '').replaceAll(' ', '')
  await admin.getByLabel('Kode').fill(code)
  await admin
    .locator('label')
    .filter({ has: admin.getByRole('radio', { name: role }) })
    .click()
  await admin.getByLabel('Nama perangkat').fill(label)
  await admin.getByRole('button', { name: 'Setujui' }).click()
  await expect(admin.getByText(`${label} dipasang`)).toBeVisible()
  return page
}

test('a paired tablet sends an order that appears on the paired TV without reload', async ({
  browser,
}) => {
  const admin = await signInAdmin(browser)
  // Allergy is off by default; this venue wants the detailed form.
  await admin.getByRole('button', { name: 'Pengaturan' }).click()
  await admin.getByRole('switch', { name: /Kolom alergi/ }).check()
  await expect(admin.getByText('Pengaturan tersimpan')).toBeVisible()
  await admin.getByRole('button', { name: 'Perangkat' }).click()
  const tablet = await pair(browser, admin, 'Tablet pelayan', 'Tablet E2E', {
    width: 1280,
    height: 800,
  })
  const tv = await pair(browser, admin, 'TV dapur', 'TV E2E', {
    width: 1920,
    height: 1080,
  })
  const kitchen = await pair(browser, admin, 'HP dapur', 'HP E2E', {
    width: 390,
    height: 844,
  })
  // Presence: all three paired screens report online within one poll.
  await expect(admin.getByText('Online', { exact: true })).toHaveCount(3, {
    timeout: 10_000,
  })
  await admin.screenshot({
    path: 'test-results/admin-devices.png',
    fullPage: true,
  })

  await expect(tablet).toHaveURL(/\/waiter/)
  await expect(tv).toHaveURL(/\/tv/)
  await expect(tv.getByText('Live')).toBeVisible()
  await expect(tablet.getByText('TV dapur online')).toBeVisible()

  const allergy = `udang ${Date.now()}`
  await tablet.getByRole('button', { name: 'Pilih meja' }).first().click()
  await tablet.getByRole('button', { name: 'Meja 7', exact: true }).click()
  await tablet.getByRole('button', { name: /Nasi Goreng Kampung/ }).click()
  await tablet.getByRole('button', { name: 'Tidak pedas' }).click()
  await tablet.getByLabel('Alergi').fill(allergy)
  await tablet.getByRole('button', { name: /Tambah ke pesanan/ }).click()
  await tablet.screenshot({ path: 'test-results/composer.png' })
  await tablet.getByRole('button', { name: 'Periksa pesanan' }).click()
  // The review shows the same ticket the kitchen will read.
  await expect(tablet.getByRole('dialog').getByText(allergy)).toBeVisible()
  await tablet.getByRole('button', { name: 'Kirim ke dapur' }).click()

  // Arrives on the TV through the socket; the page is never reloaded.
  const ticket = tv.getByRole('article').filter({ hasText: allergy })
  await expect(ticket).toBeVisible({ timeout: 5_000 })
  await expect(ticket.getByText('ALERGI')).toBeVisible()

  // The TV's render receipt flows back to the tablet's status card.
  await expect(
    tablet.getByRole('status').filter({ hasText: 'Tampil di TV' }).first(),
  ).toBeVisible({
    timeout: 5_000,
  })

  await tablet.screenshot({ path: 'test-results/waiter.png' })
  await tv.screenshot({ path: 'test-results/tv.png' })

  // Kitchen accepts (allergy must be confirmed), then marks it ready.
  const card = kitchen
    .locator('div')
    .filter({ has: kitchen.getByRole('article').filter({ hasText: allergy }) })
    .last()
  await card.getByRole('button', { name: 'Terima' }).click()
  await kitchen.getByRole('button', { name: 'Sudah dibaca, terima' }).click()
  await expect(
    tv
      .getByRole('region', { name: 'Sedang disiapkan' })
      .getByRole('article')
      .filter({ hasText: allergy }),
  ).toBeVisible()
  await kitchen.screenshot({ path: 'test-results/kitchen.png', fullPage: true })
  await card.getByRole('button', { name: 'Siap' }).click()
  await expect(
    tv
      .getByRole('region', { name: 'Siap diantar' })
      .getByRole('article')
      .filter({ hasText: allergy }),
  ).toBeVisible()

  // The waiter delivers it.
  const served = tablet
    .getByRole('listitem')
    .filter({ hasText: 'Siap diantar' })
    .first()
  await served.getByRole('button', { name: 'Sudah diantar' }).click()
  await expect(
    tv.getByRole('article').filter({ hasText: allergy }),
  ).toBeHidden()

  // The admin can clear a stuck order from the overview; it leaves the TV.
  await tablet.getByRole('button', { name: 'Pesanan', exact: true }).click()
  await tablet.locator('label').filter({ hasText: 'Bawa pulang' }).click()
  await tablet.getByRole('button', { name: /Es Teh Lemon/ }).click()
  await tablet.getByRole('button', { name: /Tambah ke pesanan/ }).click()
  await tablet.getByRole('button', { name: 'Periksa pesanan' }).click()
  await tablet.getByRole('button', { name: 'Kirim ke dapur' }).click()
  const takeaway = tv.getByRole('article').filter({ hasText: 'Es Teh Lemon' })
  await expect(takeaway).toBeVisible()

  // Amendments from the waiter's service list: move, add an item, ask to cancel.
  const serviceCard = () => tablet.locator('main > ul > li').first()
  await serviceCard().getByRole('button', { name: 'Pindah meja' }).click()
  await tablet.getByRole('button', { name: 'Meja 3', exact: true }).click()
  await expect(takeaway).toContainText('Meja 3')
  await serviceCard().getByRole('button', { name: 'Tambah item' }).click()
  await expect(tablet.getByText(/Menambah item ke/)).toBeVisible()
  await tablet.getByRole('button', { name: /Air Mineral/ }).click()
  await tablet.getByRole('button', { name: /Tambah ke pesanan/ }).click()
  await tablet.getByRole('button', { name: 'Periksa pesanan' }).click()
  await tablet.getByRole('button', { name: 'Kirim ke dapur' }).click()
  await expect(takeaway).toContainText('Air Mineral')
  await serviceCard().getByRole('button', { name: 'Batalkan pesanan' }).click()
  await tablet.getByLabel('Alasan').fill('Salah meja')
  await tablet.getByRole('button', { name: 'Minta batal' }).click()
  await expect(
    tablet.getByText('Menunggu dapur mengonfirmasi pembatalan'),
  ).toBeVisible()
  await tablet.screenshot({ path: 'test-results/service.png' })

  // The kitchen sees the request on top and confirms it; the TV drops it.
  await kitchen.getByRole('button', { name: 'Konfirmasi pembatalan' }).click()
  await expect(takeaway).toBeHidden()

  await admin.getByRole('button', { name: 'Ringkasan' }).click()
  await admin.screenshot({
    path: 'test-results/admin-overview.png',
    fullPage: true,
  })

  // Menu edits reach the tablet live: a new item, then one sold out.
  await tablet.getByRole('button', { name: 'Pesanan', exact: true }).click()
  await admin.getByRole('button', { name: 'Menu', exact: true }).click()
  await admin.getByRole('button', { name: 'Tambah menu' }).click()
  await admin.getByLabel('Nama menu').fill('Es Kopi E2E')
  await admin.getByLabel('Harga').fill('25000')
  await admin.getByLabel('Kategori').fill('Minuman')
  await admin.getByRole('button', { name: 'Simpan' }).click()
  await expect(admin.getByText('Es Kopi E2E tersimpan')).toBeVisible()
  await expect(tablet.getByRole('button', { name: /Es Kopi E2E/ })).toBeVisible(
    { timeout: 5_000 },
  )

  await admin
    .getByRole('listitem')
    .filter({ hasText: 'Jus Jeruk' })
    .getByRole('switch')
    .uncheck()
  await expect(tablet.getByRole('button', { name: /Jus Jeruk/ })).toBeDisabled({
    timeout: 5_000,
  })
  await admin.screenshot({
    path: 'test-results/admin-menu.png',
    fullPage: true,
  })

  // Staff PINs: once the admin turns them on, the tablet asks who is working.
  await admin.getByRole('button', { name: 'Staf', exact: true }).click()
  await admin.getByRole('button', { name: 'Tambah staf' }).click()
  await admin.getByLabel('Nama').fill('Rina')
  await admin.getByLabel('PIN').fill('2468')
  await admin.getByRole('button', { name: 'Simpan' }).click()
  await expect(admin.getByText('Rina tersimpan')).toBeVisible()
  await admin.getByRole('button', { name: 'Pengaturan' }).click()
  await admin.getByRole('switch', { name: /PIN staf/ }).check()
  await expect(tablet.getByText('Siapa yang bertugas?').first()).toBeVisible({
    timeout: 5_000,
  })
  await tablet.getByRole('button', { name: /Rina/ }).click()
  for (const digit of '2468') {
    await tablet.getByRole('button', { name: digit, exact: true }).click()
  }
  await expect(tablet.getByRole('button', { name: 'Masuk' })).toBeEnabled()
  await tablet.screenshot({ path: 'test-results/pin.png' })
  await tablet.getByRole('button', { name: 'Masuk' }).click()
  await expect(tablet.getByRole('button', { name: 'Rina' })).toBeVisible()
})
