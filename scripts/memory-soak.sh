#!/usr/bin/env bash
# No unconfined app launch: the Python driver always uses systemd + timeout.
set -euo pipefail
cd "$(dirname "$0")/.."
exec python3 scripts/memory_soak.py "$@"
