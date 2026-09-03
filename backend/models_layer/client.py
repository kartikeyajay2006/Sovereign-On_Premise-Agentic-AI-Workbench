"""Local inference client.

Talks to the on-premise inference server (Ollama by default) over loopback
only. The base URL comes from ``config/app.yaml``; a non-loopback URL is
refused at construction time, because a "sovereign" workbench that can be
pointed at a remote endpoint by configuration is not sovereign.
"""

from __future__ import annotations

import base64
import io
import ipaddress
import json
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, AsyncIterator
from urllib.parse import urlparse

import httpx

from backend.core.config import get_config


class InferenceError(RuntimeError):
    """Raised when local inference fails or is unavailable."""


class NonLocalEndpointError(RuntimeError):
    """Raised when the configured inference endpoint is not loopback."""


def _assert_loopback(base_url: str) -> None:
    parsed = urlparse(base_url)
    host = parsed.hostname or ""
    if host in {"localhost"}:
        return
    try:
        address = ipaddress.ip_address(host)
    except ValueError as exc:
        raise NonLocalEndpointError(
            f"Inference endpoint host '{host}' is not a loopback address. "
            "This platform only performs local inference."
        ) from exc
    if not address.is_loopback:
        raise NonLocalEndpointError(
            f"Inference endpoint {base_url} is not loopback. Refusing to start: "
            "sovereignty requires on-host inference."
        )


@dataclass
class GenerationResult:
    text: str
    model: str
    latency_ms: int
    prompt_eval_count: int | None = None
    eval_count: int | None = None
    raw: dict[str, Any] = field(default_factory=dict)

    @property
    def tokens_per_second(self) -> float | None:
        if not self.eval_count or not self.latency_ms:
            return None
        return round(self.eval_count / (self.latency_ms / 1000.0), 2)


class OllamaClient:
    """Async client for the local Ollama runtime."""

    def __init__(self) -> None:
        settings = get_config().settings
        inference = settings.inference
        self.base_url = str(inference.get("base_url", "http://127.0.0.1:11434")).rstrip("/")
        _assert_loopback(self.base_url)
        self.timeout = httpx.Timeout(
            float(inference.get("request_timeout_seconds", 600)),
            connect=float(inference.get("connect_timeout_seconds", 10)),
        )
        self.keep_alive = str(inference.get("keep_alive", "30m"))
        self.max_image_edge = int(inference.get("max_image_edge_px", 1400))

    async def _client(self) -> httpx.AsyncClient:
        return httpx.AsyncClient(base_url=self.base_url, timeout=self.timeout)

    def _encode_image(self, path: Path) -> str:
        """Base64-encode an image, downscaling oversized scans first.

        A full-resolution scan costs far more image tokens than it contributes
        legibility, and on a CPU host those tokens are the dominant cost. The
        long edge is capped at ``inference.max_image_edge_px``.
        """
        try:
            from PIL import Image

            with Image.open(path) as image:
                longest = max(image.size)
                if longest <= self.max_image_edge:
                    return base64.b64encode(path.read_bytes()).decode("ascii")

                ratio = self.max_image_edge / longest
                resized = image.convert("RGB").resize(
                    (max(1, int(image.width * ratio)), max(1, int(image.height * ratio))),
                    Image.LANCZOS,
                )
                buffer = io.BytesIO()
                resized.save(buffer, format="PNG", optimize=True)
                return base64.b64encode(buffer.getvalue()).decode("ascii")
        except Exception:
            # Never fail a task over a resize; send the original.
            return base64.b64encode(path.read_bytes()).decode("ascii")

    # -- discovery ---------------------------------------------------------
    async def list_models(self) -> list[dict[str, Any]]:
        """Return the models actually installed on this host."""
        try:
            async with await self._client() as client:
                response = await client.get("/api/tags")
                response.raise_for_status()
                return response.json().get("models", [])
        except httpx.HTTPError as exc:
            raise InferenceError(f"Local inference server unreachable: {exc}") from exc

    async def is_reachable(self) -> bool:
        try:
            await self.list_models()
            return True
        except InferenceError:
            return False

    # -- generation --------------------------------------------------------
    async def generate(
        self,
        *,
        model: str,
        prompt: str,
        system: str | None = None,
        images: list[Path] | None = None,
        options: dict[str, Any] | None = None,
        format_json: bool = False,
        serving: dict[str, Any] | None = None,
    ) -> GenerationResult:
        payload: dict[str, Any] = {
            "model": model,
            "prompt": prompt,
            "stream": False,
            "keep_alive": self.keep_alive,
            "options": options or {},
            **(serving or {}),
        }
        if system:
            payload["system"] = system
        if format_json:
            payload["format"] = "json"
        if images:
            payload["images"] = [self._encode_image(path) for path in images]

        started = time.perf_counter()
        try:
            async with await self._client() as client:
                response = await client.post("/api/generate", json=payload)
                if response.status_code >= 400:
                    # Surface the runtime's own explanation; a bare status code
                    # is not diagnosable on an air-gapped host.
                    raise InferenceError(
                        f"Inference failed for model '{model}' "
                        f"(HTTP {response.status_code}): {response.text[:400]}"
                    )
                body = response.json()
        except httpx.HTTPError as exc:
            raise InferenceError(f"Inference failed for model '{model}': {exc}") from exc

        latency_ms = int((time.perf_counter() - started) * 1000)
        return GenerationResult(
            text=str(body.get("response", "")).strip(),
            model=model,
            latency_ms=latency_ms,
            prompt_eval_count=body.get("prompt_eval_count"),
            eval_count=body.get("eval_count"),
            raw=body,
        )

    async def stream(
        self,
        *,
        model: str,
        prompt: str,
        system: str | None = None,
        images: list[Path] | None = None,
        options: dict[str, Any] | None = None,
    ) -> AsyncIterator[str]:
        """Yield response fragments as the local model produces them."""
        payload: dict[str, Any] = {
            "model": model,
            "prompt": prompt,
            "stream": True,
            "keep_alive": self.keep_alive,
            "options": options or {},
        }
        if system:
            payload["system"] = system
        if images:
            payload["images"] = [self._encode_image(path) for path in images]
        try:
            async with await self._client() as client:
                async with client.stream("POST", "/api/generate", json=payload) as response:
                    response.raise_for_status()
                    async for line in response.aiter_lines():
                        if not line.strip():
                            continue
                        try:
                            chunk = json.loads(line)
                        except json.JSONDecodeError:
                            continue
                        fragment = chunk.get("response")
                        if fragment:
                            yield fragment
                        if chunk.get("done"):
                            return
        except httpx.HTTPError as exc:
            raise InferenceError(f"Streaming failed for model '{model}': {exc}") from exc

    # -- embeddings --------------------------------------------------------
    async def embed(self, *, model: str, texts: list[str]) -> list[list[float]]:
        if not texts:
            return []
        try:
            async with await self._client() as client:
                response = await client.post(
                    "/api/embed",
                    json={"model": model, "input": texts, "keep_alive": self.keep_alive},
                )
                response.raise_for_status()
                body = response.json()
        except httpx.HTTPError as exc:
            raise InferenceError(f"Embedding failed for model '{model}': {exc}") from exc

        embeddings = body.get("embeddings")
        if not embeddings:
            single = body.get("embedding")
            embeddings = [single] if single else []
        if len(embeddings) != len(texts):
            raise InferenceError(
                f"Embedding count mismatch: expected {len(texts)}, got {len(embeddings)}"
            )
        return [[float(value) for value in vector] for vector in embeddings]


_client: OllamaClient | None = None


def get_inference_client() -> OllamaClient:
    global _client
    if _client is None:
        _client = OllamaClient()
    return _client
