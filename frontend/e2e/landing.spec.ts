import { expect, test } from './support/api'

/*
 * The public page at `/`. A visitor is signed out, and the only reads it
 * makes are the session and the live egress count (GET /api/status).
 */

test.beforeEach(async ({ api }) => {
  api.set({ 'GET /api/auth/session': { authenticated: false, user: null } })
})

test('has its five sections and marks the current chapter in the header', async ({ page }) => {
  await page.goto('/')

  for (const id of ['crew', 'proof', 'product', 'run-it']) {
    await expect(page.locator(`section#${id}`), `section #${id}`).toBeAttached()
  }
  await expect(page.locator('footer.lp-footer')).toBeAttached()

  const nav = page.getByRole('navigation', { name: 'Sections' })
  const proofLink = nav.locator('a[href="#proof"]')
  await expect(proofLink).not.toHaveAttribute('aria-current', /.+/)

  // The header lights the chapter whose top has passed a third of the way
  // down the window; putting #proof at the top of the window is past it.
  await page.evaluate(() => document.getElementById('proof')?.scrollIntoView({ block: 'start', behavior: 'instant' }))
  await expect(proofLink).toHaveAttribute('aria-current', 'location')
  await expect(nav.locator('[aria-current]')).toHaveCount(1)
})

test('does not scroll sideways at 390px', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  await expect(page.locator('section#run-it')).toBeAttached()

  // Scrolled through once, so anything laid out on reveal is laid out.
  await page.evaluate(() => document.querySelector('footer.lp-footer')?.scrollIntoView({ block: 'end', behavior: 'instant' }))
  const overflow = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
    scrollX: (window.scrollTo(390, window.scrollY), window.scrollX),
  }))
  expect(overflow.scrollWidth, 'document width at a 390px viewport').toBeLessThanOrEqual(overflow.clientWidth)
  expect(overflow.scrollX, 'horizontal scroll offset after trying to scroll right').toBe(0)
})
