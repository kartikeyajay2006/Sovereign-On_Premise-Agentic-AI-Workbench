# 14.2 · Rehearsal and recovery

## The hour before

- [ ] **Power** connected; sleep and screen lock disabled
- [ ] **Memory**: close browsers with many tabs, IDEs, container runtimes. `free -h` shows several GB available and little swap in use
- [ ] **One API process**: `pgrep -af "uvicorn backend.api.main"` shows exactly one
- [ ] **Ollama** answers; `ollama list` shows `qwen2.5:3b`, `qwen2.5vl:3b`, `nomic-embed-text`
- [ ] `./scripts/run.sh --status`: all three ✓
- [ ] `GET /api/health`: `inference_reachable`, `retrieval_mode: hybrid`, `sandbox_ready`, `audit_chain_valid`, `sovereignty_ok` all good
- [ ] **Corpus** seeded: 15 documents, 207 passages
- [ ] **Warm** the model: ask one short question as `engineer`
- [ ] **Pre-run** every scenario you will show, and the scanned-report task; open the latter in a tab
- [ ] **Approvals queue** tidy: reject stale held runs as `reviewer`, with a note
- [ ] **Self-test** run once: 7/7
- [ ] **Golden demo check**: `python scripts/golden_demo.py` ends `FINAL STATUS: READY` (below)
- [ ] `python scripts/audit_tool.py verify`: note the head hash
- [ ] Browser zoom at 100–110 %, the theme you want, notifications off
- [ ] `docs/DEMO.md` and the seed script's correct answers open on a second screen

## The golden demo check

`scripts/golden_demo.py` drives the three judged moments through the API, with the seeded accounts, and passes a check only on what the API returned. Run it about an hour before judging, on the demo host, with the models warm, so a broken moment is found before it is on screen.

```bash
.venv/bin/python scripts/golden_demo.py --plan        # lists every check; calls nothing
.venv/bin/python scripts/golden_demo.py               # http://127.0.0.1:8000
.venv/bin/python scripts/golden_demo.py --no-runs     # only the checks that need no model
.venv/bin/python scripts/golden_demo.py --only attack --base-url http://host:8000
```

| Demo | Check | Passes when |
|---|---|---|
| 1 · Can this asset continue operating? | Formula Engine | `POST /api/engineering/assess` on the V-2104 survey returns a calculated decision equal to `sample_data/expected-answers.json` (Shell course 2 (mid), 0.55 mm/yr, 6.18 years), every figure with a formula and result hash. No model call |
| | P&ID Isolation | `POST /api/pid/PID-2104-01/query` returns isolation branches and actions for V-2104 |
| | Asset Integrity Run | A run over the scanned V-2104 report, asking for the approval note, carries a registry assessment with the expected location, rate, life and severity |
| | Approval Policy | That run is held with named approver roles, and the submitter's own approval is refused |
| | Certificate Verification | Its certificate verifies through `POST /api/proof/verify`, every check passed |
| 2 · The AI refuses to guess | Conflict Detection | A run over the survey CSV and the contractor field sheet (9.4 vs 9.9 mm) is `conflicted`: no rate, life or severity stated, an unresolved conflict naming both sources, and the run held for it |
| | Human Resolution | The reviewer chooses the plant reading; the conflict is resolved by an H evidence item and the registry recomputes 6.18 years |
| 3 · Attack the system | Red team groups | Every attack in `backend/security/red_team.py`, grouped as the plan shows them (Prompt Injection, Host File Read, HTTP Egress, DNS, Raw Socket, Sandbox Runtime, Invalid Upload, Unauthorized Access, Audit Tampering), is refused, and the total is the suite's own count |
| | Audit Chain | `GET /api/audit/chain` is valid |

A check that could not be carried out (a run that did not finish in `--run-timeout`, an attack the host cannot perform, an unreachable API) is **NOT MEASURED**, never PASS, and keeps the status at NOT READY. The exit code is 0 only when READY. The full report, with every observation, goes to `storage/reports/golden-demo-<UTC time>.json`.

What it costs the target: two new model runs (the scanned-report run is the ~6 minute one in [14](README.md)), a resolved conflict on the second, and everything `scripts/red_team.py` does (uploads, one locked-out throwaway account). The conflict run uses the survey CSV rather than the scan, so it needs no vision call; the on-stage version attaches the scan. Never point it at an instance whose task list must stay as it is. It is not run in CI: it needs a live API with models. `tests/test_golden_demo.py` tests its judgement against a fake API, and its model-free checks against the real app in-process.

## If something goes wrong on stage

| What happens | Do this | Say this |
|---|---|---|
| A run is slow | Keep talking through the transcript as it fills; open a pre-run copy if it passes a minute | *"On a laptop CPU with no GPU, this is the honest latency. A GPU changes it substantially."* |
| An answer is wrong | Open its checks and held reason; reject it as `reviewer` with a note | *"This is exactly why the release gate exists: the model is not trusted, and here is the record of it being caught."* |
| A run is **Refused** | Read the reason aloud | *"Policy found no approved model for this data. It refuses rather than guessing."* |
| The console errors | `./scripts/run.sh` restarts both services in about 20 s | |
| Ollama stops | `ollama serve`, then warm with one question | |
| Egress is not zero | Open the violation; it names the process and address | *"It is measured, and it tells us exactly what connected."* |
| Chain verification fails | Do not edit anything. Show the failing sequence number | *"It detected a change. That is the control working."* |

## After

- [ ] Note the audit head hash again, off the host
- [ ] `./scripts/run.sh --stop` if the machine is leaving the room

<!-- nav:start -->

---

| | | |
|:--|:--:|--:|
| [← 14.1 · The golden path](01-golden-path.md) | [↑ 14 · Demo guide](README.md) | [15 · Reference →](../15-reference/README.md) |

<!-- nav:end -->
