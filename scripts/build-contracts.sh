#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "Deprecated wrapper: forwarding to ./scripts/contracts-release.sh build"
"$SCRIPT_DIR/contracts-release.sh" build