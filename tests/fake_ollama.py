"""A fake Ollama for tests that need the runtime's answers, never the runtime.

Installed over ``OllamaClient._client`` and ``ModelManager._http`` with an
httpx MockTransport, the same seam tests/test_usage_telemetry.py fakes, so
the code under test makes its real HTTP calls and a live Ollama on this host
is never reached -- a test must not load or evict a model someone is using.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from typing import Any

import httpx
import pytest

from backend.core.config import get_config

# The digests config/models.yaml pins, so the fake's models verify.
def pinned_digest(model_id: str) -> str | None:
    for declaration in get_config().models.get("models", []):
        if declaration.get("id") == model_id:
            return declaration.get("expected_digest")
    return None


@dataclass
class FakeOllama:
    installed: dict[str, int] = field(default_factory=dict)  # model -> file size
    resident: list[dict[str, Any]] = field(default_factory=list)  # /api/ps entries
    reachable: bool = True
    requests: list[tuple[str, str, dict[str, Any]]] = field(default_factory=list)

    def tags(self) -> dict[str, Any]:
        return {"models": [
            {"name": name, "model": name, "size": size, "digest": pinned_digest(name) or "f" * 64}
            for name, size in self.installed.items()
        ]}

    def handler(self, request: httpx.Request) -> httpx.Response:
        body = json.loads(request.content) if request.content else {}
        self.requests.append((request.method, request.url.path, body))
        if not self.reachable:
            raise httpx.ConnectError("connection refused", request=request)
        if request.url.path == "/api/tags":
            return httpx.Response(200, json=self.tags())
        if request.url.path == "/api/ps":
            return httpx.Response(200, json={"models": self.resident})
        if request.url.path == "/api/generate":
            if body.get("keep_alive") == 0:
                self.resident = [m for m in self.resident if m.get("model") != body.get("model")]
                return httpx.Response(200, json={"model": body.get("model"), "done": True, "done_reason": "unload"})
            return httpx.Response(200, json={"model": body.get("model"), "response": ".", "done": True})
        return httpx.Response(404, json={"error": "not faked"})

    def unloads(self) -> list[str]:
        return [body["model"] for method, path, body in self.requests
                if path == "/api/generate" and body.get("keep_alive") == 0]

    def install(self, monkeypatch: pytest.MonkeyPatch) -> "FakeOllama":
        from backend.models_layer import client as client_module
        from backend.models_layer import manager as manager_module
        from backend.models_layer import registry as registry_module
        from backend.models_layer import router as router_module
        from backend.ops import readiness

        transport = httpx.MockTransport(self.handler)

        async def fake_client(self_: Any) -> httpx.AsyncClient:
            return httpx.AsyncClient(base_url=self_.base_url, transport=transport)

        def fake_http(self_: Any, timeout: float) -> httpx.AsyncClient:
            return httpx.AsyncClient(base_url=self_.base_url, transport=transport)

        monkeypatch.setattr(client_module.OllamaClient, "_client", fake_client)
        monkeypatch.setattr(manager_module.ModelManager, "_http", fake_http)
        # Fresh singletons, so no cached snapshot or residency leaks between tests.
        monkeypatch.setattr(registry_module, "_registry", None)
        monkeypatch.setattr(router_module, "_router", None)
        monkeypatch.setattr(manager_module, "_manager", None)
        monkeypatch.setattr(readiness, "_last", None)
        return self
