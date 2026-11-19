#!/usr/bin/env bash
# Integration test: the canonical release script refuses a critical deploy
# until the review delay has elapsed, and refuses to replay an executed window.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

mkdir -p "$TMP/bin" "$TMP/contracts/contracts" \
  "$TMP/contracts/target/wasm32v1-none/release" "$TMP/ledger" "$TMP/repo/deployments"

CRATES=(confession-anchor confession-registry anonymous-tipping reputation-badges)
for crate in "${CRATES[@]}"; do
  mkdir -p "$TMP/contracts/contracts/$crate"
  printf '[package]\nname = "%s"\nversion = "1.0.0"\n' "$crate" > "$TMP/contracts/contracts/$crate/Cargo.toml"
  printf 'synthetic wasm bytes for %s' "$crate" > "$TMP/contracts/target/wasm32v1-none/release/${crate//-/_}.wasm"
done

cat > "$TMP/bin/stellar" <<'STUB'
#!/usr/bin/env bash
if [[ "${1:-}" == "contract" && "${2:-}" == "deploy" ]]; then
  printf 'C%s\n' "$(printf 'A%.0s' {1..55})"
  exit 0
fi
exit 0
STUB
chmod +x "$TMP/bin/stellar"

export PATH="$TMP/bin:$PATH"
export XCONFESS_REPO_ROOT="$TMP/repo"
export XCONFESS_CONTRACTS_DIR="$TMP/contracts"
export XCONFESS_TARGET_TRIPLE="wasm32v1-none"
export REVIEW_DELAY_DIR="$TMP/ledger"

RELEASE_SCRIPT="$ROOT/scripts/contracts-release.sh"
DELAY_CLI="$ROOT/scripts/contract-review-delay.js"

expect_blocked() {
  local label="$1"
  shift
  local output status
  set +e
  output="$(bash "$RELEASE_SCRIPT" "$@" 2>&1)"
  status=$?
  set -e
  if [[ "$status" -eq 0 ]]; then
    echo "[FAIL] $label: critical deploy unexpectedly succeeded" >&2
    echo "$output" >&2
    exit 1
  fi
  if [[ "$output" != *"Blocked: critical contract change"* ]]; then
    echo "[FAIL] $label: missing explicit blocked event" >&2
    echo "$output" >&2
    exit 1
  fi
  echo "[OK] $label"
}

# 1. No schedule at all: --force must not bypass the review window.
expect_blocked "unscheduled mainnet deploy is blocked" \
  deploy --network public --source test-deployer --force

# 2. A pending window that has not elapsed also blocks execution.
NOW="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
node "$DELAY_CLI" schedule --action contract.deploy.mainnet \
  --delay-seconds 3600 --now "$NOW" --actor test > /dev/null
expect_blocked "pending mainnet deploy is blocked" \
  deploy --network public --source test-deployer --force

# 3. Once the window has elapsed, the deploy proceeds and records an event.
node "$DELAY_CLI" clear --action contract.deploy.mainnet --actor test > /dev/null
node "$DELAY_CLI" schedule --action contract.deploy.mainnet \
  --delay-seconds 1 --now 2020-01-01T00:00:00Z --actor test > /dev/null
bash "$RELEASE_SCRIPT" deploy --network public --source test-deployer --force > /dev/null
echo "[OK] elapsed mainnet deploy is allowed"

# 4. The executed window cannot be replayed.
expect_blocked "executed mainnet deploy cannot be replayed" \
  deploy --network public --source test-deployer --force

# 5. Non-critical networks remain unblocked (no schedule required).
bash "$RELEASE_SCRIPT" deploy --network testnet --source test-deployer --force > /dev/null
echo "[OK] testnet deploy does not require a review window"

echo "Review-delay gate integration test passed."
