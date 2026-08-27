#!/bin/bash

# CI Checks Script for Failed Notification Jobs Dashboard
# This script runs all checks that would typically run in CI/CD

set -e  # Exit on error

echo "🚀 Running CI Checks for Failed Notification Jobs Dashboard"
echo "============================================================"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print status
print_status() {
    if [ $1 -eq 0 ]; then
        echo -e "${GREEN}✓ $2${NC}"
    else
        echo -e "${RED}✗ $2${NC}"
        exit 1
    fi
}

# 1. Type Check
echo ""
echo "📝 Running TypeScript type check..."
npx tsc --noEmit --project tsconfig.json
print_status $? "TypeScript type check"

# 2. Lint Check
echo ""
echo "🔍 Running ESLint..."
npm run lint
print_status $? "ESLint check"

# 3. Run Tests
echo ""
echo "🧪 Running tests..."
npm test -- --passWithNoTests
print_status $? "Tests"

# 4. Check for console.log statements
echo ""
echo "🔎 Checking for console.log statements..."
if grep -r "console\.log" app/(dashboard)/admin/notifications/*.tsx 2>/dev/null; then
    echo -e "${RED}✗ Found console.log statements${NC}"
    exit 1
else
    print_status 0 "No console.log statements"
fi

# 5. Check for .only or .skip in tests
echo ""
echo "🔎 Checking for .only or .skip in tests..."
if grep -r "\.only\|\.skip" app/(dashboard)/admin/notifications/__tests__ 2>/dev/null; then
    echo -e "${RED}✗ Found .only or .skip in tests${NC}"
    exit 1
else
    print_status 0 "No .only or .skip in tests"
fi

# 6. Check for fdescribe or fit in tests
echo ""
echo "🔎 Checking for fdescribe or fit in tests..."
if grep -r "fdescribe\|fit" app/(dashboard)/admin/notifications/__tests__ 2>/dev/null; then
    echo -e "${RED}✗ Found fdescribe or fit in tests${NC}"
    exit 1
else
    print_status 0 "No fdescribe or fit in tests"
fi

# 7. Check for proper 'use client' directives
echo ""
echo "🔎 Checking for 'use client' directives..."
if ! grep -q "^'use client'" app/(dashboard)/admin/notifications/page.tsx; then
    echo -e "${RED}✗ Missing 'use client' in page.tsx${NC}"
    exit 1
fi
if ! grep -q "^'use client'" app/components/admin/ConfirmDialog.tsx; then
    echo -e "${RED}✗ Missing 'use client' in ConfirmDialog.tsx${NC}"
    exit 1
fi
print_status 0 "'use client' directives present"

# 8. Check for dangerouslySetInnerHTML
echo ""
echo "🔎 Checking for dangerouslySetInnerHTML..."
if grep -r "dangerouslySetInnerHTML" app/(dashboard)/admin/notifications 2>/dev/null; then
    echo -e "${YELLOW}⚠ Found dangerouslySetInnerHTML - ensure it's necessary${NC}"
else
    print_status 0 "No dangerouslySetInnerHTML usage"
fi

# 9. Build Check
echo ""
echo "🏗️  Running build check..."
npm run build
print_status $? "Build check"

echo ""
echo "============================================================"
echo -e "${GREEN}✓ All CI checks passed!${NC}"
echo "============================================================"
