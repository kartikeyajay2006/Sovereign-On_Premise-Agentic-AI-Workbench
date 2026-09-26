#!/usr/bin/env bash
# Load the AEGIS default-deny egress table (infrastructure/firewall/aegis.nft).
#
#   sudo infrastructure/firewall/apply.sh
#   sudo AEGIS_MODEL_SERVER=10.20.0.5 AEGIS_MODEL_PORT=11434 infrastructure/firewall/apply.sh
#
# The ruleset is syntax-checked with `nft -c` before anything is loaded, and
# loaded in one transaction, so a bad file leaves the running ruleset as it
# was. Established connections (an SSH session, a browser on the console) keep
# working; anything this host tries to open outward is dropped and counted.
#
# Not persistent across reboot by design: add it to /etc/nftables.conf (or
# your distribution's equivalent) once you have confirmed it on the host.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RULESET="$HERE/aegis.nft"
TABLE="inet aegis_egress"

if [[ "$(uname -s)" != "Linux" ]]; then
  echo "error: nftables is Linux-only; nothing was applied on $(uname -s)" >&2
  exit 1
fi
if ! command -v nft >/dev/null 2>&1; then
  echo "error: nft is not installed (apt install nftables / dnf install nftables)" >&2
  exit 1
fi
if [[ "$(id -u)" -ne 0 ]]; then
  echo "error: loading a ruleset needs root (CAP_NET_ADMIN); run with sudo" >&2
  exit 1
fi

work="$(mktemp)"
trap 'rm -f "$work"' EXIT
cp "$RULESET" "$work"
if [[ -n "${AEGIS_MODEL_SERVER:-}" ]]; then
  sed -i "s|^define MODEL_SERVER = .*|define MODEL_SERVER = ${AEGIS_MODEL_SERVER}|" "$work"
fi
if [[ -n "${AEGIS_MODEL_PORT:-}" ]]; then
  sed -i "s|^define MODEL_PORT = .*|define MODEL_PORT = ${AEGIS_MODEL_PORT}|" "$work"
fi

nft -c -f "$work"
nft -f "$work"

echo "loaded table $TABLE; output policy:"
nft list chain $TABLE output | grep -m1 "policy"
echo "live ruleset sha256: $(nft list table $TABLE | sha256sum | cut -d' ' -f1)"
echo "counters:"
nft list counters table $TABLE
