"""Pull one runnable Python script out of a model reply.

A small local model is asked for "only the code inside one ```python block"
and mostly complies, but not always in the same way: the tag is ``Python`` or
``python3``, the closing fence is lost to the token limit, a ``bash`` block
comes first, or the code arrives bare with a sentence in front of it. Running
the raw reply in each of those cases fails on a syntax error the model never
wrote, and costs a sandbox round trip to find out.

``extract_python`` treats the reply as candidates and keeps the first that
actually parses, so what reaches the sandbox is always a script the compiler
accepts. When nothing parses it says why, in words that can go straight back
to the model as retry feedback.
"""

from __future__ import annotations

import ast
import re
from dataclasses import dataclass

# An opening fence with any info string, then the body up to a closing fence
# or the end of the reply (a truncated answer loses its closing fence).
_FENCE = re.compile(r"```[ \t]*([^\n`]*)\n(.*?)(?:```|\Z)", re.DOTALL)
_PYTHON_TAGS = {"python", "python3", "py", "py3"}
# Tags that are certainly not a Python script, so their blocks are never run.
_OTHER_TAGS = {
    "bash", "sh", "shell", "console", "zsh", "powershell", "ps1", "cmd", "bat",
    "text", "txt", "output", "json", "yaml", "yml", "toml", "ini", "csv",
    "sql", "markdown", "md", "html", "xml", "javascript", "js", "typescript", "ts",
}
_MAX_TRIM_LINES = 12


@dataclass(frozen=True)
class Extraction:
    code: str | None
    # How the code was found: "fenced", "bare", "trimmed"; or "none".
    method: str
    # Why nothing runnable was found. Empty when ``code`` is set.
    problem: str = ""


def _parses(source: str) -> str | None:
    """None when ``source`` compiles, else the syntax error in one line."""
    try:
        ast.parse(source)
    except SyntaxError as exc:
        return f"line {exc.lineno}: {exc.msg}"
    except (ValueError, RecursionError) as exc:
        return str(exc)
    return None


def _looks_like_code(body: str) -> bool:
    # A lone word or number parses as an expression; a script calls or binds.
    return bool(body) and any(ch in body for ch in "=(")


def _trimmed(text: str) -> str | None:
    """Drop a few lines of prose from either end until the rest parses."""
    lines = text.strip().splitlines()
    for head in range(min(_MAX_TRIM_LINES, len(lines)) + 1):
        for tail in range(min(_MAX_TRIM_LINES, len(lines) - head) + 1):
            body = "\n".join(lines[head : len(lines) - tail]).strip()
            if _looks_like_code(body) and _parses(body) is None:
                return body
    return None


def extract_python(text: str) -> Extraction:
    reply = (text or "").strip()
    if not reply:
        return Extraction(None, "none", "The reply was empty.")

    blocks = [
        (tag.strip().split()[0].lower() if tag.strip() else "", body.strip())
        for tag, body in _FENCE.findall(reply)
    ]
    if blocks:
        tagged = [body for tag, body in blocks if tag in _PYTHON_TAGS and body]
        untagged = [
            body for tag, body in blocks if tag not in _PYTHON_TAGS | _OTHER_TAGS and body
        ]
        candidates = tagged + untagged
        # The longest block that parses: a model that splits a script shows
        # a short usage example next to it, never the other way around.
        runnable = [body for body in candidates if _parses(body) is None]
        if runnable:
            return Extraction(max(runnable, key=len), "fenced")
        if candidates:
            error = _parses(max(candidates, key=len))
            return Extraction(
                None,
                "none",
                f"The fenced Python block does not parse ({error}). "
                "It may have been cut off; return the complete script.",
            )
        return Extraction(
            None,
            "none",
            "The reply had no ```python block, only blocks in other languages.",
        )

    if _looks_like_code(reply) and _parses(reply) is None:
        return Extraction(reply, "bare")
    trimmed = _trimmed(reply)
    if trimmed is not None:
        return Extraction(trimmed, "trimmed")
    return Extraction(
        None,
        "none",
        f"The reply contains no ```python block and is not valid Python ({_parses(reply)}).",
    )
