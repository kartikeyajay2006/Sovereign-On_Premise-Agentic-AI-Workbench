/**
 * Capture one page, optionally full-length or at a given width.
 *
 * Usage: node scripts/shoot-page.mjs <route> <out.png> [width] [full]
 */

import puppeteer from "../frontend/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js";

const ROUTE = process.argv[2] ?? "/";
const OUT = process.argv[3] ?? "/tmp/page.png";
const WIDTH = Number(process.argv[4] ?? 1600);
const FULL = process.argv[5] === "full";
const WEB = process.env.WEB_URL ?? "http://127.0.0.1:3000";
const CHROME = process.env.CHROME_PATH ?? "/usr/bin/google-chrome";
const USERNAME = process.env.WB_USER ?? "reviewer";
const PASSWORD = process.env.WB_PASS ?? "workbench";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: "new",
  args: ["--no-sandbox", "--disable-gpu", "--hide-scrollbars"],
  defaultViewport: { width: WIDTH, height: FULL ? 1000 : Math.round(WIDTH * 0.62) },
});

const page = await browser.newPage();
await page.goto(`${WEB}/sign-in`, { waitUntil: "domcontentloaded" });

const session = await page.evaluate(
  async ([base, username, password]) => {
    const response = await fetch(`${base}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    return response.ok ? response.json() : null;
  },
  [WEB, USERNAME, PASSWORD],
);

if (session) {
  await page.evaluateOnNewDocument((token) => {
    window.sessionStorage.setItem("workbench_session_token", token);
    window.localStorage.setItem("workbench_session_token", token);
  }, session.token);
}

await page.goto(`${WEB}${ROUTE}`, { waitUntil: "domcontentloaded" });
await sleep(3500);
await page.screenshot({ path: OUT, fullPage: FULL });
console.log(`captured ${ROUTE} (${WIDTH}px${FULL ? ", full page" : ""}) -> ${OUT}`);
await browser.close();
