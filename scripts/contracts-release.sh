#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="${XCONFESS_REPO_ROOT:-$(cd "$SCRIPT_DIR/.." && pwd)}"
CONTRACTS_DIR="${XCONFESS_CONTRACTS_DIR:-$REPO_ROOT/xconfess-contracts}"
TARGET_TRIPLE="${XCONFESS_TARGET_TRIPLE:-wasm32v1-none}"
TARGET_DIR="${XCONFESS_TARGET_DIR:-$CONTRACTS_DIR/target/$TARGET_TRIPLE/release}"
if [[ -z "${PYTHON_BIN:-}" ]]; then
  if command -v python3 >/dev/null 2>&1; then
    PYTHON_BIN="python3"
  else
    PYTHON_BIN="python"
  fi
fi

CONTRACT_CRATES=(
  "confession-anchor"
  "confession-registry"
  "anonymous-tipping"
  "reputation-badges"
)

timestamp_utc() {
  date -u +"%Y-%m-%dT%H:%M:%SZ"
}

require_cmd() {
  local cmd="$1"
  local exe="${2:-$cmd}"
  if ! command -v "$exe" >/dev/null 2>&1; then
    echo "Missing required command: $cmd" >&2
    exit 1
  fi
}

resolve_cmd() {
  local cmd="$1"
  if command -v "$cmd" >/dev/null 2>&1; then
    command -v "$cmd"
    return 0
  fi
  if command -v "$cmd.exe" >/dev/null 2>&1; then
    command -v "$cmd.exe"
    return 0
  fi
  return 1
}

stellar_arg_path() {
  local path="$1"
  local stellar_bin="$2"
  if [[ "$stellar_bin" == *.exe ]] && command -v wslpath >/dev/null 2>&1; then
    wslpath -w "$path"
    return 0
  fi
  echo "$path"
}

crate_to_wasm_name() {
  local crate="$1"
  echo "${crate//-/_}.wasm"
}

verify_wasm_outputs() {
  local missing=0
  local missing_artifacts=()

  for crate in "${CONTRACT_CRATES[@]}"; do
    local wasm_file
    wasm_file="$(crate_to_wasm_name "$crate")"
    local wasm_path="$TARGET_DIR/$wasm_file"
    if [[ ! -f "$wasm_path" ]]; then
      echo "Missing artifact: $wasm_path" >&2
      missing_artifacts+=("$crate")
      missing=1
    fi
  done

  if [[ "$missing" -ne 0 ]]; then
    echo "Build failed: expected WASM artifacts not found." >&2
    echo "" >&2
    echo "Missing contracts: ${missing_artifacts[*]}" >&2
    echo "" >&2
    echo "To build artifacts, run:" >&2
    echo "  $SCRIPT_DIR/contracts-release.sh build" >&2
    echo "" >&2
    echo "Or manually:" >&2
    echo "  cd $CONTRACTS_DIR" >&2
    echo "  cargo build --locked --workspace --release --target wasm32v1-none" >&2
    echo "" >&2
    exit 1
  fi
}

write_manifest() {
  local output_file="$1"
  local generated_at
  generated_at="$(timestamp_utc)"

  require_cmd sha256sum

  {
    printf '{\n'
    printf '  "contracts": {\n'

    local idx=0
    local count=${#CONTRACT_CRATES[@]}
    for crate in "${CONTRACT_CRATES[@]}"; do
      local wasm_name
      wasm_name="$(crate_to_wasm_name "$crate")"
      local wasm_path="$TARGET_DIR/$wasm_name"
      local cargo_toml="$CONTRACTS_DIR/contracts/$crate/Cargo.toml"
      local version
      version="$(sed -n 's/^version[[:space:]]*=[[:space:]]*"\([^"]*\)".*/\1/p' "$cargo_toml" | head -n 1)"
      if [[ -z "$version" ]]; then
        echo "No version found in $cargo_toml" >&2
        exit 1
      fi

      local sha256
      sha256="$(sha256sum "$wasm_path" | awk '{print $1}')"
      local bytes
      bytes="$(wc -c < "$wasm_path" | tr -d '[:space:]')"
      local wasm_file="target/$TARGET_TRIPLE/release/$wasm_name"

      printf '    "%s": {\n' "$crate"
      printf '      "bytes": %s,\n' "$bytes"
      printf '      "sha256": "%s",\n' "$sha256"
      printf '      "version": "%s",\n' "$version"
      printf '      "wasm_file": "%s"\n' "$wasm_file"
      if [[ $idx -lt $((count - 1)) ]]; then
        printf '    },\n'
      else
        printf '    }\n'
      fi
      idx=$((idx + 1))
    done

    printf '  },\n'
    printf '  "generated_at_utc": "%s",\n' "$generated_at"
    printf '  "profile": "release",\n'
    printf '  "target": "%s"\n' "$TARGET_TRIPLE"
    printf '}\n'
  } > "$output_file"
}

check_manifest() {
  local manifest_file="$1"
  require_cmd "$PYTHON_BIN" "$PYTHON_BIN"
  if [[ ! -f "$manifest_file" ]]; then
    echo "Release manifest is missing: $manifest_file" >&2
    echo "Run ./scripts/contracts-release.sh build and commit deployments/contract-wasm-manifest.json." >&2
    exit 1
  fi
  "$PYTHON_BIN" - "$manifest_file" "$CONTRACTS_DIR" "$TARGET_TRIPLE" "${CONTRACT_CRATES[@]}" <<'PY'
import hashlib
import json
import pathlib
import sys
manifest_path, contracts_dir, target = pathlib.Path(sys.argv[1]), pathlib.Path(sys.argv[2]), sys.argv[3]
try:
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
except (OSError, json.JSONDecodeError) as exc:
    raise SystemExit(f"Release manifest cannot be read ({manifest_path}): {exc}")
errors = []
if manifest.get("target") != target:
    errors.append(f"target: manifest has {manifest.get('target')!r}, build used {target!r}")
entries = manifest.get("contracts")
if not isinstance(entries, dict):
    errors.append("contracts: missing or not an object")
    entries = {}
for crate in sys.argv[4:]:
    entry = entries.get(crate)
    if not isinstance(entry, dict):
        errors.append(f"{crate}: missing contract entry")
        continue
    expected_path = f"target/{target}/release/{crate.replace('-', '_')}.wasm"
    if entry.get("wasm_file") != expected_path:
        errors.append(f"{crate}: wasm_file is {entry.get('wasm_file')!r}, expected {expected_path!r}")
    wasm_path = contracts_dir / expected_path
    if not wasm_path.is_file():
        errors.append(f"{crate}: built artifact is missing at {wasm_path}")
        continue
    actual_sha = hashlib.sha256(wasm_path.read_bytes()).hexdigest()
    if entry.get("sha256") != actual_sha:
        errors.append(f"{crate}: sha256 mismatch (manifest {entry.get('sha256')!r}; rebuilt {actual_sha})")
if errors:
    print("Release manifest is stale or does not describe the rebuilt WASM:", file=sys.stderr)
    for error in errors: print(f"  - {error}", file=sys.stderr)
    print("Fix: run ./scripts/contracts-release.sh build, review the SHA-256 changes, and commit deployments/contract-wasm-manifest.json.", file=sys.stderr)
    raise SystemExit(1)
print(f"Release manifest matches rebuilt {target} WASM artifacts: {manifest_path}")
PY
}

build_all() {
  local cargo_bin
  local rustup_bin
  cargo_bin="$(resolve_cmd cargo)" || {
    echo "Missing required command: cargo" >&2
    exit 1
  }
  rustup_bin="$(resolve_cmd rustup)" || {
    echo "Missing required command: rustup" >&2
    exit 1
  }
  pushd "$CONTRACTS_DIR" >/dev/null
  "$rustup_bin" target add "$TARGET_TRIPLE" >/dev/null
  "$cargo_bin" build --locked --workspace --release --target "$TARGET_TRIPLE"
  popd >/dev/null
  verify_wasm_outputs

  [[ -d "$REPO_ROOT/deployments" ]] || mkdir -p "$REPO_ROOT/deployments"
  local manifest_file="$REPO_ROOT/deployments/contract-wasm-manifest.json"
  write_manifest "$manifest_file"
  echo "Build complete. Manifest: $manifest_file"
}

check_all() {
  local cargo_bin rustup_bin
  cargo_bin="$(resolve_cmd cargo)" || { echo "Missing required command: cargo" >&2; exit 1; }
  rustup_bin="$(resolve_cmd rustup)" || { echo "Missing required command: rustup" >&2; exit 1; }
  pushd "$CONTRACTS_DIR" >/dev/null
  "$rustup_bin" target add "$TARGET_TRIPLE" >/dev/null
  "$cargo_bin" build --locked --workspace --release --target "$TARGET_TRIPLE"
  popd >/dev/null
  verify_wasm_outputs
  check_manifest "$REPO_ROOT/deployments/contract-wasm-manifest.json"
}

verify_only() {
  verify_wasm_outputs
  [[ -d "$REPO_ROOT/deployments" ]] || mkdir -p "$REPO_ROOT/deployments"
  local manifest_file="$REPO_ROOT/deployments/contract-wasm-manifest.json"
  write_manifest "$manifest_file"
  echo "Verification complete. Manifest: $manifest_file"
}

deploy_all() {
  local network="$1"
  local source_key="$2"
  local dry_run="$3"
  local force="$4"

  local stellar_bin
  stellar_bin="$(resolve_cmd stellar)" || {
    echo "Missing required command: stellar" >&2
    exit 1
  }
  verify_only

  local output_file="$REPO_ROOT/deployments/${network}.json"
  if [[ "$dry_run" != "true" && ! -f "$output_file" && "$force" != "true" ]]; then
    echo "Rollback guard: no previous deployment metadata found for network '$network'." >&2
    echo "If this is an intentional first-time deployment, re-run with --force to proceed." >&2
    exit 1
  fi

  if [[ "$dry_run" == "true" ]]; then
    if [[ ! -f "$output_file" ]]; then
      echo "Dry-run mode enabled. Build artifacts are verified, but no prior deployment metadata was found for network '$network'."
      echo "If this is the first deployment, the actual run requires --force to bypass rollback safety."
    else
      echo "Dry-run mode enabled. Build artifacts are verified and deployment metadata path is: $output_file"
    fi
    echo "No contracts were deployed. To execute the deployment, rerun without --dry-run."
    return 0
  fi

  local generated_at
  generated_at="$(timestamp_utc)"
  local ids_file
  ids_file="$(mktemp)"

  for crate in "${CONTRACT_CRATES[@]}"; do
    local wasm_file
    wasm_file="$(crate_to_wasm_name "$crate")"
    local wasm_path="$TARGET_DIR/$wasm_file"
    local stellar_wasm_path
    stellar_wasm_path="$(stellar_arg_path "$wasm_path" "$stellar_bin")"
    echo "Deploying $crate ($wasm_file) to $network..."
    local contract_id
    contract_id="$("$stellar_bin" contract deploy --wasm "$stellar_wasm_path" --network "$network" --source "$source_key")"
    echo "$crate=$contract_id" >> "$ids_file"
  done

  local output_file="$REPO_ROOT/deployments/${network}.json"
  "$PYTHON_BIN" - "$CONTRACTS_DIR" "$TARGET_DIR" "$output_file" "$generated_at" "$network" "$source_key" "$ids_file" "${CONTRACT_CRATES[@]}" <<'PY'
import hashlib
import json
import pathlib
import re
import sys

contracts_dir = pathlib.Path(sys.argv[1])
target_dir = pathlib.Path(sys.argv[2])
output_file = pathlib.Path(sys.argv[3])
generated_at = sys.argv[4]
network = sys.argv[5]
source_key = sys.argv[6]
ids_file = pathlib.Path(sys.argv[7])
crates = sys.argv[8:]

CONTRACT_ID_RE = re.compile(r"C[A-Z2-7]{55}")
NETWORK_ALIAS_RE = re.compile(r"[a-z][a-z0-9-]*")
SEMVER_RE = re.compile(r"\d+\.\d+\.\d+")

# Refuse to write metadata that the env verifier would later reject. Failing
# here leaves any previous <network>.json untouched.
if not NETWORK_ALIAS_RE.fullmatch(network):
    raise SystemExit(f"Refusing to write deployment metadata: invalid network alias {network!r}")

ids = {}
for line in ids_file.read_text(encoding="utf-8").splitlines():
    crate, contract_id = line.split("=", 1)
    ids[crate] = contract_id.strip()

def crate_version(crate: str) -> str:
    cargo_toml = contracts_dir / "contracts" / crate / "Cargo.toml"
    text = cargo_toml.read_text(encoding="utf-8")
    match = re.search(r'(?m)^version\s*=\s*"([^"]+)"\s*$', text)
    if not match:
        raise RuntimeError(f"No version found in {cargo_toml}")
    if not SEMVER_RE.fullmatch(match.group(1)):
        raise RuntimeError(f"Version in {cargo_toml} must be MAJOR.MINOR.PATCH, got {match.group(1)!r}")
    return match.group(1)

contracts = {}
for crate in crates:
    if crate not in ids:
        raise SystemExit(f"Refusing to write deployment metadata: no contract ID returned for {crate}")
    if not CONTRACT_ID_RE.fullmatch(ids[crate]):
        raise SystemExit(f"Refusing to write deployment metadata: invalid contract ID for {crate}: {ids[crate]!r}")
    wasm_name = crate.replace("-", "_") + ".wasm"
    wasm_path = target_dir / wasm_name
    content = wasm_path.read_bytes()
    contracts[crate] = {
        "contract_id": ids[crate],
        "source": source_key,
        "version": crate_version(crate),
        "wasm_file": str(wasm_path.relative_to(contracts_dir)),
        "sha256": hashlib.sha256(content).hexdigest(),
    }

payload = {
    "generated_at_utc": generated_at,
    "network": network,
    "target": target_dir.parent.name,
    "contracts": contracts,
}

output_file.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")
PY

  rm -f "$ids_file"
  echo "Deployment metadata written to: $output_file"
}

print_help() {
  cat <<'EOF'
Usage:
  ./scripts/contracts-release.sh build
  ./scripts/contracts-release.sh verify
  ./scripts/contracts-release.sh check
  ./scripts/contracts-release.sh deploy --network <network> --source <stellar-key-name> [--dry-run] [--force]

Commands:
  build    Build all contract crates reproducibly and generate a manifest
  verify   Verify all expected artifacts exist and regenerate the manifest
  check    Rebuild artifacts and fail if the committed manifest SHA-256 values are stale
  deploy   Deploy all artifacts and write per-network deployment metadata

Options:
  --dry-run  Verify build artifacts and deployment readiness without deploying contracts
  --force    Allow deploy to proceed even when no prior deployment metadata exists
EOF
}

main() {
  if [[ ! -d "$CONTRACTS_DIR" ]]; then
    echo "Could not find contracts directory: $CONTRACTS_DIR" >&2
    exit 1
  fi

  local cmd="${1:-}"
  case "$cmd" in
    build)
      build_all
      ;;
    verify)
      verify_only
      ;;
    check)
      check_all
      ;;
    deploy)
      shift || true
      local network=""
      local source_key=""
      local dry_run="false"
      local force="false"
      while [[ $# -gt 0 ]]; do
        case "$1" in
          --network)
            network="${2:-}"
            shift 2
            ;;
          --source)
            source_key="${2:-}"
            shift 2
            ;;
          --dry-run)
            dry_run="true"
            shift
            ;;
          --force)
            force="true"
            shift
            ;;
          *)
            echo "Unknown argument: $1" >&2
            print_help
            exit 1
            ;;
        esac
      done
      if [[ -z "$network" || -z "$source_key" ]]; then
        echo "deploy requires --network and --source" >&2
        print_help
        exit 1
      fi
      deploy_all "$network" "$source_key" "$dry_run" "$force"
      ;;
    -h|--help|help|"")
      print_help
      ;;
    *)
      echo "Unknown command: $cmd" >&2
      print_help
      exit 1
      ;;
  esac
}

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
  main "$@"
fi
