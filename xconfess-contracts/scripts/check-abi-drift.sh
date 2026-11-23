#!/usr/bin/env bash
# check-abi-drift.sh — Verify committed abi.json files match contract source code.
#
# Exit codes:
#   0 — all abi.json files are in sync
#   1 — drift detected or script error
#
# Usage:
#   ./scripts/check-abi-drift.sh           # from xconfess-contracts/
#   bash scripts/check-abi-drift.sh        # from repo root
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
CONTRACTS_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
DRIFT=0

# Extract function names from a contract's lib.rs by finding pub fn declarations
# inside #[contractimpl] blocks.
extract_functions_from_source() {
  local lib_file="$1"
  if [[ ! -f "$lib_file" ]]; then
    echo ""
    return
  fi
  # Extract all `pub fn <name>` lines, strip the `pub fn ` prefix and trailing parens/params
  # This catches both `pub fn name(...)` and `pub fn name(…)` patterns
  grep -oP 'pub\s+fn\s+\K[a-z_][a-z_0-9]*' "$lib_file" | sort -u
}

# Read functions list from an abi.json file
read_abi_functions() {
  local abi_file="$1"
  if [[ ! -f "$abi_file" ]]; then
    echo ""
    return
  fi
  # Extract function names from the JSON "functions" array
  # Handles both compact and multi-line JSON arrays
  python3 -c "
import json, sys
try:
    with open('$abi_file') as f:
        data = json.load(f)
    funcs = data.get('functions', [])
    for fn in sorted(funcs):
        print(fn)
except Exception:
    sys.exit(1)
" 2>/dev/null || echo ""
}

# Check a single contract directory for ABI drift
check_contract() {
  local contract_dir="$1"
  local contract_name
  contract_name="$(basename "$contract_dir")"
  local lib_file="$contract_dir/src/lib.rs"
  local abi_file="$contract_dir/abi.json"

  echo "─── Checking: $contract_name ───"

  if [[ ! -f "$abi_file" ]]; then
    echo "  ⚠  No abi.json found — skipping"
    return
  fi

  if [[ ! -f "$lib_file" ]]; then
    echo "  ⚠  No src/lib.rs found — skipping"
    return
  fi

  local source_functions
  source_functions="$(extract_functions_from_source "$lib_file")"
  local abi_functions
  abi_functions="$(read_abi_functions "$abi_file")"

  if [[ -z "$source_functions" ]]; then
    echo "  ⚠  No public functions found in source — skipping comparison"
    return
  fi

  # Build temp files for diff
  local tmp_source tmp_abi
  tmp_source="$(mktemp)"
  tmp_abi="$(mktemp)"
  echo "$source_functions" > "$tmp_source"
  echo "$abi_functions" > "$tmp_abi"

  local source_count abi_count
  source_count="$(grep -c '.' "$tmp_source" || echo 0)"
  abi_count="$(grep -c '.' "$tmp_abi" || echo 0)"

  echo "  Source functions: $source_count"
  echo "  ABI functions:    $abi_count"

  local missing_in_abi extra_in_abi
  missing_in_abi="$(comm -23 "$tmp_source" "$tmp_abi")"
  extra_in_abi="$(comm -13 "$tmp_source" "$tmp_abi")"

  local has_drift=0

  if [[ -n "$missing_in_abi" ]]; then
    echo "  ❌ Functions in source but missing from abi.json:"
    echo "$missing_in_abi" | sed 's/^/     - /'
    has_drift=1
  fi

  if [[ -n "$extra_in_abi" ]]; then
    echo "  ❌ Functions in abi.json but not found in source:"
    echo "$extra_in_abi" | sed 's/^/     - /'
    has_drift=1
  fi

  if [[ "$has_drift" -eq 0 ]]; then
    echo "  ✅ ABI in sync"
  else
    DRIFT=1
  fi

  rm -f "$tmp_source" "$tmp_abi"
}

echo "=== Contract ABI Drift Check ==="
echo ""

# Find all contract directories (those containing abi.json)
for abi_path in "$CONTRACTS_DIR"/contracts/*/abi.json; do
  contract_dir="$(dirname "$abi_path")"
  check_contract "$contract_dir"
  echo ""
done

if [[ "$DRIFT" -ne 0 ]]; then
  echo "❌ ABI drift detected. Run the following to update abi.json files:"
  echo "   (See docs/contract-abi-reference.md for manual update instructions)"
  exit 1
else
  echo "✅ All abi.json files are in sync with contract source."
  exit 0
fi
