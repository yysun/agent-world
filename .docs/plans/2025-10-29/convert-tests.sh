#!/bin/bash

#
# Test File Conversion Script: Jest → Vitest
# 
# This script automates the conversion of Jest test files to Vitest format.
# It performs safe, idempotent transformations that can be run multiple times.
#
# Usage: ./convert-tests.sh [directory]
# Example: ./convert-tests.sh tests/core
#          ./convert-tests.sh tests/api
#          ./convert-tests.sh tests  (converts all)
#

set -e  # Exit on error

TARGET_DIR="${1:-tests}"

echo "🔄 Converting Jest test files to Vitest in: $TARGET_DIR"
echo ""

# Find all .test.ts and .test.tsx files
TEST_FILES=$(find "$TARGET_DIR" -type f \( -name "*.test.ts" -o -name "*.test.tsx" \) -not -path "*/node_modules/*")

COUNT=0
CONVERTED=0
SKIPPED=0

for file in $TEST_FILES; do
  COUNT=$((COUNT + 1))
  
  # Check if file still has Jest imports
  if grep -q "from '@jest/globals'" "$file" 2>/dev/null; then
    echo "🔧 Converting: $file"
    
    # Perform the conversion using sed (macOS-compatible)
    sed -i '' "s|from '@jest/globals'|from 'vitest'|g" "$file"
    
    CONVERTED=$((CONVERTED + 1))
  else
    SKIPPED=$((SKIPPED + 1))
  fi
done

echo ""
echo "✅ Conversion complete!"
echo "   Total files found: $COUNT"
echo "   Converted: $CONVERTED"
echo "   Already Vitest: $SKIPPED"
echo ""
echo "Next steps:"
echo "  1. Run: npm run test:vitest -- $TARGET_DIR"
echo "  2. Fix any failing tests manually"
echo "  3. Commit changes: git add $TARGET_DIR && git commit -m 'test: Convert $TARGET_DIR to Vitest'"
