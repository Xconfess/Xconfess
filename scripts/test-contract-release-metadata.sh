#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

tmpdir="$(mktemp -d)"
trap 'rm -rf "$tmpdir"' EXIT

contracts_dir="$tmpdir/xconfess-contracts"
target_dir="$contracts_dir/target/wasm32-unknown-unknown/release"
manifest_file="$tmpdir/contract-wasm-manifest.json"

crates=(
  "confession-anchor"
  "confession-registry"
  "anonymous-tipping"
  "reputation-badges"
)

mkdir -p "$target_dir"
for crate in "${crates[@]}"; do
  mkdir -p "$contracts_dir/contracts/$crate"
  printf '[package]\nname = "%s"\nversion = "1.2.3"\n' "$crate" \
    > "$contracts_dir/contracts/$crate/Cargo.toml"
  printf 'fixture wasm bytes for %s\n' "$crate" \
    > "$target_dir/${crate//-/_}.wasm"
done

export XCONFESS_CONTRACTS_DIR="$contracts_dir"
export XCONFESS_TARGET_DIR="$target_dir"

source "$REPO_ROOT/scripts/contracts-release.sh"

verify_wasm_outputs
write_manifest "$manifest_file"

python3 - "$contracts_dir" "$manifest_file" "${crates[@]}" <<'PY'
import hashlib
import json
import pathlib
import sys

contracts_dir = pathlib.Path(sys.argv[1])
manifest_file = pathlib.Path(sys.argv[2])
crates = sys.argv[3:]

payload = json.loads(manifest_file.read_text(encoding="utf-8"))
contracts = payload.get("contracts", {})

missing = [crate for crate in crates if crate not in contracts]
if missing:
    raise SystemExit(f"Manifest is missing contract entries: {', '.join(missing)}")

for crate in crates:
    entry = contracts[crate]
    wasm_file = entry.get("wasm_file")
    sha256 = entry.get("sha256")
    if not wasm_file:
        raise SystemExit(f"{crate} is missing wasm_file metadata")
    if not isinstance(sha256, str) or len(sha256) != 64:
        raise SystemExit(f"{crate} has invalid sha256 metadata: {sha256!r}")
    wasm_path = contracts_dir / wasm_file
    expected = hashlib.sha256(wasm_path.read_bytes()).hexdigest()
    if sha256 != expected:
        raise SystemExit(f"{crate} sha256 mismatch: expected {expected}, got {sha256}")

print("contract release metadata hash coverage passed")
PY

rm "$target_dir/confession_registry.wasm"
if (verify_wasm_outputs) 2>"$tmpdir/missing.log"; then
  echo "verify_wasm_outputs succeeded despite a missing artifact" >&2
  exit 1
fi

if ! grep -q "Missing artifact: .*confession_registry.wasm" "$tmpdir/missing.log"; then
  echo "missing artifact failure did not name confession_registry.wasm" >&2
  cat "$tmpdir/missing.log" >&2
  exit 1
fi

echo "missing artifact failure coverage passed"
