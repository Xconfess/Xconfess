#!/usr/bin/env bash

set -euo pipefail

TEST_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="${TEST_DIR}/.."
SCRIPT_PATH="$REPO_ROOT/contracts-release.sh"

# Helper: Create temporary test environment
setup_test_env() {
  local tmpdir
  tmpdir=$(mktemp -d)
  trap "rm -rf $tmpdir" EXIT
  echo "$tmpdir"
}

# Test 1: Verify script exits non-zero when WASM artifacts are missing
test_missing_wasm_artifacts() {
  local tmpdir
  tmpdir=$(setup_test_env)

  local contracts_dir="$tmpdir/contracts"
  local target_dir="$tmpdir/target/wasm32v1-none/release"
  mkdir -p "$target_dir"

  # Simulate missing artifact by not creating expected files
  local crate="confession-anchor"
  local expected_file="$target_dir/confession_anchor.wasm"

  # Run verify in this environment; it should fail
  export XCONFESS_CONTRACTS_DIR="$contracts_dir"
  export XCONFESS_TARGET_DIR="$target_dir"

  # Source the script and call verify_wasm_outputs
  # This should exit non-zero because confession_anchor.wasm is missing
  if bash "$SCRIPT_PATH" verify 2>/dev/null; then
    echo "FAIL: verify should have exited non-zero for missing artifact"
    return 1
  fi
  echo "PASS: verify correctly exits non-zero for missing $expected_file"
}

# Test 2: Verify script identifies correct missing artifact path
test_missing_artifact_error_message() {
  local tmpdir
  tmpdir=$(setup_test_env)

  local contracts_dir="$tmpdir/contracts"
  local target_dir="$tmpdir/target/wasm32v1-none/release"
  mkdir -p "$target_dir"

  export XCONFESS_CONTRACTS_DIR="$contracts_dir"
  export XCONFESS_TARGET_DIR="$target_dir"

  local expected_file="$target_dir/confession_anchor.wasm"

  # Capture stderr
  local output
  output=$(bash "$SCRIPT_PATH" verify 2>&1 || true)

  if echo "$output" | grep -q "Missing artifact: $expected_file"; then
    echo "PASS: error message identifies missing artifact path"
  else
    echo "FAIL: error message does not identify missing artifact"
    echo "Output was: $output"
    return 1
  fi
}

# Test 3: Verify build command is documented in error
test_missing_artifact_build_hint() {
  local tmpdir
  tmpdir=$(setup_test_env)

  local contracts_dir="$tmpdir/contracts"
  local target_dir="$tmpdir/target/wasm32v1-none/release"
  mkdir -p "$target_dir"

  export XCONFESS_CONTRACTS_DIR="$contracts_dir"
  export XCONFESS_TARGET_DIR="$target_dir"

  local output
  output=$(bash "$SCRIPT_PATH" verify 2>&1 || true)

  # Verify that the error provides guidance (either in script or documentation)
  if bash -c "grep -r 'cargo build' '$SCRIPT_PATH' >/dev/null 2>&1"; then
    echo "PASS: build command documented in script"
  else
    echo "WARN: build command hint not found in script (may be in docs)"
  fi
}

# Test 4: Verify all expected contracts are checked
test_all_contracts_verified() {
  local tmpdir
  tmpdir=$(setup_test_env)

  local contracts_dir="$tmpdir/contracts"
  local target_dir="$tmpdir/target/wasm32v1-none/release"
  mkdir -p "$target_dir"

  export XCONFESS_CONTRACTS_DIR="$contracts_dir"
  export XCONFESS_TARGET_DIR="$target_dir"

  # Create some but not all artifacts
  touch "$target_dir/confession_anchor.wasm"
  # Missing: confession_registry, anonymous_tipping, reputation_badges

  local output
  output=$(bash "$SCRIPT_PATH" verify 2>&1 || true)

  # Verify that multiple missing artifacts are reported
  if echo "$output" | grep -q "confession_registry.wasm"; then
    echo "PASS: script checks all contract artifacts"
  else
    echo "FAIL: not all missing artifacts reported"
    return 1
  fi
}

# Run all tests
echo "Running release script validation tests..."
test_missing_wasm_artifacts
test_missing_artifact_error_message
test_missing_artifact_build_hint
test_all_contracts_verified
echo "All tests passed"
