"""Content scanning: secrets, personal data and markings, at every boundary.

The upload quarantine (``file_guard.py``) decides what a file *is*; the
instruction screen (``injection.py``) decides which sentences are addressed to
the model. Neither looked at what the text *carries*: a config dump with a
live password, an incident log with an operator's Aadhaar number, a design
memo whose own header says Restricted uploaded as "normal". This module does.

Content is scanned where it crosses from one trust scope to another -- a file
entering the workbench, an evidence excerpt entering a prompt, model output
reaching the user, a document leaving as a deliverable -- and what happens is
read from ``policies/dlp.yaml``, per detector and per boundary: allow, redact,
require approval, or block.

Two rules hold everywhere:

* the value found is never written down. A finding carries its detector, its
  position and a keyed fingerprint (HMAC-SHA256 under a key that stays on
  this host), so a reviewer can tell that two records saw the same value
  without either record revealing it. A plain hash would not do: an Aadhaar
  number or a phone number has so few possibilities that its SHA-256 is
  reversed by enumeration in minutes;
* a detector must be specific enough not to fire on ordinary engineering
  text. Checksums are verified where the identifier has one (Aadhaar's
  Verhoeff digit), structure where it has none (PAN's holder-type letter),
  and the values documentation uses as examples -- AWS's ``AKIA...EXAMPLE``,
  ``user:password@host``, ``admin@example.com``, a key body of ``...`` -- are
  recognised as placeholders and not reported. The whole demonstration
  corpus scans clean apart from its own classification headers, and a test
  holds it so.
"""

from __future__ import annotations

import base64
import binascii
import hashlib
import hmac
import json
import os
import re
import threading
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Callable, Iterable

from backend.core.config import ConfigError, get_config

BOUNDARIES = ("upload", "prompt", "answer", "deliverable")
ACTIONS = ("allow", "redact", "require_approval", "block")
# The stored file is the record of what was received; it is never rewritten,
# and there is no approval queue for a file on its own. Its content is
# redacted or held downstream, wherever its text could leave.
_VALID_ACTIONS = {
    "upload": {"allow", "block"},
    "prompt": set(ACTIONS),
    "answer": set(ACTIONS),
    "deliverable": set(ACTIONS),
}
_STRENGTH = {action: rank for rank, action in enumerate(ACTIONS)}


# ----------------------------------------------------------------- validators
_VERHOEFF_D = (
    (0, 1, 2, 3, 4, 5, 6, 7, 8, 9), (1, 2, 3, 4, 0, 6, 7, 8, 9, 5),
    (2, 3, 4, 0, 1, 7, 8, 9, 5, 6), (3, 4, 0, 1, 2, 8, 9, 5, 6, 7),
    (4, 0, 1, 2, 3, 9, 5, 6, 7, 8), (5, 9, 8, 7, 6, 0, 4, 3, 2, 1),
    (6, 5, 9, 8, 7, 1, 0, 4, 3, 2), (7, 6, 5, 9, 8, 2, 1, 0, 4, 3),
    (8, 7, 6, 5, 9, 3, 2, 1, 0, 4), (9, 8, 7, 6, 5, 4, 3, 2, 1, 0),
)
_VERHOEFF_P = (
    (0, 1, 2, 3, 4, 5, 6, 7, 8, 9), (1, 5, 7, 6, 2, 8, 3, 0, 9, 4),
    (5, 8, 0, 3, 7, 9, 6, 1, 4, 2), (8, 9, 1, 6, 0, 4, 3, 5, 2, 7),
    (9, 4, 5, 3, 1, 2, 6, 8, 7, 0), (4, 2, 8, 6, 5, 7, 3, 9, 0, 1),
    (2, 7, 9, 3, 8, 0, 6, 4, 1, 5), (7, 0, 4, 6, 9, 1, 3, 2, 5, 8),
)


def verhoeff_valid(digits: str) -> bool:
    """The Verhoeff check UIDAI uses for the last digit of an Aadhaar number."""
    check = 0
    for position, digit in enumerate(reversed(digits)):
        check = _VERHOEFF_D[check][_VERHOEFF_P[position % 8][int(digit)]]
    return check == 0


_PLACEHOLDER_WORDS = re.compile(
    r"example|sample|dummy|placeholder|redacted|changeme|change_me|your[_-]|<[^>]*>|\$\{|\{\{|\*{3,}|x{4,}|\.\.\.",
    re.IGNORECASE,
)
_PLACEHOLDER_VALUES = {
    "password", "passwd", "pass", "pwd", "secret", "token", "apikey", "api_key", "none", "null",
    "true", "false", "required", "optional", "hidden", "masked", "unknown", "n/a",
}
# `payload.password`, `os.environ["X"]`, `get_secret()`, `{sha}`, `$(curl`:
# a reference to a value, or an expression producing one, not the value.
_CODE_REFERENCE = re.compile(r"^[A-Za-z_]\w*(?:\.[A-Za-z_]\w*)+$|[()\[\]{}]|^\$")


def _placeholder(value: str) -> bool:
    body = value.strip("\"'`")
    return (
        body.lower() in _PLACEHOLDER_VALUES
        or bool(_PLACEHOLDER_WORDS.search(body))
        or len(set(body.lower())) <= 3
    )


def _classes(value: str) -> int:
    return sum((
        any(c.islower() for c in value), any(c.isupper() for c in value),
        any(c.isdigit() for c in value), any(not c.isalnum() for c in value),
    ))


def _valid_private_key(match: re.Match[str]) -> bool:
    body = match.group("body") or ""
    if "..." in body or _PLACEHOLDER_WORDS.search(body.replace("...", "")):
        return False
    lines = [line for line in body.splitlines() if line.strip() and ":" not in line]
    return len(re.sub(r"[^A-Za-z0-9+/=]", "", "".join(lines))) >= 64


def _valid_token(match: re.Match[str]) -> bool:
    return not _placeholder(match.group("value"))


def _valid_jwt(match: re.Match[str]) -> bool:
    header = match.group("value").split(".", 1)[0]
    try:
        decoded = json.loads(base64.urlsafe_b64decode(header + "=" * (-len(header) % 4)))
    except (binascii.Error, ValueError, UnicodeDecodeError):
        return False
    return isinstance(decoded, dict) and "alg" in decoded


def _valid_assignment(match: re.Match[str]) -> bool:
    value = match.group("value").strip("\"'`")
    if len(value) < 6 or value.isdigit() or _placeholder(value) or _CODE_REFERENCE.search(value):
        return False
    # "password = hunter" in a config file is a credential; "Password:
    # required" in a procedure is a sentence, and "token: SessionToken" is a
    # type annotation. After '=', the way config is written, any literal
    # counts; after ':' it must carry a digit or a symbol.
    if match.group("sep").strip() == "=":
        return True
    return _classes(value) >= 2 and not value.isalpha()


def _valid_connection(match: re.Match[str]) -> bool:
    return not _placeholder(match.group("value"))


def _valid_aadhaar(match: re.Match[str]) -> bool:
    digits = re.sub(r"\D", "", match.group("value"))
    return len(set(digits)) > 1 and verhoeff_valid(digits)


# Numbers published as examples of the format, not anyone's.
_PAN_EXAMPLES = {"AAAPL1234C", "ABCPD1234E", "AAAPZ1234C", "AAACB1234C"}


def _valid_pan(match: re.Match[str]) -> bool:
    value = match.group("value")
    return value not in _PAN_EXAMPLES and len(set(value[:5])) > 1 and value[5:9] != "0000"


_RESERVED_EMAIL_DOMAIN = re.compile(
    r"(?:^|\.)(?:example\.(?:com|org|net)|example|test|invalid|localhost|local)$", re.IGNORECASE
)


def _valid_email(match: re.Match[str]) -> bool:
    local, _, domain = match.group("value").rpartition("@")
    return not _RESERVED_EMAIL_DOMAIN.search(domain) and not _placeholder(local)


_PHONE_EXAMPLES = {"9876543210", "9999999999", "9123456789", "9000000000"}


def _valid_phone(match: re.Match[str]) -> bool:
    digits = re.sub(r"\D", "", match.group("value"))[-10:]
    return digits not in _PHONE_EXAMPLES and len(set(digits)) > 2


# ------------------------------------------------------------------ detectors
@dataclass(frozen=True)
class Detector:
    """One kind of thing to look for. The span reported is group ``value``."""

    id: str
    pattern: re.Pattern[str]
    validate: Callable[[re.Match[str]], bool]


_SECRET_KEY_NAME = (
    r"(?:password|passwd|pwd|passphrase|secret|client[_-]?secret|api[_-]?key|apikey|"
    r"access[_-]?key|secret[_-]?key|private[_-]?key|access[_-]?token|auth[_-]?token|token)"
)

_DETECTORS: tuple[Detector, ...] = (
    Detector("private_key", re.compile(
        r"(?P<value>-----BEGIN (?P<kind>(?:[A-Z0-9]+ )*)PRIVATE KEY(?: BLOCK)?-----(?P<body>[\s\S]*?)"
        r"(?:-----END (?P=kind)PRIVATE KEY(?: BLOCK)?-----|\Z))"), _valid_private_key),
    Detector("aws_access_key", re.compile(
        r"(?<![A-Za-z0-9])(?P<value>(?:AKIA|ASIA|AGPA|AIDA|AROA)[A-Z0-9]{16})(?![A-Za-z0-9])"), _valid_token),
    Detector("github_token", re.compile(
        r"(?<![A-Za-z0-9_])(?P<value>gh[pousr]_[A-Za-z0-9]{36,255}|github_pat_[A-Za-z0-9_]{22,255})"
        r"(?![A-Za-z0-9_])"), _valid_token),
    Detector("slack_token", re.compile(
        r"(?<![A-Za-z0-9])(?P<value>xox[baprs]-[0-9A-Za-z-]{10,})"), _valid_token),
    Detector("jwt", re.compile(
        r"(?<![A-Za-z0-9_-])(?P<value>eyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,})"), _valid_jwt),
    Detector("bearer_token", re.compile(
        r"\bBearer\s+(?P<value>[A-Za-z0-9._~+/-]{20,}=*)"), _valid_token),
    Detector("credential_assignment", re.compile(
        r"(?<![A-Za-z0-9])[A-Za-z0-9_.-]*?" + _SECRET_KEY_NAME
        + r"[\"']?(?P<sep>\s*[:=]\s*)[\"']?(?P<value>[^\s\"',;]+)", re.IGNORECASE), _valid_assignment),
    Detector("connection_string_password", re.compile(
        r"\b[a-z][a-z0-9+.-]{1,15}://[^\s:/@\"']+:(?P<value>[^\s@/\"']+)@[^\s/\"']+", re.IGNORECASE),
        _valid_connection),
    Detector("aadhaar", re.compile(
        r"(?<![\d.])(?P<value>[2-9]\d{3}([ -]?)\d{4}\2\d{4})(?![\d.]?\d)"), _valid_aadhaar),
    Detector("pan", re.compile(
        r"(?<![A-Za-z0-9])(?P<value>[A-Z]{3}[ABCFGHJLPT][A-Z]\d{4}[A-Z])(?![A-Za-z0-9])"), _valid_pan),
    Detector("email", re.compile(
        r"(?<![\w.+-])(?P<value>[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,})\b"),
        _valid_email),
    Detector("phone_in", re.compile(
        r"(?<![\w+.])(?P<value>(?:(?:\+|00)91[ -]?|0)?[6-9]\d{4}[ -]?\d{5})(?![\w.]?\d)"), _valid_phone),
)
DETECTOR_IDS = tuple(d.id for d in _DETECTORS) + ("classification_marker",)


def _marker_pattern(markings: Iterable[str]) -> re.Pattern[str]:
    ordered = sorted(markings, key=len, reverse=True)
    words = "|".join(r"\s+".join(map(re.escape, m.split())) for m in ordered)
    banners = "|".join(r"[ \t]+".join(map(re.escape, m.upper().split())) for m in ordered)
    return re.compile(
        # A labelled marking, any case: "**Classification:** Restricted",
        # "Security classification - SECRET".
        rf"^[ \t>*_#|-]*(?i:(?:security\s+|protective\s+)?(?:classification|marking))[ \t*_]*[:\-][ \t*_]*"
        rf"(?P<value>(?i:{words}))\b"
        # A banner line that is only the marking, in capitals: "RESTRICTED".
        # Case matters here: "restricted" alone on a line is a word, not a mark.
        rf"|^[ \t*_]*(?P<banner>{banners})[ \t*_]*$",
        re.MULTILINE,
    )


# ------------------------------------------------------------------- findings
@dataclass(frozen=True)
class DlpFinding:
    """One value found. It never holds the value itself."""

    detector: str
    category: str
    start: int
    end: int
    fingerprint: str
    action: str
    raises_to: str | None

    def record(self, where: str | None = None) -> dict[str, Any]:
        """What the audit log, a policy event or a note may say about it."""
        entry: dict[str, Any] = {
            "detector": self.detector,
            "category": self.category,
            "action": self.action,
            "fingerprint": self.fingerprint,
            "span": [self.start, self.end],
        }
        if self.raises_to:
            entry["raises_to"] = self.raises_to
        if where:
            entry["where"] = where
        return entry


@dataclass
class DlpScan:
    """What one scan of one text at one boundary found."""

    boundary: str
    findings: list[DlpFinding] = field(default_factory=list)
    truncated: bool = False

    @property
    def action(self) -> str:
        """The strongest action any finding calls for; allow when none."""
        return max((f.action for f in self.findings), key=_STRENGTH.__getitem__, default="allow")

    @property
    def detectors(self) -> list[str]:
        return sorted({f.detector for f in self.findings})

    def acting(self, *actions: str) -> list[DlpFinding]:
        return [f for f in self.findings if f.action in actions]

    @property
    def floor(self) -> str | None:
        """The highest classification any finding imposes, if any."""
        levels = [f.raises_to for f in self.findings if f.raises_to]
        if not levels:
            return None
        return max(levels, key=get_config().classification_rank)

    def beyond(self, level: str) -> "DlpScan":
        """Without markings that assert no more than ``level``.

        A procedure headed "Classification: Confidential", indexed as
        confidential, says what is already known; recording it on every run
        that cites the passage would bury the findings that matter. A marking
        above the level is kept: that is a document filed too low.
        """
        rank = get_config().classification_rank
        kept = [
            f for f in self.findings
            if f.detector != "classification_marker" or (f.raises_to and rank(f.raises_to) > rank(level))
        ]
        return DlpScan(boundary=self.boundary, findings=kept, truncated=self.truncated)

    def summary(self) -> str:
        """A line for a note or a limitation: counts by detector, no values."""
        counts: dict[str, int] = {}
        for finding in self.findings:
            counts[finding.detector] = counts.get(finding.detector, 0) + 1
        return ", ".join(f"{count} {name}" for name, count in sorted(counts.items()))


# --------------------------------------------------------------------- policy
@dataclass(frozen=True)
class _Policy:
    detectors: dict[str, dict[str, Any]]
    markings: dict[str, str]
    max_scan_chars: int
    marker: re.Pattern[str]


_policy_cache: tuple[int, _Policy] | None = None


def policy() -> _Policy:
    """policies/dlp.yaml, validated against the detectors this module has."""
    global _policy_cache
    config = get_config()
    if _policy_cache is not None and _policy_cache[0] == id(config):
        return _policy_cache[1]
    raw = config.dlp
    declared = raw.get("detectors") or {}
    levels = set(config.classification_levels())
    missing = set(DETECTOR_IDS) - set(declared)
    unknown = set(declared) - set(DETECTOR_IDS)
    if missing or unknown:
        raise ConfigError(
            f"policies/dlp.yaml must declare every detector exactly: missing {sorted(missing)}, "
            f"unknown {sorted(unknown)}"
        )
    for name, entry in declared.items():
        actions = entry.get("actions") or {}
        for boundary in BOUNDARIES:
            action = actions.get(boundary)
            if action not in _VALID_ACTIONS[boundary]:
                raise ConfigError(
                    f"policies/dlp.yaml: {name}.actions.{boundary} is {action!r}; "
                    f"at the {boundary} boundary it must be one of {sorted(_VALID_ACTIONS[boundary])}"
                )
        floor = entry.get("raises_to")
        if floor is not None and floor not in levels and not (floor == "marked" and name == "classification_marker"):
            raise ConfigError(f"policies/dlp.yaml: {name}.raises_to {floor!r} is not a classification level")
    markings = {str(k).lower(): str(v) for k, v in (raw.get("classification_markers") or {}).items()}
    if not markings or set(markings.values()) - levels:
        raise ConfigError("policies/dlp.yaml: classification_markers must map markings to known levels")
    loaded = _Policy(declared, markings, int(raw.get("max_scan_chars", 2_000_000)), _marker_pattern(markings))
    _policy_cache = (id(config), loaded)
    return loaded


# ---------------------------------------------------------------- fingerprint
_key_lock = threading.Lock()
_keys: dict[Path, bytes] = {}


def _fingerprint_key() -> bytes:
    """A 32-byte key kept beside the signing key, created on first use."""
    path = get_config().settings.storage_root / "keys" / "dlp-fingerprint.key"
    with _key_lock:
        if path in _keys:
            return _keys[path]
        path.parent.mkdir(parents=True, exist_ok=True)
        try:
            descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        except FileExistsError:
            key = path.read_bytes()
        else:
            key = os.urandom(32)
            with os.fdopen(descriptor, "wb") as handle:
                handle.write(key)
        _keys[path] = key
        return key


def fingerprint(detector: str, value: str) -> str:
    """HMAC-SHA256 of the normalised value; the same value always matches."""
    normalised = re.sub(r"\s+", "", value)
    digest = hmac.new(_fingerprint_key(), f"{detector}:{normalised}".encode(), hashlib.sha256)
    return digest.hexdigest()[:16]


# ----------------------------------------------------------------- scanning
def scan(text: str, boundary: str) -> DlpScan:
    """Every sensitive value in ``text``, with the action ``boundary`` calls for."""
    if boundary not in BOUNDARIES:
        raise ValueError(f"unknown DLP boundary {boundary!r}")
    rules = policy()
    body = text or ""
    truncated = len(body) > rules.max_scan_chars
    body = body[: rules.max_scan_chars]
    findings: list[DlpFinding] = []

    def found(detector: str, start: int, end: int, raises_to: str | None) -> None:
        entry = rules.detectors[detector]
        if entry.get("enabled", True) is False:
            return
        findings.append(DlpFinding(
            detector=detector,
            category=str(entry.get("category", "")),
            start=start,
            end=end,
            fingerprint=fingerprint(detector, body[start:end]),
            action=entry["actions"][boundary],
            raises_to=raises_to,
        ))

    for detector in _DETECTORS:
        floor = rules.detectors[detector.id].get("raises_to")
        for match in detector.pattern.finditer(body):
            if detector.validate(match):
                found(detector.id, match.start("value"), match.end("value"), floor)

    for match in rules.marker.finditer(body):
        group = "value" if match.group("value") else "banner"
        word = re.sub(r"\s+", " ", match.group(group).lower())
        found("classification_marker", match.start(group), match.end(group), rules.markings.get(word))

    findings.sort(key=lambda f: (f.start, f.end))
    return DlpScan(boundary=boundary, findings=findings, truncated=truncated)


def redact(text: str, result: DlpScan, *, actions: tuple[str, ...] = ("redact", "block")) -> str:
    """``text`` with each finding acting as one of ``actions`` replaced by a marker.

    Overlapping findings (a connection string's password is also, to the
    email pattern, a mailbox) are merged into one span, so nothing survives
    between them.
    """
    spans = sorted((f.start, f.end, f) for f in result.findings if f.action in actions)
    if not spans:
        return text
    merged: list[tuple[int, int, DlpFinding]] = []
    for start, end, finding in spans:
        if merged and start < merged[-1][1]:
            last = merged[-1]
            merged[-1] = (last[0], max(last[1], end), last[2])
        else:
            merged.append((start, end, finding))
    parts: list[str] = []
    cursor = 0
    for start, end, finding in merged:
        parts.append(text[cursor:start])
        parts.append(f"[redacted: {finding.detector} #{finding.fingerprint[:8]}]")
        cursor = end
    parts.append(text[cursor:])
    return "".join(parts)


def redact_value(value: Any, boundary: str) -> tuple[Any, list[DlpFinding]]:
    """Scan and redact every string inside a JSON-like structure.

    A deliverable's content is a dict of titles, sections and findings; each
    string is scanned in place and the findings are returned together, each
    positioned within its own string.
    """
    found: list[DlpFinding] = []

    def walk(node: Any) -> Any:
        if isinstance(node, str):
            result = scan(node, boundary)
            found.extend(result.findings)
            return redact(node, result)
        if isinstance(node, dict):
            return {key: walk(item) for key, item in node.items()}
        if isinstance(node, list):
            return [walk(item) for item in node]
        return node

    return walk(value), found


def mask_stream(visible: str, *, final: bool) -> str:
    """What of a partial answer may be shown while the model is still writing.

    Values the answer boundary redacts or blocks are masked in every frame,
    since each frame is the whole text so far. While the stream is open, the
    word still being written is held back -- it may be the first half of a
    token that is not yet recognisable -- and so is a trailing run of digit
    groups, which may be the first eight digits of an Aadhaar number, and
    everything from a private-key header on. Words therefore appear whole,
    and a frame never shows what the next one masks.
    """
    shown = redact(visible, scan(visible, "answer"))
    if final:
        return shown
    opener = shown.find("-----BEGIN ")
    if opener != -1 and "PRIVATE KEY" in shown[opener:opener + 60]:
        shown = shown[:opener]
    tail = re.search(r"(?:\+?\d[\d \-]*|\S+)$", shown)
    return shown[: tail.start()] if tail else shown


def readable_text(path: Path, payload: bytes | None, detected: str) -> str | None:
    """The text a stored file carries, for scanning; None when it has none.

    Text files are decoded from their bytes. Documents are read with the same
    local parsers retrieval uses, so what is scanned is what a model would be
    shown. An image carries no text until the vision model reads it; that
    reading becomes evidence and is scanned at the prompt boundary.
    """
    if detected == "text" and payload is not None:
        return payload.decode("utf-8", errors="replace")
    if detected in {"pdf", "ooxml"}:
        from backend.rag.parsing import ParsingError, parse_document

        try:
            return parse_document(path).full_text
        except (ParsingError, ValueError, OSError, KeyError):
            return None
    return None
