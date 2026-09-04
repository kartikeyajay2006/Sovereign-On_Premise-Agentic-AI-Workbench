/**
 * Load every screen with an authenticated session and report anything the
 * browser complains about: console errors, page exceptions, failed requests.
 *
 * Development tooling — a build that compiles is not the same as a page that
 * runs, and this is the difference.
 *
 * Usage: node scripts/check-console.mjs [username] [password]
 */

import puppeteer from "../frontend/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js";

const USERNAME = process.argv[2] ?? "reviewer";
const PASSWORD = process.argv[3] ?? "workbench";
const WEB = process.env.WEB_URL ?? "http://127.0.0.1:3000";
const CHROME = process.env.CHROME_PATH ?? "/usr/bin/google-chrome";

const ROUTES = [
  "/",
  "/sign-in",
  "/ask",
  "/tasks",
  "/registry",
  "/approvals",
  "/security",
  "/audit",
];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: "new",
    args: ["--no-sandbox", "--disable-gpu"],
    defaultViewport: { width: 1600, height: 1000 },
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
      if (!response.ok) throw new Error(`login failed: ${response.status}`);
      return response.json();
    },
    [WEB, USERNAME, PASSWORD],
  );

  await page.evaluateOnNewDocument((token) => {
    window.sessionStorage.setItem("workbench_session_token", token);
    window.localStorage.setItem("workbench_session_token", token);
  }, session.token);

  let total = 0;

  for (const route of ROUTES) {
    const problems = [];

    const onConsole = (message) => {
      if (message.type() === "error") problems.push(`console: ${message.text()}`);
      if (message.type() === "warning" && /key|hydrat/i.test(message.text())) {
        problems.push(`warning: ${message.text()}`);
      }
    };
    const onError = (error) => problems.push(`exception: ${error.message}`);
    const onResponse = (response) => {
      if (response.status() >= 400) {
        problems.push(`HTTP ${response.status()} ${response.url().replace(WEB, "")}`);
      }
    };
    const onFailed = (request) => {
      const failure = request.failure();
      // A cancelled Server-Sent Events stream on navigation is expected.
      if (failure && !/ABORTED/i.test(failure.errorText)) {
        problems.push(`request failed: ${request.url()} — ${failure.errorText}`);
      }
    };

    page.on("console", onConsole);
    page.on("pageerror", onError);
    page.on("requestfailed", onFailed);
    page.on("response", onResponse);

    await page.goto(`${WEB}${route}`, { waitUntil: "domcontentloaded" });
    await sleep(3200);

    page.off("console", onConsole);
    page.off("pageerror", onError);
    page.off("requestfailed", onFailed);
    page.off("response", onResponse);

    const unique = [...new Set(problems)];
    total += unique.length;

    if (unique.length === 0) {
      console.log(`OK    ${route}`);
    } else {
      console.log(`FAIL  ${route}`);
      for (const problem of unique.slice(0, 6)) console.log(`        ${problem}`);
    }
  }

  await browser.close();
  console.log(total === 0 ? "\nNo browser errors on any screen." : `\n${total} problem(s) found.`);
  process.exit(total === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
