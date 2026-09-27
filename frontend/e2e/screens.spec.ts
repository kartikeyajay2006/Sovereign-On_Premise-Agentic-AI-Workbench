import { expect, test } from './support/api'
import { HELD_TASK, HIGH_FINDING_TASK } from './fixtures/tasks'
import { ACCESS_REQUESTS, AUDIT_RECORDS, HARNESS_CATALOG } from './fixtures/screens'

/*
 * The app's other screens load from their fixtures, with their heading and
 * one row of content. The console-error and unmocked-call checks in
 * support/api.ts run after each of these as after every test.
 */

test('Approvals lists the held runs', async ({ page }) => {
  await page.goto('/approvals')
  await expect(page.getByRole('heading', { level: 1, name: 'Approvals' })).toBeVisible()
  await expect(page.getByText(HELD_TASK.prompt).first()).toBeVisible()
  await expect(page.getByText(HIGH_FINDING_TASK.prompt).first()).toBeVisible()
})

test('Harnesses shows the library', async ({ page }) => {
  await page.goto('/harnesses')
  await expect(page.getByRole('heading', { level: 1, name: 'Harnesses' })).toBeVisible()
  await expect(page.getByText(HARNESS_CATALOG.harnesses[0].name).first()).toBeVisible()
})

test('Audit shows the chain and its records', async ({ page }) => {
  await page.goto('/audit')
  await expect(page.getByRole('heading', { level: 1, name: 'Audit' })).toBeVisible()
  const records = page.getByRole('region', { name: 'Records' })
  for (const record of AUDIT_RECORDS) {
    await expect(records.getByRole('button', { name: new RegExp(`^#${record.sequence} .*${record.action.replace(/\./g, '\\.')}`) })).toBeVisible()
  }
})

test('People shows access requests and accounts', async ({ page }) => {
  await page.goto('/admin/access')
  await expect(page.getByRole('heading', { level: 1, name: 'People' })).toBeVisible()
  await expect(page.getByText(ACCESS_REQUESTS[0].display_name).first()).toBeVisible()
})
