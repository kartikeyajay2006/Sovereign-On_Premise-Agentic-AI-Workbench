import { expect, sse, test, type ApiRequest } from './support/api'
import {
  DELIVERED_CHECKS,
  DELIVERED_CITED,
  DELIVERED_TASK,
  EVIDENCE,
  HELD_TASK,
  HIGH_FINDING_ONE_SIGNED,
  HIGH_FINDING_TASK,
} from './fixtures/tasks'
import type { Page } from '@playwright/test'

/*
 * The console thread: the empty state, and runs opened from the record by
 * ?run=<id>, which is how the sidebar, Proof and a shared link open them.
 */

/** "Delivered · 5/6": the stamp's count, from the fixture's own checks. */
function checkCount(checks: { passed?: boolean }[]) {
  return `${checks.filter((c) => c.passed).length}/${checks.length}`
}

/** The answer's sentences as the verifier splits them (features/thread/model/brief.ts). */
function sentences(answer: string) {
  return answer.split(/(?<=[.!?])\s+/).filter(Boolean)
}

async function openRun(page: Page, id: string) {
  await page.goto(`/console?run=${id}`)
  await expect(page.getByText(/Opening run/)).toHaveCount(0)
}

test('an empty thread shows the greeting and the starter cards', async ({ page }) => {
  await page.goto('/console')

  await expect(page.getByRole('heading', { name: /What should we check today\?/ })).toBeVisible()
  const starters = page.getByRole('list', { name: 'Starter requests' })
  // The fixtures install a vision model, so the scanned-report card shows
  // rather than the survey card: four cards.
  for (const title of ['Can V-2104 keep running?', 'Two records disagree', 'A document that gives orders', 'A relief valve failed its test']) {
    await expect(starters.getByRole('button', { name: new RegExp(title.replace(/[?]/g, '\\?')) })).toBeVisible()
  }
  await expect(starters.getByRole('listitem')).toHaveCount(4)
})

test('a delivered run opens as a Brief: lede, numbered claims, sources, stamp', async ({ page }) => {
  await openRun(page, DELIVERED_TASK.id)

  const all = sentences(DELIVERED_TASK.answer!)
  const brief = page.locator('.brief')
  await expect(brief).toBeVisible()

  // The lede is the first sentence; its citation renders as a chip.
  await expect(brief.locator('.brief-lede')).toContainText(all[0].replace(/\s*\[S\d+\]\.$/, ''))

  // The rest are numbered claims, 01, 02, ...
  const claims = brief.locator('ol.brief-claims > li')
  await expect(claims).toHaveCount(all.length - 1)
  for (let i = 0; i < all.length - 1; i += 1) {
    await expect(claims.nth(i).locator('.brief-index')).toHaveText(String(i + 1).padStart(2, '0'))
  }

  // The rail: what the answer cites, out of everything the run recorded.
  const rail = page.getByRole('complementary', { name: 'Sources this answer cites' })
  await expect(rail.locator('.brief-label')).toHaveText(`Sources · ${DELIVERED_CITED.length} of ${EVIDENCE.length} cited`)
  await expect(rail.locator('.brief-source')).toHaveCount(DELIVERED_CITED.length)
  for (const id of DELIVERED_CITED) await expect(rail).toContainText(id)

  // The stamp's count is the record's checks, passed of run.
  expect(checkCount(DELIVERED_CHECKS)).toBe('4/5')
  await expect(brief.locator('.brief-stamp')).toHaveText(`Delivered · ${checkCount(DELIVERED_TASK.verification!.checks)}`)
})

test('a held run says who must release it and what is withheld', async ({ page }) => {
  await openRun(page, HELD_TASK.id)

  const held = page.getByRole('region', { name: 'Held for release' })
  await expect(held).toBeVisible()
  // One approving role, named by its label, not its id.
  await expect(held).toContainText('Release needs the Approving Reviewer.')
  await expect(held).toContainText('Sensitive or restricted work always needs an approving authority.')
  await expect(held).toContainText('Withheld:')
  await expect(page.locator('.brief-stamp')).toHaveText(`Held for review · ${checkCount(HELD_TASK.verification!.checks)}`)
})

test('a High finding waits for both signatures, in order', async ({ page }) => {
  // features/thread/ui/held-block.tsx signaturesNeeded(): the roles a High
  // finding needs were once joined with "or", which told a reader one
  // signature would do (readiness review, f7e77e7). Found by eye then.
  await openRun(page, HIGH_FINDING_TASK.id)
  const held = page.getByRole('region', { name: 'Held for release' })
  await expect(held).toContainText('Release needs Head of Inspection, then Plant Manager.')
  await expect(held).not.toContainText('Head of Inspection or Plant Manager')
  await expect(held).not.toContainText('signed)')

  // Once the Head of Inspection has signed, only the Plant Manager is left.
  await openRun(page, HIGH_FINDING_ONE_SIGNED.id)
  await expect(page.getByRole('region', { name: 'Held for release' })).toContainText(
    'Release needs Plant Manager (1 of 2 signed).',
  )
})

test.describe('with reduced motion', () => {
  test.use({ reducedMotion: 'reduce' })

  test('a Brief released live is shown in its final state at once', async ({ page, api }) => {
    // The run is in flight when opened; the stream then reports it finished
    // and the thread reads the record again: that read is the release, the
    // one moment the Brief would rise and stamp.
    const id = DELIVERED_TASK.id
    api.set({
      [`GET /api/tasks/${id}`]: ({ call }: ApiRequest) => (call === 0 ? { ...DELIVERED_TASK, status: 'executing', answer: null, verification: null } : DELIVERED_TASK),
      'GET /api/events': sseFinished(id),
    })
    await page.goto(`/console?run=${id}`)

    const brief = page.locator('.brief')
    const stamp = brief.locator('.brief-stamp')
    await expect(stamp).toBeVisible()
    await expect(stamp).toHaveText(`Delivered · ${checkCount(DELIVERED_CHECKS)}`)
    expect(api.calls.filter((c) => c === `GET /api/tasks/${id}`).length, 'read in flight, then read at release').toBeGreaterThanOrEqual(2)

    for (const part of [brief.locator('.brief-lede'), ...(await brief.locator('ol.brief-claims > li').all()), stamp]) {
      await expect(part).toHaveCSS('opacity', '1')
      expect(await part.evaluate((el) => el.getAnimations().length), 'animations on a Brief part').toBe(0)
    }
  })
})

/** GET /api/events for one run: it finished (backend/api/routes/system.py _sse). */
function sseFinished(taskId: string) {
  return sse([{ event: 'task.finished', task_id: taskId, at: '2026-09-24T01:05:08.827664Z', data: { status: 'delivered' } }])
}
