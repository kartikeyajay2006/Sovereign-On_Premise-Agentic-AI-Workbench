# 9.8 · Red team

> Each result is a measurement, never a green assertion.

`scripts/red_team.py` attacks a running installation over HTTP with the seeded accounts and writes down what happened. The same attacks run in-process in the test suite (`tests/adversarial/test_red_team.py`), so a change that opens a gap fails CI before anyone runs the script.

## Run it

```bash
.venv/bin/python scripts/red_team.py                     # http://127.0.0.1:8000
.venv/bin/python scripts/red_team.py --base-url http://host:8000
```

Run it on the host: the audit attacks edit **copies** of the local audit log and never touch the log itself. The exit code is 0 only when every attack held.

```
  ✓ UPLOAD-01       PDF that runs JavaScript on open                                   held
  …
  ✓ AUDIT-02        Rewrite a past event and recompute every later chain hash (on a copy) held

  31 of 31 held · 0 breached · 0 inconclusive
  report  storage/reports/red-team-20260925T055939Z.json
  sha256  19f42b94b4ec7c065b282aab6272e9cf1bd4d34c4f13ec02aef21f7bcfd8c3a3
```

## Verdicts

| Verdict | Meaning |
|---|---|
| **held** | What was observed is the refusal: the status code, the sandbox's output, the broken chain |
| **BREACHED** | What was observed is not the refusal |
| **inconclusive** | The attack could not be carried out at all (the sandbox disabled on this host, no audit log to copy). Never counted as held |

## The attacks

| ID | Attack | Held when |
|---|---|---|
| UPLOAD-01…12 | JavaScript PDF; hex-escaped JavaScript; JavaScript in a compressed object stream; launch action; executable attachment; VBA macro; remote template; DDE field; 40 MB archive bomb; ZIP renamed `.pdf`; ELF renamed `.csv`; 10-billion-pixel PNG | `POST /api/files` answers 400 |
| UPLOAD-CONTROL | An ordinary PDF | Answers 201: the guard refuses what files carry, not everything |
| INJECT-01 | A note telling the model to ignore its instructions, skip review and send data out | Stored, and flagged as instruction-like at quarantine |
| SANDBOX-01, 02 | Generated code reads `/etc/passwd`; finds and reads the workbench database | Nothing is printed; the report names the layer that stopped it |
| EGRESS-01…04 | Socket, DNS, HTTP and `curl` through an obfuscated import | Nothing is reached |
| SANDBOX-RUNTIME | The sandbox's adversarial self-test with static validation disabled: sockets and `_socket`, process escape, writes outside the workspace, memory and CPU bombs | Every containment check holds |
| RETRIEVE-01 | An operator asks for the Restricted design memo and names other departments | Nothing above Confidential; departments narrowed to the operator's |
| PRIV-01…04 | Auditor runs a calculation; operator approves; engineer resolves a conflict; no session reads tasks | 401 or 403 |
| PRIV-05 | A session token with one character changed | 401 |
| AUTH-01 | Seven guesses at one account | 429 from the sixth |
| AUTH-02 | The unauthenticated directory | Only the seeded demonstration accounts |
| AUDIT-01 | Edit one past event's actor (on a copy) | The chain breaks at that event; the real chain stays valid |
| AUDIT-02 | Edit a past event **and recompute every later chain hash** (on a copy) | The chain verifies, and the signed root still exposes the rewrite ([9.9](09-proof.md)) |

The egress and file-read results record `stopped_by`: `static validation` (rejected before running) or `runtime containment` (ran, and was refused). The obfuscated imports are stopped statically, which leaves the runtime layer untested by them; SANDBOX-RUNTIME exists to attack that layer directly.

## The report

`storage/reports/red-team-<UTC time>.json` holds the host, start and finish times, a summary, and for every attack its id, category, description, expectation, verdict, the full observation and its duration. `results_sha256` is a SHA-256 over the canonical JSON of the results, so a report quoted later can be matched to the file. Reports are git-ignored: they describe one host.

<!-- nav:start -->

---

| | | |
|:--|:--:|--:|
| [← 9.7 · Ingestion guard](07-ingestion-guard.md) | [↑ 09 · Security and governance](README.md) | [9.9 · Signed proof →](09-proof.md) |

<!-- nav:end -->
