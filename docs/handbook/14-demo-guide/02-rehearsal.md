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
- [ ] `python scripts/audit_tool.py verify`: note the head hash
- [ ] Browser zoom at 100–110 %, the theme you want, notifications off
- [ ] `docs/DEMO.md` and the seed script's correct answers open on a second screen

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
