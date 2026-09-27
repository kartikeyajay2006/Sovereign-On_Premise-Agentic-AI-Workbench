#!/usr/bin/env python3
"""Capture the README's screenshots from the running console, in both themes.

    .venv/bin/python scripts/capture_screens.py                 # every shot, dark and light
    .venv/bin/python scripts/capture_screens.py --only thread-answer proof
    .venv/bin/python scripts/capture_screens.py --themes dark

Every image in the README is taken from the running workbench by this
script, so a screenshot can always be retaken after the interface changes,
and none is drawn by hand. Each shot signs in as the account a person would
use for that screen, opens the page, performs the clicks a person would (ask
the drawing, run the self-test, verify the chain), waits, and saves a WebP to
docs/assets/readme/<name>-<theme>.webp.

The runs it shows are found, not named: the engineer's latest run for each
golden demo, recognised by the files it attached (the scanned V-2104 report,
the survey and the field sheet, the PSV-2104A record) or by its /clause
prompt, and the latest finished harness run. Create them first (the starter
cards, or scripts/golden_demo.py); a shot whose run does not exist is
skipped and named.
"""

from __future__ import annotations

import argparse
import asyncio
import base64
import json
import shutil
import subprocess
import sys
import tempfile
import time
import urllib.request
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / "docs" / "assets" / "readme"


@dataclass
class Shot:
    name: str
    path: str
    user: str | None = "engineer"
    width: int = 1440
    height: int = 900
    # ("click", visible text) | ("wait", seconds) | ("js", expression)
    # | ("scroll", visible text) | ("scroll", (visible text, pixels above it to keep in view))
    actions: list[tuple[str, Any]] = field(default_factory=list)
    needs: tuple[str, ...] = ()
    settle: float = 5.0


SHOTS = [
    Shot("landing", "/", user=None, height=1000),
    Shot("sign-in", "/sign-in", user=None),
    Shot("thread-answer", "/console?run={clause}", needs=("clause",)),
    Shot("thread-integrity", "/console?run={asset}", height=1400, needs=("asset",),
         actions=[("scroll", ("Integrity decision", 90))]),
    Shot("thread-conflict", "/console?run={conflict}", height=1100, needs=("conflict",)),
    Shot("thread-relief", "/console?run={relief}", height=1500, needs=("relief",),
         actions=[("scroll", ("The PSV-2104A", 140))]),
    Shot("approvals", "/approvals", user="head_of_inspection", height=1000),
    Shot("proof", "/proof?run={asset}", height=1300, needs=("asset",)),
    Shot("harness-control", "/harnesses?run={harness}", height=1000, needs=("harness",)),
    Shot("drawings", "/registry#drawings", height=1200, actions=[("click", "Ask the drawing"), ("wait", 4)]),
    Shot("assurance", "/security", height=1000, actions=[("click", "Run the self-test"), ("wait", 45)]),
    Shot("sandbox", "/sandbox", height=1000, actions=[("click", "Socket connect"), ("click", "Run"), ("wait", 6)]),
    Shot("audit", "/audit", user="auditor", actions=[("click", "Verify chain"), ("wait", 12)]),
    Shot("measurements", "/measurements", height=1000),
    Shot("skills", "/skills"),
    Shot("knowledge", "/registry", height=1000),
    Shot("people", "/admin/access", user="admin"),
]


def find_runs(api: str, password: str) -> dict[str, str]:
    """The engineer's latest run for each golden demo, and the latest finished harness run."""
    import httpx

    token = httpx.post(f"{api}/api/auth/login", json={"username": "engineer", "password": password}).json()["token"]
    client = httpx.Client(base_url=api, headers={"Authorization": f"Bearer {token}"}, timeout=60)
    runs: dict[str, str] = {}
    for summary in client.get("/api/tasks").json():
        task = client.get(f"/api/tasks/{summary['id']}").json()
        files = {item.get("filename") for item in task.get("files") or []}
        if "PSV-2104A-bench-test-record.md" in files:
            key = "relief"
        elif {"V-2104-thickness-survey.csv", "V-2104-contractor-field-sheet.md"} <= files:
            key = "conflict"
        elif "scanned-inspection-report-V-2104.pdf" in files:
            key = "asset"
        elif task["prompt"].startswith("/clause") and task["status"] == "delivered":
            key = "clause"
        else:
            continue
        runs.setdefault(key, task["id"])  # the list is newest first
    for run in client.get("/api/harness-runs").json():
        if run.get("status") == "finished":
            runs.setdefault("harness", run["id"])
    return runs


def _browser() -> str:
    for name in ("google-chrome", "google-chrome-stable", "chromium", "chromium-browser", "chrome"):
        found = shutil.which(name)
        if found:
            return found
    raise SystemExit("No Chrome or Chromium found")


async def _capture(base: str, password: str, shots: list[Shot], themes: list[str], runs: dict[str, str],
                   out_dir: Path) -> list[str]:
    import websockets

    from scripts.ui_check import Page

    port = 9300 + int(time.time()) % 600
    profile = tempfile.mkdtemp(prefix="aegis-capture-")
    process = subprocess.Popen(
        [_browser(), "--headless=new", "--no-sandbox", "--disable-gpu", "--hide-scrollbars",
         f"--remote-debugging-port={port}", f"--user-data-dir={profile}", "about:blank"],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    )
    written: list[str] = []
    try:
        for _ in range(100):
            try:
                targets = json.load(urllib.request.urlopen(f"http://127.0.0.1:{port}/json", timeout=2))
                break
            except OSError:
                time.sleep(0.1)
        url = next(t for t in targets if t.get("type") == "page")["webSocketDebuggerUrl"]
        async with websockets.connect(url, max_size=200_000_000) as ws:
            page = Page(ws)
            pump = asyncio.create_task(page.pump())
            await page.call("Page.enable")
            await page.call("Runtime.enable")
            signed_in_as: str | None = "?"
            for shot in shots:
                missing = [need for need in shot.needs if need not in runs]
                if missing:
                    print(f"  - {shot.name}: skipped, no {', '.join(missing)} run yet")
                    continue
                path = shot.path.format(**runs)
                for theme in themes:
                    await page.call("Emulation.setDeviceMetricsOverride", width=shot.width, height=shot.height,
                                    deviceScaleFactor=1.5, mobile=False)
                    if shot.user != signed_in_as:
                        await page.call("Network.clearBrowserCookies")
                        await page.call("Page.navigate", url=f"{base}/sign-in")
                        await asyncio.sleep(3)
                        await page.evaluate("try { localStorage.clear(); sessionStorage.clear() } catch (e) {}")
                        if shot.user:
                            await page.evaluate(f"""(async () => {{
                              const r = await fetch('/api/auth/login', {{method: 'POST',
                                headers: {{'Content-Type': 'application/json'}},
                                body: JSON.stringify({{username: {json.dumps(shot.user)}, password: {json.dumps(password)}}})}});
                              const body = await r.json();
                              localStorage.setItem('workbench_session_token', body.token);
                              sessionStorage.setItem('workbench_session_token', body.token);
                            }})()""")
                        signed_in_as = shot.user
                    await page.evaluate(f"localStorage.setItem('aegis-theme', {json.dumps(theme)})")
                    await page.call("Page.navigate", url=f"{base}{path}")
                    await asyncio.sleep(shot.settle)
                    for action, value in shot.actions:
                        if action == "wait":
                            await asyncio.sleep(float(value))
                        elif action in ("click", "scroll"):
                            text, above = (value, 0) if isinstance(value, str) else value
                            found = await page.evaluate(f"""(() => {{
                              const want = {json.dumps(text)};
                              // An exact match first: "Run" must not find "Runs to completion".
                              const seen = [...document.querySelectorAll('button, a, [role=tab], h2, h3, span, p')]
                                .filter(e => e.offsetParent !== null);
                              const el = seen.find(e => e.textContent.trim() === want)
                                || seen.find(e => e.textContent.trim().startsWith(want));
                              if (!el) return false;
                              if ({json.dumps(action)} === 'click') {{ el.click(); return true; }}
                              el.scrollIntoView({{block: 'start'}});
                              // Keep some of what is above it in view: the thread scrolls
                              // inside its own container, not the window.
                              let box = el.parentElement;
                              while (box && !(box.scrollHeight > box.clientHeight
                                     && /auto|scroll/.test(getComputedStyle(box).overflowY))) box = box.parentElement;
                              (box || document.scrollingElement).scrollTop -= {int(above)};
                              return true;
                            }})()""")
                            if not found:
                                print(f"  ! {shot.name}: '{text}' not found on the page")
                            await asyncio.sleep(1.5)
                        elif action == "js":
                            await page.evaluate(str(value))
                    image = await page.call("Page.captureScreenshot", format="webp", quality=86)
                    target = out_dir / f"{shot.name}-{theme}.webp"
                    target.write_bytes(base64.b64decode(image["data"]))
                    written.append(str(target.relative_to(ROOT)))
                    print(f"  ✓ {target.relative_to(ROOT)}")
            pump.cancel()
    finally:
        process.terminate()
        shutil.rmtree(profile, ignore_errors=True)
    return written


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--base-url", default="http://127.0.0.1:3000", help="the console")
    parser.add_argument("--api", default="http://127.0.0.1:8000", help="the API, to find the runs")
    parser.add_argument("--password", default=None, help="demo account password (default: from config)")
    parser.add_argument("--only", nargs="*", default=None, help="shot names to take")
    parser.add_argument("--themes", nargs="*", default=["dark", "light"])
    parser.add_argument("--out", type=Path, default=OUT_DIR)
    args = parser.parse_args()

    sys.path.insert(0, str(ROOT))
    from backend.core.config import get_config

    password = args.password or str(get_config().settings.security.get("seed_user_password") or "")
    shots = [shot for shot in SHOTS if not args.only or shot.name in args.only]
    runs = find_runs(args.api.rstrip("/"), password)
    print("  runs:", ", ".join(f"{key} {value[:8]}" for key, value in sorted(runs.items())) or "none")
    args.out.mkdir(parents=True, exist_ok=True)
    written = asyncio.run(_capture(args.base_url.rstrip("/"), password, shots, args.themes, runs, args.out))
    print(f"\n  {len(written)} image(s) written to {args.out.relative_to(ROOT) if args.out.is_relative_to(ROOT) else args.out}")
    return 0 if written else 1


if __name__ == "__main__":
    raise SystemExit(main())
