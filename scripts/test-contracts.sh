#!/bin/bash

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Helper functions
print_success() {
    echo -e "${GREEN}[OK] $1${NC}"
}

print_error() {
    echo -e "${RED}[ERROR] $1${NC}"
}

print_info() {
    echo -e "${BLUE}[INFO] $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}[WARN] $1${NC}"
}

print_header() {
    echo -e "${BLUE}========================================${NC}"
    echo -e "${BLUE}  $1${NC}"
    echo -e "${BLUE}========================================${NC}"
}

# Parse command line arguments
VERBOSE=false
NOCAPTURE=false

while [[ $# -gt 0 ]]; do
    case $1 in
        -v|--verbose)
            VERBOSE=true
            shift
            ;;
        --nocapture)
            NOCAPTURE=true
            shift
            ;;
        -h|--help)
            echo "Usage: ./scripts/test-contracts.sh [OPTIONS]"
            echo ""
            echo "Options:"
            echo "  -v, --verbose    Show verbose test output"
            echo "  --nocapture      Show println! output from tests"
            echo "  -h, --help       Show this help message"
            exit 0
            ;;
        *)
            print_error "Unknown option: $1"
            echo "Use -h or --help for usage information"
            exit 1
            ;;
    esac
done

# Determine project root and contracts directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
CONTRACTS_DIR="$PROJECT_ROOT/xconfess-contracts"

# Check if contracts directory exists
if [ ! -d "$CONTRACTS_DIR" ]; then
    print_error "Error: xconfess-contracts directory not found!"
    echo "Expected location: $CONTRACTS_DIR"
    echo "Current directory: $(pwd)"
    exit 1
fi

# Check if Cargo.toml exists in contracts directory
if [ ! -f "$CONTRACTS_DIR/Cargo.toml" ]; then
    print_error "Error: Cargo.toml not found in xconfess-contracts!"
    echo "Expected location: $CONTRACTS_DIR/Cargo.toml"
    exit 1
fi

# Check if cargo is installed
if ! command -v cargo &> /dev/null; then
    print_error "Cargo is not installed!"
    echo "Install Rust and Cargo: https://rustup.rs/"
    exit 1
fi

print_header "Testing xConfess Soroban Contracts"
print_info "Project root: $PROJECT_ROOT"
print_info "Contracts directory: $CONTRACTS_DIR"
echo ""

# Change to contracts directory
cd "$CONTRACTS_DIR"

if ! grep -q "\[workspace\]" Cargo.toml; then
    print_error "This project is not configured as a Cargo workspace"
    echo "Expected a [workspace] section in xconfess-contracts/Cargo.toml"
    cd "$PROJECT_ROOT"
    exit 1
fi

mapfile -t WORKSPACE_MEMBERS < <(
    awk '
        /^members = \[/ { in_members = 1; next }
        in_members && /^]/ { in_members = 0; exit }
        in_members {
            gsub(/^[[:space:]]*"/, "", $0)
            gsub(/",?[[:space:]]*$/, "", $0)
            gsub(/[[:space:]]/, "", $0)
            if (length($0) > 0) print $0
        }
    ' Cargo.toml
)

if [ ${#WORKSPACE_MEMBERS[@]} -eq 0 ]; then
    print_error "Could not determine workspace members from Cargo.toml"
    cd "$PROJECT_ROOT"
    exit 1
fi

CONTRACT_CRATES=()
for member in "${WORKSPACE_MEMBERS[@]}"; do
    CONTRACT_CRATES+=("$(basename "$member")")
done

print_info "Workspace contract crates: ${CONTRACT_CRATES[*]}"
echo ""

run_phase() {
    local phase="$1"
    local crate="$2"
    shift 2

    print_header "$phase :: $crate"
    if "$@"; then
        print_success "$phase passed for $crate"
        echo ""
        return 0
    fi

    print_error "$phase failed for $crate"
    cd "$PROJECT_ROOT"
    exit 1
}

TEST_ARGS=()
if [ "$VERBOSE" = true ]; then
    TEST_ARGS+=(--verbose)
fi
if [ "$NOCAPTURE" = true ]; then
    TEST_ARGS+=(-- --nocapture)
fi

for crate in "${CONTRACT_CRATES[@]}"; do
    run_phase "CHECK" "$crate" cargo check -p "$crate"
done

print_header "BUILD :: workspace wasm32"
if cargo build --workspace --target wasm32-unknown-unknown; then
    print_success "BUILD passed for workspace wasm32"
    echo ""
else
    print_error "BUILD failed for workspace wasm32"
    cd "$PROJECT_ROOT"
    exit 1
fi

for crate in "${CONTRACT_CRATES[@]}"; do
    run_phase "TEST" "$crate" cargo test -p "$crate" "${TEST_ARGS[@]}"
done

echo ""
print_header "Test Summary"

print_success "All contract crates completed check, build, and test phases"
for crate in "${CONTRACT_CRATES[@]}"; do
    echo "  - $crate"
done

echo ""
print_info "Next steps:"
echo "  1. Build contracts: ./scripts/contracts-release.sh build"
echo "  2. Deploy to testnet: ./scripts/contracts-release.sh deploy --network testnet --source deployer"
echo "  3. Run with coverage: cargo tarpaulin --workspace"

# Return to original directory
cd "$PROJECT_ROOT"

exit 0