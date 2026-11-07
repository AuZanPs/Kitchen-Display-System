import { expect, test } from '@playwright/test'
import { expectAccessible, pair, signInAdmin } from './helpers.ts'

test('a paired tablet sends an order that appears on the paired TV without reload', async ({
  browser,
}) => {
  // The whole order flow plus the phone PIN check runs close to a minute.
  test.setTimeout(120_000)
  const admin = await signInAdmin(browser)
  // Allergy is off by default; this venue wants the detailed form.
  await admin.getByRole('button', { name: 'Settings' }).click()
  await admin.getByRole('switch', { name: /Allergy field/ }).check()
  await expect(admin.getByText('Settings saved')).toBeVisible()
  await admin.getByRole('button', { name: 'Devices' }).click()
  const tablet = await pair(browser, admin, 'Waiter tablet', 'Tablet E2E', {
    width: 1280,
    height: 800,
  })
  const tv = await pair(browser, admin, 'Kitchen TV', 'TV E2E', {
    width: 1920,
    height: 1080,
  })
  const kitchen = await pair(browser, admin, 'Kitchen phone', 'HP E2E', {
    width: 390,
    height: 844,
  })
  await expect(tablet).toHaveURL(/\/waiter/)
  await expect(tv).toHaveURL(/\/tv/)
  await expect(kitchen).toHaveURL(/\/kitchen/)
  // Presence: all three paired screens report online within one poll.
  await expect(admin.getByText('Online', { exact: true })).toHaveCount(3, {
    timeout: 15_000,
  })
  await admin.screenshot({
    path: 'test-results/admin-devices.png',
    fullPage: true,
  })
  await expectAccessible(admin, 'admin-devices')

  await expect(tv.getByText('Live')).toBeVisible()
  await expect(tablet.getByText('Kitchen TV online')).toBeVisible()

  const allergy = `shrimp ${Date.now()}`
  await tablet.getByRole('button', { name: 'Choose a table' }).first().click()
  await tablet.getByRole('button', { name: 'Table 7', exact: true }).click()
  await tablet.getByRole('button', { name: /Nasi Goreng Kampung/ }).click()
  await tablet.getByRole('button', { name: 'Not spicy' }).click()
  await tablet.getByLabel('Allergy').fill(allergy)
  await tablet.getByRole('button', { name: /Add to order/ }).click()
  await tablet.screenshot({ path: 'test-results/composer.png' })
  await expectAccessible(tablet, 'composer')
  await tablet.getByRole('button', { name: 'Review order' }).click()
  // The review shows the same ticket the kitchen will read.
  await expect(tablet.getByRole('dialog').getByText(allergy)).toBeVisible()
  await tablet.getByRole('button', { name: 'Send to kitchen' }).click()

  // Arrives on the TV through the socket; the page is never reloaded.
  const ticket = tv.getByRole('article').filter({ hasText: allergy })
  await expect(ticket).toBeVisible({ timeout: 5_000 })
  await expect(ticket.getByText('ALLERGY')).toBeVisible()

  // The TV's render receipt flows back to the tablet's status card.
  await expect(
    tablet.getByRole('status').filter({ hasText: 'Shown on TV' }).first(),
  ).toBeVisible({
    timeout: 5_000,
  })

  await tablet.screenshot({ path: 'test-results/waiter.png' })
  await tv.screenshot({ path: 'test-results/tv.png' })
  await expectAccessible(tv, 'tv')

  // Kitchen accepts (allergy must be confirmed), then marks it ready.
  const card = kitchen
    .locator('div')
    .filter({ has: kitchen.getByRole('article').filter({ hasText: allergy }) })
    .last()
  await card.getByRole('button', { name: 'Accept' }).click()
  await kitchen.getByRole('button', { name: 'Read, accept' }).click()
  await expect(
    tv
      .getByRole('region', { name: 'Preparing' })
      .getByRole('article')
      .filter({ hasText: allergy }),
  ).toBeVisible()
  await kitchen.screenshot({ path: 'test-results/kitchen.png', fullPage: true })
  await expectAccessible(kitchen, 'kitchen')
  await card.getByRole('button', { name: 'Ready' }).click()
  await expect(
    tv
      .getByRole('region', { name: 'Ready to serve' })
      .getByRole('article')
      .filter({ hasText: allergy }),
  ).toBeVisible()

  // The waiter delivers it.
  const served = tablet
    .getByRole('listitem')
    .filter({ hasText: 'Ready to serve' })
    .first()
  await served.getByRole('button', { name: 'Served' }).click()
  await expect(
    tv.getByRole('article').filter({ hasText: allergy }),
  ).toBeHidden()

  // The admin can clear a stuck order from the overview; it leaves the TV.
  await tablet.getByRole('button', { name: 'Orders', exact: true }).click()
  await tablet.locator('label').filter({ hasText: 'Takeaway' }).click()
  await tablet.getByRole('button', { name: /Es Teh Lemon/ }).click()
  await tablet.getByRole('button', { name: /Add to order/ }).click()
  await tablet.getByRole('button', { name: 'Review order' }).click()
  await tablet.getByRole('button', { name: 'Send to kitchen' }).click()
  const takeaway = tv.getByRole('article').filter({ hasText: 'Es Teh Lemon' })
  await expect(takeaway).toBeVisible()

  // Amendments from the waiter's service list: move, add an item, ask to cancel.
  const serviceCard = () => tablet.locator('main > ul > li').first()
  await serviceCard().getByRole('button', { name: 'Move table' }).click()
  await tablet.getByRole('button', { name: 'Table 3', exact: true }).click()
  await expect(takeaway).toContainText('Table 3')
  await serviceCard().getByRole('button', { name: 'Add items' }).click()
  await expect(tablet.getByText(/Adding items to/)).toBeVisible()
  await tablet.getByRole('button', { name: /Air Mineral/ }).click()
  await tablet.getByRole('button', { name: /Add to order/ }).click()
  await tablet.getByRole('button', { name: 'Review order' }).click()
  await tablet.getByRole('button', { name: 'Send to kitchen' }).click()
  await expect(takeaway).toContainText('Air Mineral')
  await serviceCard().getByRole('button', { name: 'Cancel order' }).click()
  await tablet.getByLabel('Reason').fill('Wrong table')
  await tablet.getByRole('button', { name: 'Request cancel' }).click()
  await expect(
    tablet.getByText('Waiting for the kitchen to confirm the cancel'),
  ).toBeVisible()
  await tablet.screenshot({ path: 'test-results/service.png' })
  await expectAccessible(tablet, 'service')

  // The kitchen sees the request on top and confirms it; the TV drops it.
  await kitchen.getByRole('button', { name: 'Confirm cancellation' }).click()
  await expect(takeaway).toBeHidden()

  await admin.getByRole('button', { name: 'Overview' }).click()
  await admin.screenshot({
    path: 'test-results/admin-overview.png',
    fullPage: true,
  })

  // Menu edits reach the tablet live: a new item, then one sold out.
  await tablet.getByRole('button', { name: 'Orders', exact: true }).click()
  await admin.getByRole('button', { name: 'Menu', exact: true }).click()
  await admin.getByRole('button', { name: 'Add item' }).click()
  await admin.getByLabel('Item name').fill('Es Kopi E2E')
  await admin.getByLabel('Price').fill('25000')
  await admin.getByLabel('Category').fill('Minuman')
  await admin.getByRole('button', { name: 'Save' }).click()
  await expect(admin.getByText('Es Kopi E2E saved')).toBeVisible()
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
  await expectAccessible(admin, 'admin-menu')

  // History: today's orders with totals, and each order's timeline.
  await admin.getByRole('button', { name: 'History' }).click()
  await expect(admin.getByText('Sales')).toBeVisible()
  await admin.getByRole('button', { name: /A-001/ }).click()
  await expect(
    admin.getByRole('dialog').getByText('Accepted by kitchen'),
  ).toBeVisible()
  await admin.screenshot({ path: 'test-results/admin-history.png' })
  await expectAccessible(admin, 'history')
  await admin.keyboard.press('Escape')

  // Staff PINs: once the admin turns them on, the tablet asks who is working.
  await admin.getByRole('button', { name: 'Staff', exact: true }).click()
  await admin.getByRole('button', { name: 'Add staff' }).click()
  await admin.getByLabel('Name').fill('Rina')
  await admin.getByLabel('PIN').fill('2468')
  await admin.getByRole('button', { name: 'Save' }).click()
  await expect(admin.getByText('Rina saved')).toBeVisible()
  await admin.getByRole('button', { name: 'Settings' }).click()
  await admin.getByRole('switch', { name: /Staff PINs/ }).check()
  await expect(tablet.getByText('Who is working?').first()).toBeVisible({
    timeout: 5_000,
  })
  await tablet.getByRole('button', { name: /Rina/ }).click()
  for (const digit of '2468') {
    await tablet.getByRole('button', { name: digit, exact: true }).click()
  }
  await expect(tablet.getByRole('button', { name: 'Sign in' })).toBeEnabled()
  await tablet.screenshot({ path: 'test-results/pin.png' })
  await expectAccessible(tablet, 'pin')
  // A small phone with its browser bar: the whole pad fits without scrolling.
  await tablet.setViewportSize({ width: 360, height: 600 })
  const below = await tablet.evaluate(
    () => document.documentElement.scrollHeight - window.innerHeight,
  )
  expect.soft(below, 'pin pad scrolls on a phone').toBeLessThanOrEqual(0)
  await expectAccessible(tablet, 'pin 360')
  await tablet.screenshot({ path: 'test-results/pin-360.png' })
  await tablet.setViewportSize({ width: 1280, height: 800 })
  await tablet.getByRole('button', { name: 'Sign in' }).click()
  await expect(tablet.getByRole('button', { name: 'Rina' })).toBeVisible()
})
