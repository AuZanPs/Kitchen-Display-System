import { expect, test } from '@playwright/test'
import { expectAccessible, pair, settle, signInAdmin } from './helpers.ts'

// Imports a menu from an Excel file, then uses search, bulk sold out, the
// one-tap reset, duplicate and delete on it.
test('the admin imports a menu file and manages it', async ({ browser }) => {
  test.setTimeout(120_000)
  const admin = await signInAdmin(browser)
  await admin.getByRole('button', { name: 'Menu', exact: true }).click()

  // The dialog opens on the ready templates.
  await admin
    .getByRole('button', { name: 'Impor', exact: true })
    .first()
    .click()
  const dialog = admin.getByRole('dialog', { name: 'Impor menu' })
  await dialog.getByRole('button', { name: /Kedai kopi/ }).click()
  await expect(dialog.getByText('14 menu dalam 4 kategori.')).toBeVisible()
  await settle(admin)
  await expectAccessible(admin, 'menu template')
  await admin.screenshot({ path: 'test-results/menu-template.png' })
  await dialog.getByRole('button', { name: 'Dari file Excel' }).click()
  await dialog
    .locator('input[type=file]')
    .setInputFiles('e2e/fixtures/menu.xlsx')
  await expect(dialog.getByText('5 menu dalam 3 kategori.')).toBeVisible()
  await expect(dialog.getByText('Mi/Kwetiau Ayam Jamur (Jumbo)')).toBeVisible()
  await settle(admin)
  await expectAccessible(admin, 'menu import')
  await admin.screenshot({ path: 'test-results/menu-import.png' })
  await expect(dialog.getByRole('switch')).toBeChecked()
  await dialog.getByRole('button', { name: 'Tambah 5 menu' }).click()
  await expect(admin.getByText('5 menu ditambahkan')).toBeVisible()

  // The old menu is hidden, the file is the menu now.
  const list = admin.getByRole('region', { name: 'Daftar menu' })
  await expect(list.getByRole('button', { name: /Es Jeruk/ })).toBeVisible()
  await admin.getByLabel('Cari menu').fill('jamur')
  await expect(list.getByRole('button', { name: /Es Jeruk/ })).toHaveCount(0)
  await expect(
    list.getByRole('button', { name: /Mi Ayam Jamur/ }),
  ).toBeVisible()
  await admin.getByLabel('Cari menu').fill('')

  // Two items sold out at once, then everything back for a new day.
  await list.getByRole('button', { name: 'Pilih', exact: true }).click()
  await list.getByRole('button', { name: /Es Teh Manis/ }).click()
  await list.getByRole('button', { name: /Es Jeruk/ }).click()
  await admin
    .getByRole('toolbar')
    .getByRole('button', { name: 'Habis' })
    .click()
  await expect(admin.getByText('2 menu ditandai habis')).toBeVisible()
  await list.getByRole('button', { name: 'Selesai' }).click()
  await settle(admin)
  await admin.screenshot({ path: 'test-results/menu-sold-out.png' })
  await list.getByRole('button', { name: 'Semua tersedia lagi' }).click()
  await expect(admin.getByText('Semua menu tersedia lagi')).toBeVisible()

  // Duplicate an item, then delete the copy nobody ordered.
  await list.getByRole('button', { name: /^Es Jeruk/ }).click()
  await admin.getByRole('button', { name: 'Salin' }).click()
  const copy = admin.getByRole('dialog', { name: 'Salin menu' })
  await expect(copy.getByLabel('Nama menu')).toHaveValue('Es Jeruk (salinan)')
  await copy.getByRole('button', { name: 'Simpan' }).click()
  await expect(admin.getByText('Es Jeruk (salinan) tersimpan')).toBeVisible()
  await list.getByRole('button', { name: /Es Jeruk \(salinan\)/ }).click()
  await admin.getByRole('button', { name: 'Hapus' }).click()
  await admin.getByRole('button', { name: 'Hapus' }).click()
  await expect(admin.getByText('Es Jeruk (salinan) dihapus')).toBeVisible()
  await expect(
    list.getByRole('button', { name: /Es Jeruk \(salinan\)/ }),
  ).toHaveCount(0)

  // Worst realistic rows: name and category at their limits, a name with no
  // spaces, a two-letter name, an emoji, the top price.
  const worst = [
    'Kategori;Nama;Ukuran;Harga',
    'Minuman Dingin & Panas Spesial;Kwetiau Siram Seafood Spesial Komplit Pakai Telur Bebek Asin;Reguler;10000000',
    'Minuman Dingin & Panas Spesial;Es-Kopi-Susu-Gula-Aren-Dengan-Topping-Cincau-Hitam-Premium;;Rp 35.000',
    'Minuman Dingin & Panas Spesial;Es;;1000',
    'Lain;Es Teh 🍋;Jumbo;9000',
  ].join('\n')
  await admin.setViewportSize({ width: 320, height: 700 })
  await admin
    .getByRole('button', { name: 'Impor', exact: true })
    .first()
    .click()
  await dialog.getByRole('button', { name: 'Dari file Excel' }).click()
  await dialog.locator('input[type=file]').setInputFiles({
    name: 'menu-panjang.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(worst),
  })
  await expect(dialog.getByText('4 menu dalam 2 kategori.')).toBeVisible()
  await settle(admin)
  await admin.screenshot({ path: 'test-results/menu-import-320.png' })
  await dialog.getByRole('button', { name: 'Tambah 4 menu' }).click()
  await expect(admin.getByText('4 menu ditambahkan')).toBeVisible()
  await expect(list.getByRole('button', { name: /Es Teh 🍋/ })).toBeVisible()

  for (const width of [320, 360, 820, 1280]) {
    await admin.setViewportSize({ width, height: 900 })
    await settle(admin)
    await expectAccessible(admin, `menu ${width}`)
    // No sideways scroll at any width.
    expect(
      await admin.evaluate(
        () => document.documentElement.scrollWidth - window.innerWidth,
      ),
    ).toBeLessThanOrEqual(0)
    await admin.screenshot({
      path: `test-results/menu-${width}.png`,
      fullPage: true,
    })
  }

  // With allergy questions off, an item without options adds on a tap and
  // the card takes one back without opening the order.
  const saved = await admin.evaluate(async () => {
    const res = await fetch('/api/admin/settings', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        allergy: false,
        lineNotes: true,
        orderNote: true,
        staffPins: false,
      }),
    })
    return res.status
  })
  expect(saved).toBe(200)
  await admin.getByRole('button', { name: 'Perangkat', exact: true }).click()
  const tablet = await pair(browser, admin, 'Tablet pelayan', 'Tablet cepat', {
    width: 820,
    height: 1180,
  })
  await tablet.getByRole('button', { name: /^Es Rp/ }).click()
  await tablet.getByRole('button', { name: 'Es, 1 di pesanan' }).click()
  await expect(
    tablet.getByRole('button', { name: 'Es, 2 di pesanan' }),
  ).toBeVisible()
  await tablet.getByRole('button', { name: 'Kurangi satu Es' }).first().click()
  await expect(
    tablet.getByRole('button', { name: 'Es, 1 di pesanan' }),
  ).toBeVisible()
  await settle(tablet)
  await expectAccessible(tablet, 'quick add')
  await tablet.screenshot({ path: 'test-results/waiter-quick-add.png' })
})
