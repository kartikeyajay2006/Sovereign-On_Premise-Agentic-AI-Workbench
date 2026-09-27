import { defineConfig, devices } from '@playwright/test'

/*
 * Frontend smoke tests (docs/handbook/13-development/02-testing.md).
 *
 * The app runs as a production build, `next start` on a spare port, and
 * every /api call is answered in the browser by page.route() from the
 * fixtures in e2e/fixtures. No backend, no Ollama, no model run.
 *
 * WORKBENCH_API_URL points the server's /api rewrite at a closed port, so a
 * request the browser did not intercept -- or one made by the server itself
 * -- fails instead of reaching a workbench that happens to be running on
 * this machine. The rewrite is read at build time, so the build gets it too.
 *
 * E2E_SKIP_BUILD=1 serves an existing .next (CI builds it in the step
 * before). E2E_WEBPACK=1 builds with webpack: Turbopack refuses a
 * node_modules that is a junction out of the project, as it is in a git
 * worktree on Windows.
 */

const PORT = Number(process.env.E2E_PORT ?? 3300)
const CLOSED_API = 'http://127.0.0.1:9'

const build = process.env.E2E_SKIP_BUILD ? '' : `npx next build${process.env.E2E_WEBPACK ? ' --webpack' : ''} && `

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? [['list'], ['github']] : 'list',
  timeout: 30_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: 'retain-on-failure',
    // The console's dates are rendered in the browser's zone and locale.
    timezoneId: 'UTC',
    locale: 'en-GB',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `${build}npx next start -p ${PORT} -H 127.0.0.1`,
    url: `http://127.0.0.1:${PORT}/sign-in`,
    timeout: 300_000,
    reuseExistingServer: false,
    env: {
      WORKBENCH_API_URL: CLOSED_API,
      NEXT_TELEMETRY_DISABLED: '1',
    },
    stdout: 'ignore',
    stderr: 'pipe',
  },
})
