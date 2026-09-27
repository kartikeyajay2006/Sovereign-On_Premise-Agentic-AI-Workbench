"""The console check's own parts: which pages exist, and which events are problems.

The browser run itself needs Chrome and a running console; these pin the two
decisions it rests on, so a page added to frontend/app is checked without
anyone listing it, and an error is never mistaken for noise.
"""

from __future__ import annotations

import importlib.util
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("ui_check", ROOT / "scripts" / "ui_check.py")
ui_check = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ui_check)


def test_every_page_under_frontend_app_is_found_without_its_route_group() -> None:
    routes = ui_check.discover_routes()
    assert {"/", "/console", "/approvals", "/admin/access", "/setup", "/sign-in"} <= set(routes)
    assert not any("(" in route for route in routes)


def test_a_page_added_later_is_found(tmp_path: Path) -> None:
    (tmp_path / "(app)" / "new-screen").mkdir(parents=True)
    (tmp_path / "(app)" / "new-screen" / "page.tsx").write_text("export default function Page() {}")
    (tmp_path / "(app)" / "runs" / "[id]").mkdir(parents=True)
    (tmp_path / "(app)" / "runs" / "[id]" / "page.tsx").write_text("")
    assert ui_check.discover_routes(tmp_path) == ["/new-screen"]


def test_errors_are_problems_and_success_is_not() -> None:
    classify = ui_check.classify
    assert classify({"method": "Runtime.exceptionThrown",
                     "params": {"exceptionDetails": {"exception": {"description": "TypeError: x is undefined"}}}})[0] == "exception"
    assert classify({"method": "Runtime.consoleAPICalled", "params": {"type": "error", "args": [{"value": "boom"}]}}) == ("console", "boom")
    assert classify({"method": "Network.responseReceived", "params": {"response": {"status": 403, "url": "/api/admin/users"}}})[0] == "http"
    assert classify({"method": "Network.responseReceived", "params": {"response": {"status": 200, "url": "/api/x"}}}) is None
    assert classify({"method": "Runtime.consoleAPICalled", "params": {"type": "log", "args": []}}) is None
    assert classify({"method": "Network.loadingFailed", "params": {"canceled": True}}) is None
    # A CSP violation is its own finding; a failed request's echo is not counted twice.
    assert classify({"method": "Log.entryAdded", "params": {"entry": {"level": "error", "source": "security", "text": "CSP"}}})[0] == "log"
    assert classify({"method": "Log.entryAdded", "params": {"entry": {"level": "error", "source": "network", "text": "404"}}}) is None
