#!/usr/bin/env bash
# Build the sandbox image for rootless Podman (default) or Docker.
#
#   infrastructure/sandbox/build.sh
#   RUNTIME=docker infrastructure/sandbox/build.sh
#   IMAGE=localhost/aegis-sandbox:1 infrastructure/sandbox/build.sh
#
# IMAGE must match sandbox.container_image in config/app.yaml. To carry the
# image into an air-gapped host:
#
#   podman save -o aegis-sandbox.tar localhost/aegis-sandbox:1
#   podman load -i aegis-sandbox.tar          # on the air-gapped host
set -euo pipefail

RUNTIME="${RUNTIME:-podman}"
IMAGE="${IMAGE:-localhost/aegis-sandbox:1}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if ! command -v "$RUNTIME" >/dev/null 2>&1; then
  echo "error: $RUNTIME is not installed on this host" >&2
  exit 1
fi

"$RUNTIME" build -t "$IMAGE" -f "$HERE/Containerfile" "$HERE"
echo "built $IMAGE with $RUNTIME"
echo "set sandbox.runtime: $RUNTIME in config/app.yaml and restart the API;"
echo "the startup probe decides whether the container is actually used."
