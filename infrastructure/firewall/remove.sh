#!/usr/bin/env bash
# Remove the AEGIS default-deny egress table. Outbound traffic is then
# governed by whatever else is in the host's ruleset, and the Assurance screen
# reports the firewall as not present.
#
#   sudo infrastructure/firewall/remove.sh
set -euo pipefail

TABLE="inet aegis_egress"

if [[ "$(uname -s)" != "Linux" ]] || ! command -v nft >/dev/null 2>&1; then
  echo "nftables is not available on this host; nothing to remove" >&2
  exit 0
fi
if [[ "$(id -u)" -ne 0 ]]; then
  echo "error: removing a table needs root (CAP_NET_ADMIN); run with sudo" >&2
  exit 1
fi

if nft list table $TABLE >/dev/null 2>&1; then
  echo "final counters before removal:"
  nft list counters table $TABLE
  nft delete table $TABLE
  echo "removed table $TABLE"
else
  echo "table $TABLE is not loaded; nothing to remove"
fi
