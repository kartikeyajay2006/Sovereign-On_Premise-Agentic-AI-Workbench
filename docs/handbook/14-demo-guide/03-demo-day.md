# 14.3 · Demo day on the 8 GB laptop

The countdown for judging on the demo laptop (tier `laptop-8gb`: 8 GB, CPU only). [14.2](02-rehearsal.md) is the checklist for the hour before; this page is the two days around it, with the commands.

Two numbers set the plan. qwen2.5:3b reads the prompt at about 35 tok/s and writes at about 6.5 tok/s, so a cited answer takes 38–56 s. And once the host swaps, a 70-second call takes 25 minutes. Everything below is about staying in memory and paying each load once, before the judges arrive.

## T−48 h: freeze

- [ ] **Code and prompt freeze.** Any edit to `config/prompts/` changes the vision-cache key and throws away the V-2104 reading the warm-up run stores.
- [ ] **Models pulled and verified**: `qwen2.5:3b`, `qwen2.5vl:3b`, `nomic-embed-text`. Every one should show `verified`:

  ```powershell
  .\scripts\warmup.ps1 --check      # "Registered models" lists each with its integrity
  ```

  Leave `qwen3:8b` unused; it is about three times slower and does not fit beside anything in 8 GB.
- [ ] **Record a backup video** of each of the three golden demos ([14](README.md#the-three-judged-moments)).
- [ ] **Pause Windows Update** (Settings > Windows Update > Pause), so nothing restarts or installs during the slot.

## T−24 h: set up

- [ ] **Ollama's variables**, saved for the user so the tray app and every new shell get them:

  ```powershell
  .\scripts\start-ollama.ps1 -Persist -WhatIf     # show them
  .\scripts\start-ollama.ps1 -Persist             # save them, and start the server
  ```

  `OLLAMA_MAX_LOADED_MODELS=2`, `OLLAMA_NUM_PARALLEL=1`, `OLLAMA_KEEP_ALIVE=24h`, `OLLAMA_HOST=127.0.0.1:11434`.
- [ ] **The API's profile and keep-alive**, as user variables too:

  ```powershell
  [Environment]::SetEnvironmentVariable('SOVEREIGN_PROFILE', 'laptop-8gb', 'User')
  [Environment]::SetEnvironmentVariable('SOVEREIGN_INFERENCE__KEEP_ALIVE', '24h', 'User')
  ```

  The profile already sets `keep_alive: 24h`; the variable keeps it even if the profile is not picked up.
- [ ] **Production frontend build**: `cd frontend; npm run build` (served with `npx next start`, not `npm run dev`, which recompiles pages on first visit).
- [ ] **Change the seed passwords** from `workbench`, and set `security.secret_key` so sessions survive a restart.
- [ ] **Back up** the prepared state: `.\.venv\Scripts\python.exe scripts\backup.py --out D:\aegis-backups` ([12.4](../12-operations/04-backup-restore.md)).

## T−90 min: clear the machine

- [ ] Charger in; power mode **Best performance**; sleep and screen lock off.
- [ ] **Airplane mode on.** Nothing here needs a network, and the containment reading stays clean.
- [ ] Close Docker Desktop and run `wsl --shutdown` (its VM holds memory even when idle); close VS Code, Claude Code, Teams, OneDrive and every browser tab not needed for the demo.
- [ ] **At least 5 GB free** before anything is loaded: Task Manager > Performance > Memory, *Available*.

## T−75 min: start in order

1. **Ollama**, with the variables, in its own window (quit the tray app first; the script refuses to start a second server):

   ```powershell
   .\scripts\start-ollama.ps1
   ```

2. **The API**, and wait for `Qwen2.5 3B loaded and ready`:

   ```powershell
   $env:SOVEREIGN_PROFILE = 'laptop-8gb'
   .\.venv\Scripts\python.exe -m uvicorn backend.api.main:app --host 127.0.0.1 --port 8000 --timeout-keep-alive 75
   ```

   It prints `hardware profile: laptop-8gb` first, and `adopted resident model …` if Ollama still held one.
3. **The console**: `cd frontend; npx next start -H 127.0.0.1`.
4. **Warm up**, and read the table:

   ```powershell
   .\scripts\warmup.ps1
   ```

   At this point expect every row PASS except `vision_cache_warm`, which the next step fills.

## T−60 min: the golden demo check

```powershell
.\.venv\Scripts\python.exe scripts\golden_demo.py
```

10–15 minutes. It drives the three judged moments through the API ([14.2](02-rehearsal.md#the-golden-demo-check)), and its scanned-report run **fills the V-2104 vision cache**, which takes the live scan from 5–6 minutes to about 100 s. It must end `FINAL STATUS: READY`; keep the report it writes to `storage/reports/`.

## T−30 min: confirm

- [ ] `.\scripts\warmup.ps1 --check` ends **READY**, with `vision_cache_warm` PASS. Or, from any browser on the host: `http://127.0.0.1:8000/api/ready` answers `"ready": true`.
- [ ] `ollama ps` shows **only** `qwen2.5:3b` (plus `nomic-embed-text` after a retrieval). If the vision model is still loaded from the golden demo, `.\scripts\warmup.ps1 --evict-others` unloads it.
- [ ] Ask one warm-up question as `engineer`; it should answer in under a minute.
- [ ] `GET /api/health` signed in: every flag good ([14.2](02-rehearsal.md#the-hour-before)).
- [ ] The paging file is not climbing: Task Manager > Performance > Memory, *Committed* steady across a minute.

## Live

1. **Start with the moments that need no model**: P&ID isolation, the red team (`scripts/red_team.py`), certificate verification, conflict resolution on a pre-run run. Seconds each, and nothing can swap.
2. **Then the cached V-2104 scan** (about 100 s). Talk through the transcript as it fills.
3. **If a run passes about 3 minutes**, stop waiting: play the backup video, or open a curated run in Proof Mode.

If a `task.model_memory` warning appears on a run's timeline, the host is short of memory: close something before the next run. If Ollama dies, the formula engine, P&ID, red team and certificate verification still work (`golden_demo.py --no-runs` checks exactly those); restart it with `.\scripts\start-ollama.ps1`, then `.\scripts\warmup.ps1`.

## After

- [ ] `.\.venv\Scripts\python.exe scripts\audit_tool.py verify`, and note the head hash off the host.
- [ ] `.\.venv\Scripts\python.exe scripts\backup.py`, and verify it with `--verify`.

<!-- nav:start -->

---

| | | |
|:--|:--:|--:|
| [← 14.2 · Rehearsal and recovery](02-rehearsal.md) | [↑ 14 · Demo guide](README.md) | [15 · Reference →](../15-reference/README.md) |

<!-- nav:end -->
