#!/bin/bash

set -euo pipefail

# Spellcheck for common misspellings in source directory and file names.
# Run from monorepo root: ./scripts/path-spellcheck.sh

RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m'

FOUND=0

# Common misspellings: typo -> correct
declare -A MISSPELLINGS=(
  ["midleware"]="middleware"
  ["controll"]="controller"
  ["servce"]="service"
  ["respose"]="response"
  ["reqeust"]="request"
  ["authetication"]="authentication"
  ["configuation"]="configuration"
  ["enviroment"]="environment"
  ["moduele"]="module"
  ["validaton"]="validation"
  ["notificaiton"]="notification"
  ["regisrty"]="registry"
  ["tranasction"]="transaction"
  ["recieve"]="receive"
  ["seperate"]="separate"
  ["occured"]="occurred"
  ["dependancy"]="dependency"
  ["initilize"]="initialize"
  ["asyncronous"]="asynchronous"
  ["retreive"]="retrieve"
)

echo "Checking for common misspellings in source paths..."
echo ""

for typo in "${!MISSPELLINGS[@]}"; do
  correct="${MISSPELLINGS[$typo]}"
  matches=$(find xconfess-backend/src xconfess-frontend/app xconfess-contracts/contracts \
    -iname "*${typo}*" 2>/dev/null || true)

  if [ -n "$matches" ]; then
    echo -e "${RED}Found '${typo}' (should be '${correct}'):${NC}"
    echo "$matches" | while read -r line; do
      echo "  $line"
    done
    FOUND=1
  fi
done

if [ "$FOUND" -eq 1 ]; then
  echo ""
  echo -e "${RED}Misspellings found. Please fix the paths above.${NC}"
  exit 1
else
  echo -e "${GREEN}No common misspellings found.${NC}"
  exit 0
fi
