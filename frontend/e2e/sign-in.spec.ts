import { expect, json, test } from './support/api'
import { DEMO_DIRECTORY, HEAD_OF_INSPECTION_USER, sessionFor } from './fixtures/users'
import { PUBLIC_STATUS } from './fixtures/screens'

/*
 * Sign-in: identifier first, then the password; on a demo host the seeded
 * accounts are listed and one click signs in with the shared demo password.
 */

test.beforeEach(async ({ api }) => {
  // Signed out until POST /api/auth/login succeeds, as on the server.
  let signedIn: typeof HEAD_OF_INSPECTION_USER | null = null
  api.set({
    'GET /api/auth/session': () => ({ authenticated: signedIn !== null, user: signedIn }),
    'POST /api/auth/login': ({ body }) => {
      const { username, password } = body as { username: string; password: string }
      const account = DEMO_DIRECTORY.find((u) => u.username === username)
      if (!account || password !== 'workbench') return json(401, { detail: 'Invalid credentials' })
      signedIn = account
      return sessionFor(account)
    },
  })
})

test('asks for the username first, then the password, and signs in', async ({ page }) => {
  await page.goto('/sign-in')

  // "Sign in to" the site's configured name, read from GET /api/status.
  await expect(page.getByText('Sign in to', { exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { level: 1, name: PUBLIC_STATUS.name })).toBeVisible()
  const username = page.getByLabel('Username')
  await expect(username).toBeVisible()
  await expect(page.getByRole('textbox', { name: 'Password' })).toHaveCount(0)

  await username.fill('engineer')
  await page.getByRole('button', { name: 'Continue' }).click()

  await expect(page.getByRole('textbox', { name: 'Password' })).toBeVisible()
  await expect(page.getByRole('textbox', { name: 'Password' })).toBeFocused()
  // The name carried to the second step, with a way back to change it.
  await expect(page.locator('form').getByText('engineer', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Change' })).toBeVisible()

  await page.getByRole('textbox', { name: 'Password' }).fill('workbench')
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page).toHaveURL(/\/console$/)
})

test('a demo account signs in with one click and lands on the console', async ({ page, api }) => {
  await page.goto('/sign-in')

  const demo = page.locator('details', { hasText: 'Demo accounts' })
  await expect(demo.locator('summary')).toHaveText(new RegExp(`Demo accounts · ${DEMO_DIRECTORY.length}`))
  await demo.locator('summary').click()

  await demo.getByRole('button', { name: new RegExp(HEAD_OF_INSPECTION_USER.username) }).click()

  await expect(page).toHaveURL(/\/console$/)
  await expect(page.getByRole('heading', { name: /What should we check today\?/ })).toBeVisible()
  expect(api.calls).toContain('POST /api/auth/login')
})
