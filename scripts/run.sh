#!/usr/bin/env bash
#
# Start the Sovereign Workbench: local API + web console.
#
#   ./scripts/run.sh            build the frontend, then start both services
#   ./scripts/run.sh --dev      start the frontend in development mode instead
#   ./scripts/run.sh --stop     stop both services
#   ./scripts/run.sh --status   report what is running
#
# Rebuilding while the web server is running leaves it serving a stale chunk
# manifest — pages then fail with 400s on their own JavaScript. This script
# always stops the server before building, which removes that whole class of
# failure.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

API_PORT="${API_PORT:-8000}"
WEB_PORT="${WEB_PORT:-3000}"
LOG_DIR="${LOG_DIR:-$ROOT/storage/logs}"
API_LOG="$LOG_DIR/api.log"
WEB_LOG="$LOG_DIR/web.log"
VENV="$ROOT/.venv"

GREEN=$'\033[32m'; YELLOW=$'\033[33m'; RED=$'\033[31m'; DIM=$'\033[2m'; RESET=$'\033[0m'
ok()   { echo "  ${GREEN}✓${RESET} $1"; }
warn() { echo "  ${YELLOW}!${RESET} $1"; }
fail() { echo "  ${RED}✗${RESET} $1"; }
step() { echo; echo "▸ $1"; }

port_pid() { ss -lptnH "sport = :$1" 2>/dev/null | grep -oE 'pid=[0-9]+' | head -1 | cut -d= -f2; }

# Stop by port AND by process pattern.
#
# Killing only the listener is not enough: a previous API process that lost the
# port keeps running, keeps its database connection, and keeps pulling jobs off
# the shared queue — so tasks get executed by stale code while the new process
# looks healthy. That is a genuinely confusing failure, so both are cleared.
stop_service() {
  local port="$1" name="$2" pattern="$3" pid stopped=0

  pid="$(port_pid "$port" || true)"
  if [ -n "${pid:-}" ]; then
    kill "$pid" 2>/dev/null || true
    sleep 1
    pid="$(port_pid "$port" || true)"
    [ -n "${pid:-}" ] && kill -9 "$pid" 2>/dev/null || true
    stopped=1
  fi

  if [ -n "$pattern" ]; then
    local strays
    strays="$(pgrep -f "$pattern" 2>/dev/null | grep -v "^$$\$" || true)"
    if [ -n "$strays" ]; then
      echo "$strays" | xargs -r kill 2>/dev/null || true
      sleep 1
      strays="$(pgrep -f "$pattern" 2>/dev/null | grep -v "^$$\$" || true)"
      [ -n "$strays" ] && echo "$strays" | xargs -r kill -9 2>/dev/null || true
      stopped=1
    fi
  fi

  if [ "$stopped" = "1" ]; then
    ok "stopped $name"
  else
    echo "  ${DIM}$name was not running${RESET}"
  fi
}

wait_for() {
  local url="$1" name="$2" tries="${3:-40}"
  for _ in $(seq 1 "$tries"); do
    if curl -sf -o /dev/null --max-time 3 "$url"; then ok "$name is up"; return 0; fi
    sleep 1
  done
  fail "$name did not come up — see the log"
  return 1
}

case "${1:-}" in
  --stop)
    step "Stopping the workbench"
    stop_service "$WEB_PORT" "web console" "next-server|next start"
    stop_service "$API_PORT" "API" "uvicorn backend.api.main"
    exit 0
    ;;
  --status)
    step "Workbench status"
    if curl -sf -o /dev/null --max-time 3 "http://127.0.0.1:$API_PORT/"; then
      ok "API listening on $API_PORT"
    else
      warn "API is not responding on $API_PORT"
    fi
    if curl -sf -o /dev/null --max-time 3 "http://127.0.0.1:$WEB_PORT/"; then
      ok "web console listening on $WEB_PORT"
    else
      warn "web console is not responding on $WEB_PORT"
    fi
    if curl -sf -o /dev/null --max-time 3 "http://127.0.0.1:11434/api/tags"; then
      ok "local model runtime reachable"
    else
      warn "local model runtime (Ollama) is not reachable — inference will fail"
    fi
    exit 0
    ;;
esac

mkdir -p "$LOG_DIR"

step "Checking prerequisites"
[ -x "$VENV/bin/python" ] || { fail "Python environment missing. Run: python3 -m venv .venv && .venv/bin/pip install -r requirements.txt"; exit 1; }
ok "python environment"
[ -d "$ROOT/frontend/node_modules" ] || { fail "Frontend dependencies missing. Run: cd frontend && npm install"; exit 1; }
ok "frontend dependencies"

if curl -sf -o /dev/null --max-time 3 "http://127.0.0.1:11434/api/tags"; then
  ok "local model runtime reachable"
else
  warn "Ollama is not reachable on 11434 — start it with 'ollama serve', or the"
  warn "workbench will run but every model call will fail"
fi

step "Stopping anything already running"
stop_service "$WEB_PORT" "web console" "next-server|next start"
stop_service "$API_PORT" "API" "uvicorn backend.api.main"

# Refuse to continue while a stray worker could still consume the job queue.
if pgrep -f "uvicorn backend.api.main" >/dev/null 2>&1; then
  fail "an API process is still running and would process jobs with stale code"
  pgrep -af "uvicorn backend.api.main" | head -3
  exit 1
fi

if [ "${1:-}" != "--dev" ]; then
  step "Building the web console"
  (cd frontend && npm run build >"$LOG_DIR/build.log" 2>&1) \
    && ok "build complete" \
    || { fail "build failed — see $LOG_DIR/build.log"; tail -25 "$LOG_DIR/build.log"; exit 1; }
fi

step "Starting the API"
setsid nohup "$VENV/bin/python" -m uvicorn backend.api.main:app \
  --host 127.0.0.1 --port "$API_PORT" >"$API_LOG" 2>&1 </dev/null &
disown || true
wait_for "http://127.0.0.1:$API_PORT/" "API" || { tail -20 "$API_LOG"; exit 1; }

step "Starting the web console"
if [ "${1:-}" = "--dev" ]; then
  (cd frontend && setsid nohup npm run dev >"$WEB_LOG" 2>&1 </dev/null &)
else
  (cd frontend && setsid nohup npm run start >"$WEB_LOG" 2>&1 </dev/null &)
fi
wait_for "http://127.0.0.1:$WEB_PORT/" "web console" || { tail -20 "$WEB_LOG"; exit 1; }

echo
echo "  Open ${GREEN}http://localhost:$WEB_PORT${RESET}"
echo "  ${DIM}Sign in as 'engineer' with the password 'workbench'.${RESET}"
echo "  ${DIM}API log: $API_LOG${RESET}"
echo "  ${DIM}Web log: $WEB_LOG${RESET}"
echo "  ${DIM}Stop with: ./scripts/run.sh --stop${RESET}"
echo
