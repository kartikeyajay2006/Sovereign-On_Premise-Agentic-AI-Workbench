#!/bin/sh
#
# Offline installer bundle: a thin wrapper over offline_bundle.py.
#
#   ./scripts/offline_bundle.sh build --out dist/aegis-offline      (connected machine)
#   ./offline_bundle.sh install --target /opt/aegis                  (from inside the bundle)
#
# All the logic, and every check, is in the Python script beside this file.
# This only finds a Python 3.11+ interpreter: the air-gapped host has no
# virtual environment yet when the installer runs.

set -eu

HERE="$(cd "$(dirname "$0")" && pwd)"

for candidate in "${PYTHON:-}" python3.11 python3 python; do
  [ -n "$candidate" ] || continue
  if command -v "$candidate" >/dev/null 2>&1 &&
     "$candidate" -c 'import sys; sys.exit(0 if sys.version_info >= (3, 11) else 1)' 2>/dev/null; then
    exec "$candidate" "$HERE/offline_bundle.py" "$@"
  fi
done

echo "offline_bundle: no Python 3.11 or newer found; set PYTHON=/path/to/python3" >&2
exit 1
