# 12.1 · Running the services

## `scripts/run.sh`

| Command | Does |
|---|---|
| `./scripts/run.sh` | Stops anything running, builds the console, starts the API and the console, waits for both |
| `./scripts/run.sh --dev` | The same, but the console runs in development mode (hot reload, no build) |
| `./scripts/run.sh --status` | Reports whether the API, the console and Ollama answer |
| `./scripts/run.sh --stop` | Stops both, by port and by process name |

The script's order of work, and why it stops strays by name as well as by port, are explained in [1.6](../01-getting-started/06-seed-and-run.md#run-it).

Both services are started with `setsid nohup`, so they survive the terminal closing. Their output goes to `storage/logs/api.log` and `storage/logs/web.log`; the build's to `storage/logs/build.log`.

## Bind the console to loopback

`run.sh` starts the console with `npm run start`, which is `next start`, and that listens on **every** interface. Because the console proxies `/api/*` to the API, the API is then reachable from the network through port 3000.

For anything but a single-user demo machine, edit the start line in `scripts/run.sh`:

```bash
(cd frontend && setsid nohup npx next start -H 127.0.0.1 -p "$WEB_PORT" >"$WEB_LOG" 2>&1 </dev/null &)
```

or firewall port 3000. If people on other machines must reach the console, put it behind a reverse proxy that terminates TLS and authenticates, rather than exposing `next start` directly.

## Running as a systemd service

A minimal pair of units for a Linux host, running as an unprivileged `aegis` user:

```ini
# /etc/systemd/system/aegis-api.service
[Unit]
Description=AEGIS API
After=network.target ollama.service

[Service]
User=aegis
WorkingDirectory=/opt/aegis
Environment=SOVEREIGN_SECURITY__SELF_REGISTRATION_ENABLED=false
ExecStart=/opt/aegis/.venv/bin/python -m uvicorn backend.api.main:app --host 127.0.0.1 --port 8000 --timeout-keep-alive 75
Restart=on-failure

[Install]
WantedBy=multi-user.target
```

```ini
# /etc/systemd/system/aegis-web.service
[Unit]
Description=AEGIS web console
After=aegis-api.service

[Service]
User=aegis
WorkingDirectory=/opt/aegis/frontend
ExecStart=/usr/bin/npx next start -H 127.0.0.1 -p 3000
Restart=on-failure

[Install]
WantedBy=multi-user.target
```

Build the console once as the `aegis` user (`npm run build`) before enabling the web unit, and after every frontend change.

> [!IMPORTANT]
> Run **one** API process. Two processes share one database and one job queue, and a second, stale process will execute tasks with old code. The run script refuses to start while a stray API process exists; with systemd, make sure no manually started API is still running.

## Docker

The `Dockerfile` builds an API image (Python 3.11 slim, with Tesseract) that serves on port 8000 inside the container. `infrastructure/docker-compose.yml` runs Ollama and the API in one network namespace, so inference stays on `127.0.0.1`, on an internal-only network. Its `frontend` service needs a `frontend/Dockerfile` that is not in the repository yet, so run the console on the host for now.

<!-- nav:start -->

---

| | | |
|:--|:--:|--:|
| [← 12 · Operations](README.md) | [↑ 12 · Operations](README.md) | [12.2 · Logs and storage →](02-logs-storage.md) |

<!-- nav:end -->
