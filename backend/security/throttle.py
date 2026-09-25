"""Failed sign-ins slow a guesser down, then stop them for a while.

Nothing limited password attempts: a script could try the seeded accounts'
passwords as fast as the API answered. Now:

* an **account** that fails ``max_failures`` times within the window is
  refused for the lockout period, whoever is asking;
* a **client** address that fails against ``spray_accounts`` different
  accounts within the window -- one password tried across every account --
  is refused for the lockout period, whichever account it names.

A client is not locked for failing on one account. Behind the console's
proxy every browser arrives from 127.0.0.1, so a per-client count would let
five typos by one person lock everyone out. Refusals answer 429 with
Retry-After, and each lockout is audited by the route. A successful sign-in
clears the account's count. State is in memory: a restart clears it, which
on a single on-premise host is the operator's own action.
"""

from __future__ import annotations

import threading
import time
from collections import deque
from typing import Callable


class LoginThrottle:
    def __init__(
        self,
        *,
        max_failures: int = 5,
        spray_accounts: int = 10,
        window_seconds: float = 300.0,
        lockout_seconds: float = 300.0,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        self.max_failures = max_failures
        self.spray_accounts = spray_accounts
        self.window = window_seconds
        self.lockout = lockout_seconds
        self._clock = clock
        self._account_failures: dict[str, deque[float]] = {}
        self._client_failures: dict[str, deque[tuple[float, str]]] = {}
        self._locked_until: dict[str, float] = {}
        self._lock = threading.Lock()

    @staticmethod
    def _account(username: str) -> str:
        return username.strip().lower()

    def locked_for(self, username: str, client: str) -> float:
        """Seconds until this account or client may try again; 0 if it may now."""
        now = self._clock()
        keys = (f"account:{self._account(username)}", f"client:{client}")
        with self._lock:
            return max(
                (until - now for key in keys if (until := self._locked_until.get(key, 0.0)) > now),
                default=0.0,
            )

    def failed(self, username: str, client: str) -> float:
        """Record a failure. Returns the lockout just imposed, or 0."""
        now = self._clock()
        account = self._account(username)
        imposed = 0.0
        with self._lock:
            recent = self._account_failures.setdefault(account, deque())
            recent.append(now)
            while recent and now - recent[0] > self.window:
                recent.popleft()
            if len(recent) >= self.max_failures:
                self._locked_until[f"account:{account}"] = now + self.lockout
                recent.clear()
                imposed = self.lockout

            tried = self._client_failures.setdefault(client, deque())
            tried.append((now, account))
            while tried and now - tried[0][0] > self.window:
                tried.popleft()
            if len({name for _, name in tried}) >= self.spray_accounts:
                self._locked_until[f"client:{client}"] = now + self.lockout
                tried.clear()
                imposed = self.lockout
        return imposed

    def succeeded(self, username: str, client: str) -> None:
        account = self._account(username)
        with self._lock:
            self._account_failures.pop(account, None)
            self._locked_until.pop(f"account:{account}", None)


_throttle: LoginThrottle | None = None


def get_login_throttle() -> LoginThrottle:
    global _throttle
    if _throttle is None:
        from backend.core.config import get_config

        security = get_config().settings.security
        _throttle = LoginThrottle(
            max_failures=int(security.get("login_max_failures", 5)),
            spray_accounts=int(security.get("login_spray_accounts", 10)),
            window_seconds=float(security.get("login_window_seconds", 300)),
            lockout_seconds=float(security.get("login_lockout_seconds", 300)),
        )
    return _throttle


def reset_login_throttle() -> None:
    """Forget every count and lockout (tests; an operator restart does the same)."""
    global _throttle
    _throttle = None
