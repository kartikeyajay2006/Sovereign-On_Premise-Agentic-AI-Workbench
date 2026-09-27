#!/usr/bin/env python3
"""Open every console screen as every account, and fail on anything that goes wrong.

    .venv/bin/python scripts/ui_check.py                      # http://127.0.0.1:3000, every demo account
    .venv/bin/python scripts/ui_check.py --users engineer admin
    .venv/bin/python scripts/ui_check.py --routes /console /approvals

The console has no browser test suite, and the errors the API tests cannot
see live here: a page that throws, a screen that asks the service for what
its reader may not read, a request that fails. This drives headless Chrome
through the DevTools protocol, signs each account in through the ordinary
login endpoint (the page then holds the same cookie and token it would after
the sign-in form), confirms the session took, and opens every page under
frontend/app. A page fails on any uncaught exception, console error, failed
request (HTTP 4xx or 5xx, or a transport failure) or a body with no text.

It needs Chrome or Chromium on the host, and the console and API running.
The report, with a SHA-256 over its results, goes to
storage/reports/ui-check-<UTC time>.json. The exit code is 0 only when every
page is clean.
"""

from __future__ import annotations

import argparse
import asyncio
import hashlib
import json
import shutil
import subprocess
import sys
import tempfile
import time
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
APP_DIR = ROOT / "frontend" / "app"
DEMO_USERS = ("engineer", "reviewer", "head_of_inspection", "plant_manager", "operator", "auditor", "admin")
# Pages anyone may open; every other page is checked only with a session.
PUBLIC_ROUTES = ("/", "/sign-in", "/setup", "/invite", "/reset", "/request-access")
BROWSERS = ("google-chrome", "google-chrome-stable", "chromium", "chromium-browser", "chrome")
SETTLE_SECONDS = 4.0


def discover_routes(app_dir: Path = APP_DIR) -> list[str]:
    """Every page under frontend/app, as a URL path. Route groups are not in the URL."""
    routes: set[str] = set()
    for page in app_dir.rglob("page.tsx"):
        parts = [part for part in page.relative_to(app_dir).parent.parts if not (part.startswith("(") and part.endswith(")"))]
        if any(part.startswith("[") for part in parts):
            continue  # A dynamic segment needs a real value; none is guessed.
        routes.add("/" + "/".join(parts))
    return sorted(routes)


def classify(event: dict[str, Any]) -> tuple[str, str] | None:
    """A DevTools event as (kind, detail) if it is a problem, else None."""
    method, params = event.get("method"), event.get("params") or {}
    if method == "Runtime.exceptionThrown":
        details = params.get("exceptionDetails") or {}
        exception = details.get("exception") or {}
        return "exception", str(exception.get("description") or details.get("text") or "uncaught exception")[:400]
    if method == "Runtime.consoleAPICalled" and params.get("type") in ("error", "assert"):
        text = " ".join(str(arg.get("value", arg.get("description", ""))) for arg in params.get("args") or [])
        return "console", text[:400]
    if method == "Network.responseReceived":
        response = params.get("response") or {}
        status = int(response.get("status") or 0)
        if status >= 400:
            return "http", f"{status} {response.get('url', '')}"[:400]
    if method == "Log.entryAdded":
        entry = params.get("entry") or {}
        # A failed request is logged again here with source "network"; the
        # response above already counts it. Anything else (a CSP violation,
        # a deprecation turned error) is its own finding.
        if entry.get("level") == "error" and entry.get("source") != "network":
            return "log", f"{entry.get('source', '')}: {entry.get('text', '')} {entry.get('url', '')}".strip()[:400]
    if method == "Network.loadingFailed" and not params.get("canceled"):
        return "network", f"{params.get('errorText', 'failed')} {params.get('type', '')}".strip()[:400]
    return None


def _browser(explicit: str | None) -> str:
    for name in ([explicit] if explicit else BROWSERS):
        found = shutil.which(name) if name else None
        if found:
            return found
    raise SystemExit("No Chrome or Chromium found; pass --chrome /path/to/chrome")


class Page:
    """One DevTools page session: commands, and the events since the last clear."""

    def __init__(self, ws: Any) -> None:
        self.ws, self.events, self._next, self._pending = ws, [], 0, {}

    async def pump(self) -> None:
        while True:
            message = json.loads(await self.ws.recv())
            waiter = self._pending.pop(message.get("id"), None)
            if waiter is not None:
                waiter.set_result(message)
            else:
                self.events.append(message)

    async def call(self, method: str, **params: Any) -> dict[str, Any]:
        self._next += 1
        waiter = asyncio.get_running_loop().create_future()
        self._pending[self._next] = waiter
        await self.ws.send(json.dumps({"id": self._next, "method": method, "params": params}))
        return (await waiter).get("result") or {}

    async def evaluate(self, expression: str) -> Any:
        result = await self.call("Runtime.evaluate", expression=expression, awaitPromise=True, returnByValue=True)
        return (result.get("result") or {}).get("value")


async def _check(base: str, users: list[str], password: str, routes: list[str], chrome: str,
                 settle: float) -> list[dict[str, Any]]:
    import websockets  # installed with uvicorn[standard]

    port = 9200 + int(time.time()) % 700
    profile = tempfile.mkdtemp(prefix="aegis-ui-check-")
    process = subprocess.Popen(
        [chrome, "--headless=new", "--no-sandbox", "--disable-gpu", "--window-size=1440,900",
         f"--remote-debugging-port={port}", f"--user-data-dir={profile}", "about:blank"],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    )
    results: list[dict[str, Any]] = []
    try:
        for _ in range(100):
            try:
                targets = json.load(urllib.request.urlopen(f"http://127.0.0.1:{port}/json", timeout=2))
                break
            except OSError:
                time.sleep(0.1)
        else:
            raise SystemExit("Chrome did not open its DevTools port")
        url = next(t for t in targets if t.get("type") == "page")["webSocketDebuggerUrl"]
        async with websockets.connect(url, max_size=100_000_000) as ws:
            page = Page(ws)
            pump = asyncio.create_task(page.pump())
            for domain in ("Page", "Runtime", "Network", "Log"):
                await page.call(f"{domain}.enable")
            for user in ["anonymous", *users]:
                await page.call("Network.clearBrowserCookies")
                await page.call("Page.navigate", url=f"{base}/sign-in")
                await asyncio.sleep(settle)
                await page.evaluate("try { localStorage.clear(); sessionStorage.clear() } catch (e) {}")
                wanted = list(routes)
                if user == "anonymous":
                    wanted = [route for route in routes if route in PUBLIC_ROUTES]
                else:
                    status = await page.evaluate(f"""(async () => {{
                      const r = await fetch('/api/auth/login', {{method: 'POST',
                        headers: {{'Content-Type': 'application/json'}},
                        body: JSON.stringify({{username: {json.dumps(user)}, password: {json.dumps(password)}}})}});
                      const body = await r.json().catch(() => ({{}}));
                      if (body.token) {{ localStorage.setItem('workbench_session_token', body.token);
                                         sessionStorage.setItem('workbench_session_token', body.token); }}
                      return r.status;
                    }})()""")
                    await page.call("Page.navigate", url=f"{base}/console")
                    await asyncio.sleep(settle)
                    title = str(await page.evaluate("document.title") or "")
                    if status != 200 or title.lower().startswith("sign in"):
                        results.append({"user": user, "route": "(sign-in)", "problems": [
                            ["session", f"could not sign in as {user}: HTTP {status}, landed on '{title}'"]]})
                        continue
                for route in wanted:
                    page.events.clear()
                    await page.call("Page.navigate", url=f"{base}{route}")
                    await asyncio.sleep(settle)
                    problems = [list(found) for found in map(classify, list(page.events)) if found]
                    text = str(await page.evaluate("(document.body && document.body.innerText) || ''") or "")
                    if len(text.strip()) < 20:
                        problems.append(["blank", "the page rendered no text"])
                    title = str(await page.evaluate("document.title") or "")
                    results.append({"user": user, "route": route, "title": title, "problems": problems})
            pump.cancel()
    finally:
        process.terminate()
        shutil.rmtree(profile, ignore_errors=True)
    return results


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--base-url", default="http://127.0.0.1:3000", help="the console, not the API")
    parser.add_argument("--users", nargs="*", default=None, help="accounts to sign in as (default: every demo account)")
    parser.add_argument("--password", default=None, help="their password (default: security.seed_user_password)")
    parser.add_argument("--routes", nargs="*", default=None, help="pages to open (default: every page under frontend/app)")
    parser.add_argument("--chrome", default=None, help="path to Chrome or Chromium")
    parser.add_argument("--settle", type=float, default=SETTLE_SECONDS, help="seconds to let each page load")
    args = parser.parse_args()

    sys.path.insert(0, str(ROOT))
    from backend.core.config import get_config

    password = args.password or str(get_config().settings.security.get("seed_user_password") or "")
    routes = args.routes or discover_routes()
    users = args.users if args.users is not None else list(DEMO_USERS)
    started = datetime.now(timezone.utc)
    results = asyncio.run(_check(args.base_url.rstrip("/"), users, password, routes, _browser(args.chrome), args.settle))

    failing = [result for result in results if result["problems"]]
    for result in results:
        mark = "✗" if result["problems"] else "✓"
        print(f"  {mark} {result['user']:<20} {result['route']}")
        for kind, detail in result["problems"][:6]:
            print(f"      {kind:<9} {detail}")
    body = {"suite": "AEGIS console check", "base_url": args.base_url, "started_at": started.isoformat(),
            "pages": len(results), "failing": len(failing), "results": results}
    digest = hashlib.sha256(json.dumps(body["results"], sort_keys=True).encode("utf-8")).hexdigest()
    out = ROOT / "storage" / "reports" / f"ui-check-{started.strftime('%Y%m%dT%H%M%SZ')}.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps({**body, "sha256": digest}, indent=2), encoding="utf-8")
    print(f"\n  {len(results) - len(failing)} of {len(results)} pages clean")
    print(f"  report  {out.relative_to(ROOT)}\n  sha256  {digest}")
    return 0 if not failing else 1


if __name__ == "__main__":
    raise SystemExit(main())
