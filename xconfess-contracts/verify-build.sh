#!/bin/bash

# Build Verification Script for Soroban Contracts
# This script verifies that all contracts compile successfully

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "🔨 Building Soroban Contracts..."
echo "================================"
echo ""

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Ensure we have Rust
if ! command -v cargo &> /dev/null; then
    echo -e "${RED}❌ Cargo not found. Please install Rust.${NC}"
    exit 1
fi

# Ensure we have wasm target
if ! rustup target list | grep -q "wasm32-unknown-unknown (installed)"; then
    echo -e "${YELLOW}⚠️  Installing wasm32 target...${NC}"
    rustup target add wasm32-unknown-unknown
fi

echo "📦 Cargo version: $(cargo --version)"
echo "🦀 Rust version: $(rustc --version)"
echo ""

# Build contracts
echo -e "${YELLOW}Building contracts...${NC}"
cargo build --release --target wasm32-unknown-unknown

# Check build outputs
echo ""
echo -e "${YELLOW}Verifying build outputs...${NC}"

CONTRACTS=(
    "confession_anchor"
    "reputation_badges"
    "anonymous_tipping"
)

WASM_DIR="target/wasm32-unknown-unknown/release"
ALL_BUILT=true

for contract in "${CONTRACTS[@]}"; do
    WASM_FILE="$WASM_DIR/${contract}.wasm"
    if [ -f "$WASM_FILE" ]; then
        SIZE=$(du -h "$WASM_FILE" | cut -f1)
        echo -e "${GREEN}✅ ${contract}.wasm${NC} ($SIZE)"
    else
        echo -e "${RED}❌ ${contract}.wasm not found${NC}"
        ALL_BUILT=false
    fi
done

echo ""

if [ "$ALL_BUILT" = true ]; then
    echo -e "${GREEN}✅ All contracts built successfully!${NC}"
    echo ""
    echo "📝 Next steps:"
    echo "  1. Run tests: cargo test"
    echo "  2. Deploy: See DEPLOYMENT.md"
    echo ""
    exit 0
else
    echo -e "${RED}❌ Some contracts failed to build${NC}"
    exit 1
fi
