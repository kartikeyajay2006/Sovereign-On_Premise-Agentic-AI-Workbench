import { expect, test as base, type Page, type Route } from '@playwright/test'
import { defaultRoutes } from '../fixtures/routes'

/*
 * The API, answered in the browser.
 *
 * Every request to /api/** is fulfilled here from e2e/fixtures; nothing
 * reaches a server. A request with no fixture is answered 404 and recorded,
 * and the test fails at the end naming it, so a screen that starts calling a
 * new endpoint says so here instead of passing on an error state.
 *
 * Every test also fails on a console error or an uncaught page error.
 */

export interface ApiRequest {
  method: string
  url: URL
  /** The parsed JSON body, or null. */
  body: unknown
  /** How many times this method and path have been answered before. */
  call: number
}

/** A non-200 answer, or a server-sent event stream. */
export class Reply {
  constructor(
    readonly status: number,
    readonly body: string,
    readonly contentType: string,
  ) {}
}

export function json(status: number, body: unknown): Reply {
  return new Reply(status, JSON.stringify(body), 'application/json')
}

/**
 * A text/event-stream body, in backend/api/routes/system.py _sse()'s format:
 * a named event and a JSON data line. The long retry keeps the browser from
 * reconnecting within a test once the body ends.
 */
export function sse(events: Array<{ event: string; task_id: string | null; at: string; data: Record<string, unknown> }> = []): Reply {
  const body = ['retry: 600000', '', ...events.flatMap((payload) => [`event: ${payload.event}`, `data: ${JSON.stringify(payload)}`, ''])].join('\n')
  return new Reply(200, `${body}\n`, 'text/event-stream')
}

export type Handler = ((request: ApiRequest) => unknown) | object | string | number | boolean | null

/** Keyed "METHOD /api/path", query string excluded. */
export type RouteTable = Record<string, Handler>

export class MockApi {
  private readonly table = new Map<string, Handler>()
  private readonly counts = new Map<string, number>()
  readonly unmocked: string[] = []
  readonly calls: string[] = []

  constructor(routes: RouteTable) {
    this.set(routes)
  }

  set(routes: RouteTable) {
    for (const [key, handler] of Object.entries(routes)) this.table.set(key, handler)
  }

  async handle(route: Route) {
    const request = route.request()
    const url = new URL(request.url())
    const key = `${request.method()} ${url.pathname}`
    this.calls.push(key)
    const call = this.counts.get(key) ?? 0
    this.counts.set(key, call + 1)

    if (!this.table.has(key)) {
      this.unmocked.push(key)
      return route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ detail: `No e2e fixture for ${key}` }) })
    }
    const handler = this.table.get(key)
    let body: unknown = null
    try {
      body = request.postDataJSON()
    } catch {
      body = request.postData()
    }
    const result = typeof handler === 'function' ? await (handler as (r: ApiRequest) => unknown)({ method: request.method(), url, body, call }) : handler
    if (result instanceof Reply) return route.fulfill({ status: result.status, contentType: result.contentType, body: result.body })
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(result) })
  }
}

async function mount(page: Page, routes: RouteTable): Promise<MockApi> {
  const api = new MockApi(routes)
  await page.route('**/api/**', (route) => api.handle(route))
  return api
}

export const test = base.extend<{ api: MockApi; consoleErrors: string[] }>({
  api: [
    async ({ page }, use) => {
      const api = await mount(page, defaultRoutes())
      await use(api)
      expect(api.unmocked, 'API calls with no fixture in e2e/fixtures').toEqual([])
    },
    { auto: true },
  ],
  consoleErrors: [
    async ({ page }, use) => {
      const errors: string[] = []
      page.on('console', (message) => {
        if (message.type() === 'error') errors.push(message.text())
      })
      page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`))
      await use(errors)
      expect(errors, 'console errors').toEqual([])
    },
    { auto: true },
  ],
})

export { expect }
