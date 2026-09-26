#!/usr/bin/env sh
# Start the local Ollama server with the variables a hardware tier needs.
#
#   scripts/start-ollama.sh                      # laptop-8gb, the demo laptop
#   scripts/start-ollama.sh --tier cpu-server
#   scripts/start-ollama.sh --tier gpu-server --dry-run   # print them, start nothing
#
# Ollama reads these once, when `ollama serve` starts. The values per tier
# (the same names as config/profiles/, which the API is started with via
# SOVEREIGN_PROFILE):
#
#   tier          MAX_LOADED_MODELS    NUM_PARALLEL  FLASH_ATTENTION  KV_CACHE_TYPE
#   laptop-8gb    2 (3B + nomic)       1             -                -
#   laptop-16gb   3 (+ vision)         1             -                -
#   cpu-server    4                    3             1                q8_0
#   gpu-server    3 (8B+vision+nomic)  4             1                q8_0
#
# Every tier sets OLLAMA_KEEP_ALIVE=24h (a duration, not -1: a model that
# never expires cannot be evicted to make room) and OLLAMA_HOST=127.0.0.1:11434
# (loopback only; the API refuses any other inference endpoint anyway).
# NUM_PARALLEL matches the profile's agent.worker_count: each parallel slot
# multiplies the KV cache.
#
# Under systemd, put the same variables in the unit instead
# (`systemctl edit ollama`, Environment= lines) and restart the service;
# this script is for a host where Ollama is started by hand.

set -eu

tier=laptop-8gb
dry_run=0
while [ $# -gt 0 ]; do
    case "$1" in
        --tier) tier="${2:-}"; shift 2 ;;
        --tier=*) tier="${1#--tier=}"; shift ;;
        --dry-run) dry_run=1; shift ;;
        -h|--help) sed -n '2,26p' "$0"; exit 0 ;;
        *) echo "start-ollama: unknown argument $1" >&2; exit 2 ;;
    esac
done

export OLLAMA_HOST=127.0.0.1:11434
export OLLAMA_KEEP_ALIVE=24h
case "$tier" in
    laptop-8gb)  export OLLAMA_MAX_LOADED_MODELS=2 OLLAMA_NUM_PARALLEL=1 ;;
    laptop-16gb) export OLLAMA_MAX_LOADED_MODELS=3 OLLAMA_NUM_PARALLEL=1 ;;
    cpu-server)  export OLLAMA_MAX_LOADED_MODELS=4 OLLAMA_NUM_PARALLEL=3 \
                        OLLAMA_FLASH_ATTENTION=1 OLLAMA_KV_CACHE_TYPE=q8_0 ;;
    gpu-server)  export OLLAMA_MAX_LOADED_MODELS=3 OLLAMA_NUM_PARALLEL=4 \
                        OLLAMA_FLASH_ATTENTION=1 OLLAMA_KV_CACHE_TYPE=q8_0 ;;
    *) echo "start-ollama: unknown tier '$tier' (laptop-8gb, laptop-16gb, cpu-server, gpu-server)" >&2; exit 2 ;;
esac

echo "Ollama variables for tier $tier"
env | grep '^OLLAMA_' | sort | sed 's/^/  /'

[ "$dry_run" -eq 1 ] && exit 0

if ! command -v ollama >/dev/null 2>&1; then
    echo "start-ollama: ollama is not on PATH" >&2
    exit 1
fi

# One server per port: a running one keeps its own variables, and a second
# `ollama serve` would fail to bind anyway.
if (command -v ss >/dev/null 2>&1 && ss -ltn 2>/dev/null | grep -q ':11434 ') ||
   (command -v lsof >/dev/null 2>&1 && lsof -iTCP:11434 -sTCP:LISTEN >/dev/null 2>&1); then
    echo "start-ollama: something already listens on 11434; stop it first (systemctl stop ollama)" >&2
    exit 1
fi

echo "Start the API with the same profile:  SOVEREIGN_PROFILE=$tier"
echo "Then check readiness:                  .venv/bin/python scripts/warmup.py"
echo
exec ollama serve
