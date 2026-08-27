#!/bin/bash

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
THRESHOLD=1.05 # 5% regression threshold
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
CONTRACTS_DIR="$PROJECT_ROOT/xconfess-contracts"
BASELINE_FILE="$CONTRACTS_DIR/gas-baseline.json"
UPDATE_BASELINE=false

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --update)
            UPDATE_BASELINE=true
            shift
            ;;
        *)
            echo "Unknown option: $1"
            exit 1
            ;;
    esac
done

print_header() {
    echo -e "${BLUE}========================================${NC}"
    echo -e "${BLUE}  $1${NC}"
    echo -e "${BLUE}========================================${NC}"
}

# Ensure baseline file exists if not updating
if [ "$UPDATE_BASELINE" = false ] && [ ! -f "$BASELINE_FILE" ]; then
    echo -e "${YELLOW}Baseline file not found. Run with --update to generate it.${NC}"
    exit 1
fi

cd "$CONTRACTS_DIR"

# Crates to benchmark
CRATES=("confession-anchor" "anonymous-tipping" "confession-registry" "reputation-badges")

RESULTS_JSON="{}"

for crate in "${CRATES[@]}"; do
    print_header "Benchmarking $crate"
    
    # Run benchmark tests and capture output
    OUTPUT=$(cargo test -p "$crate" --test benchmarks -- --nocapture 2>&1 || true)
    
    # Extract metrics
    # Format: GAS_METRIC:func:type:value
    METRICS=$(echo "$OUTPUT" | grep "GAS_METRIC" || true)
    
    if [ -z "$METRICS" ]; then
        echo -e "${RED}No metrics found for $crate. Ensure benchmarks are implemented.${NC}"
        continue
    fi
    
    CRATE_JSON="{}"
    
    # Group by function
    FUNCS=$(echo "$METRICS" | cut -d: -f2 | sort | uniq)
    
    for func in $FUNCS; do
        CPU=$(echo "$METRICS" | grep ":$func:cpu:" | cut -d: -f4)
        MEM=$(echo "$METRICS" | grep ":$func:mem:" | cut -d: -f4)
        
        CRATE_JSON=$(echo "$CRATE_JSON" | jq ". + {\"$func\": {\"cpu\": $CPU, \"mem\": $MEM}}")
        echo -e "${GREEN}  $func: CPU=$CPU, MEM=$MEM${NC}"
    done
    
    RESULTS_JSON=$(echo "$RESULTS_JSON" | jq ". + {\"$crate\": $CRATE_JSON}")
done

if [ "$UPDATE_BASELINE" = true ]; then
    echo "$RESULTS_JSON" | jq "." > "$BASELINE_FILE"
    echo -e "${GREEN}Baseline updated in $BASELINE_FILE${NC}"
    exit 0
fi

# Compare against baseline
echo -e "\n${BLUE}Comparing against baseline...${NC}"
REGRESSION_FOUND=false

# Re-parse results for comparison
RESULTS_FILE=$(mktemp)
trap "rm -f $RESULTS_FILE" EXIT
echo "$RESULTS_JSON" > "$RESULTS_FILE"

for crate in "${CRATES[@]}"; do
    FUNCS=$(jq -r ".\"$crate\" | keys[]" "$RESULTS_FILE" 2>/dev/null || echo "")
    for func in $FUNCS; do
        for type in "cpu" "mem"; do
            CURRENT=$(jq -r ".\"$crate\".\"$func\".$type" "$RESULTS_FILE")
            BASELINE=$(jq -r ".\"$crate\".\"$func\".$type" "$BASELINE_FILE" 2>/dev/null || echo "null")
            
            if [ "$BASELINE" = "null" ]; then
                echo -e "${YELLOW}[NEW] $crate::$func $type: $CURRENT${NC}"
                continue
            fi
            
            LIMIT=$(echo "$BASELINE * $THRESHOLD" | bc -l | cut -d. -f1)
            
            if [ "$CURRENT" -gt "$LIMIT" ]; then
                echo -e "${RED}[FAIL] $crate::$func $type: $CURRENT (baseline: $BASELINE, limit: $LIMIT)${NC}"
                REGRESSION_FOUND=true
            elif [ "$CURRENT" -gt "$BASELINE" ]; then
                echo -e "${YELLOW}[WARN] $crate::$func $type: $CURRENT (baseline: $BASELINE)${NC}"
            else
                echo -e "${GREEN}[OK] $crate::$func $type: $CURRENT (baseline: $BASELINE)${NC}"
            fi
        done
    done
done

if [ "$REGRESSION_FOUND" = true ]; then
    echo -e "\n${RED}Gas regression detected! Please optimize or update baseline if change is intended.${NC}"
    exit 1
else
    echo -e "\n${GREEN}Gas check passed!${NC}"
    exit 0
fi
