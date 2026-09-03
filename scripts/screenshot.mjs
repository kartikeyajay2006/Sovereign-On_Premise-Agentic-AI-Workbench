/**
 * Capture the workbench console for visual review.
 *
 * Signs in through the real API, stores the session the way the app does,
 * then photographs each screen. Used during development to check the console
 * renders as intended; not part of the deployed platform.
 *
 * Usage: node scripts/screenshot.mjs [outputDir] [username] [password]
 */

import { mkdirSync } from "node:fs";
import { join } from "node:path";
import puppeteer from "../frontend/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js";

const OUT = process.argv[2] ?? "/tmp/workbench-shots";
const USERNAME = process.argv[3] ?? "reviewer";
const PASSWORD = process.argv[4] ?? "workbench";
const WEB = process.env.WEB_URL ?? "http://127.0.0.1:3000";
const CHROME = process.env.CHROME_PATH ?? "/usr/bin/google-chrome";

const SCREENS = [
  { path: "/", name: "console", wait: 2500 },
  { path: "/tasks", name: "tasks", wait: 2500 },
  { path: "/approvals", name: "approvals", wait: 2200 },
  { path: "/registry", name: "registry", wait: 2200 },
  { path: "/security", name: "security", wait: 3000 },
  { path: "/audit", name: "audit", wait: 2500 },
];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  mkdirSync(OUT, { recursive: true });

  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: "new",
    args: ["--no-sandbox", "--disable-gpu", "--hide-scrollbars"],
    defaultViewport: { width: 1600, height: 1000 },
  });

  const page = await browser.newPage();

  // Authenticate against the API and seed the session the app expects.
  const session = await page.evaluate(
    async ([base, username, password]) => {
      const response = await fetch(`${base}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      if (!response.ok) throw new Error(`login failed: ${response.status}`);
      return response.json();
    },
    [WEB, USERNAME, PASSWORD],
  ).catch(async (error) => {
    // evaluate needs a document; load the origin first, then retry.
    await page.goto(`${WEB}/sign-in`, { waitUntil: "domcontentloaded" });
    return page.evaluate(
      async ([base, username, password]) => {
        const response = await fetch(`${base}/api/auth/login`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username, password }),
        });
        if (!response.ok) throw new Error(`login failed: ${response.status}`);
        return response.json();
      },
      [WEB, USERNAME, PASSWORD],
    );
  });

  await page.evaluateOnNewDocument((token) => {
    window.sessionStorage.setItem("workbench.session", token);
  }, session.token);

  console.log(`signed in as ${session.user.display_name} (${session.user.role})`);

  for (const screen of SCREENS) {
    await page.goto(`${WEB}${screen.path}`, { waitUntil: "networkidle2" });
    await sleep(screen.wait);
    const file = join(OUT, `${screen.name}.png`);
    await page.screenshot({ path: file, fullPage: false });
    console.log(`captured ${screen.name} -> ${file}`);
  }

  await browser.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
