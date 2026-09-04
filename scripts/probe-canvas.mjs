/** Report whether the containment canvas is sized and actually painting. */
import puppeteer from '../frontend/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js'

const WEB = process.env.WEB_URL ?? 'http://127.0.0.1:3000'
const CHROME = process.env.CHROME_PATH ?? '/usr/bin/google-chrome'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--no-sandbox'],
  defaultViewport: { width: 1400, height: 900 },
})
const page = await browser.newPage()
page.on('pageerror', (e) => console.log('PAGE ERROR:', e.message))
page.on('console', (m) => m.type() === 'error' && console.log('CONSOLE:', m.text()))

await page.goto(`${WEB}/sign-in`, { waitUntil: 'domcontentloaded' })
const session = await page.evaluate(async (base) => {
  const r = await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'reviewer', password: 'workbench' }),
  })
  return r.ok ? r.json() : null
}, WEB)
if (session) {
  await page.evaluateOnNewDocument((t) => {
    window.sessionStorage.setItem('workbench_session_token', t)
    window.localStorage.setItem('workbench_session_token', t)
  }, session.token)
}

await page.goto(`${WEB}/`, { waitUntil: 'domcontentloaded' })
await sleep(2500)
await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
await sleep(2500)

const report = await page.evaluate(() => {
  return [...document.querySelectorAll('canvas')].map((canvas, index) => {
    const rect = canvas.getBoundingClientRect()
    const context = canvas.getContext('2d')
    let painted = 0
    try {
      const data = context.getImageData(0, 0, canvas.width, canvas.height).data
      for (let i = 3; i < data.length; i += 4) if (data[i] > 0) painted += 1
    } catch (e) {
      return { index, error: String(e) }
    }
    return {
      index,
      cssWidth: Math.round(rect.width),
      cssHeight: Math.round(rect.height),
      inViewport: rect.top < window.innerHeight && rect.bottom > 0,
      paintedPixels: painted,
    }
  })
})

console.log(JSON.stringify(report, null, 2))
await page.screenshot({ path: process.argv[2] ?? '/tmp/canvas.png' })
await browser.close()
