#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NETWORK="${1:-testnet}"
SOURCE_KEY="${2:-deployer}"

echo "Deprecated wrapper: forwarding to ./scripts/contracts-release.sh deploy"
"$SCRIPT_DIR/contracts-release.sh" deploy --network "$NETWORK" --source "$SOURCE_KEY"