#!/bin/bash
set -e

echo "Running gas snapshot..."
cargo test snapshot_gas_usage -- --nocapture
echo "Gas snapshot generated."