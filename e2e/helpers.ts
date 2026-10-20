/// <reference lib="dom" />
import { readFileSync } from 'node:fs'
import { AxeBuilder } from '@axe-core/playwright'
import { type Browser, expect, type Page } from '@playwright/test'

// The dev server reads the same file, so the test uses the owner's local password.
export const ADMIN_PASSWORD =
  /^ADMIN_PASSWORD=(.*)$/m
    .exec(readFileSync('.dev.vars', 'utf8'))?.[1]
    ?.trim() ?? ''

export const SUPER_ADMIN_PASSWORD =
  /^SUPER_ADMIN_PASSWORD=(.*)$/m
    .exec(readFileSync('.dev.vars', 'utf8'))?.[1]
    ?.trim() ?? ''

/** Waits for entrance motion to finish; endless spinners are ignored. */
export async function settle(page: Page) {
  // Data still loading would fade in after the check below.
  await page.locator('[aria-label="Memuat…"]').first().waitFor({
    state: 'detached',
  })
  await page.waitForFunction(() =>
    document
      .getAnimations()
      .every(
        (a) =>
          a.playState !== 'running' ||
          a.effect?.getTiming().iterations === Number.POSITIVE_INFINITY,
      ),
  )
}

/** WCAG 2.1 A/AA checks on what is on screen now. */
export async function expectAccessible(page: Page, screen: string) {
  // Hover layers and entrance fades would skew the contrast checks.
  await page.mouse.move(0, 0)
  await settle(page)
  const { violations } = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze()
  // Nothing may push the page wider than the screen.
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  )
  expect.soft(overflow, `${screen}: sideways scroll`).toBeLessThanOrEqual(0)
  // Nor may anything stick out of the box drawn around it, like a long total
  // out of its tile. Bleeding into a parent's padding is fine; scrollers and
  // absolutely placed marks overflow on purpose.
  const spills = await page.evaluate(() => {
    const found: string[] = []
    const name = (el: Element, why: string) =>
      `<${el.localName} class="${el.getAttribute('class') ?? ''}"> ${why} "${el.textContent?.trim().slice(0, 30)}"`
    const shown = (style: CSSStyleDeclaration) =>
      style.display !== 'inline' &&
      style.display !== 'contents' &&
      style.visibility === 'visible'
    for (const el of document.querySelectorAll('body *')) {
      if (!(el instanceof HTMLElement)) continue
      const style = getComputedStyle(el)
      if (!shown(style) || /absolute|fixed/.test(style.position)) continue
      const box = el.getBoundingClientRect()
      if (box.width === 0) continue
      if (/auto|scroll/.test(style.overflowX)) continue
      if (
        style.overflowX === 'visible' &&
        el.childElementCount === 0 &&
        el.scrollWidth > el.clientWidth + 1
      ) {
        found.push(name(el, `text ${el.scrollWidth}>${el.clientWidth}`))
        continue
      }
      const parent = el.parentElement
      if (!parent) continue
      const outer = getComputedStyle(parent)
      if (!shown(outer) || outer.overflowX !== 'visible') continue
      const edge = parent.getBoundingClientRect()
      const left = edge.left + Number.parseFloat(outer.borderLeftWidth)
      const right = edge.right - Number.parseFloat(outer.borderRightWidth)
      if (edge.width > 0 && (box.left < left - 1 || box.right > right + 1)) {
        found.push(name(el, `sticks out ${Math.round(box.right - right)}px`))
      }
    }
    return found
  })
  expect.soft(spills, `${screen}: content spills out of its box`).toEqual([])
  // Soft, so one run reports every screen.
  expect
    .soft(
      violations.map(
        (v) =>
          `${screen}: ${v.id} x${v.nodes.length} ${v.nodes[0]?.target} ${v.nodes[0]?.any[0]?.message ?? ''}`,
      ),
    )
    .toEqual([])
}

export async function signInAdmin(browser: Browser) {
  const admin = await (await browser.newContext()).newPage()
  await admin.goto('/admin')
  await admin.getByLabel('Kata sandi').fill(ADMIN_PASSWORD)
  await admin.getByRole('button', { name: 'Masuk' }).click()
  await expect(admin.getByRole('heading', { name: 'Layar' })).toBeVisible()
  return admin
}

/** Opens /enroll in a fresh browser, approves its code from the admin page. */
export async function pair(
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
  await expectAccessible(page, 'enroll')
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
