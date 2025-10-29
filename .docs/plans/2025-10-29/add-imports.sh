#!/bin/bash
# Add Vitest imports to test files that are missing them

files=(
  "tests/api/case-insensitive-agent-lookup.test.ts"
  "tests/api/chat-endpoint.test.ts"
  "tests/api/timestamp-protection.test.ts"
  "tests/api/world-patch-endpoint.test.ts"
  "tests/core/logger-hierarchical.test.ts"
  "tests/core/logger-normalization.test.ts"
  "tests/core/message-saving.test.ts"
  "tests/web-domain/agent-filtering.test.ts"
  "tests/web-domain/agent-management.test.ts"
  "tests/web-domain/chat-history.test.ts"
  "tests/web-domain/deletion.test.ts"
  "tests/web-domain/editing.test.ts"
  "tests/web-domain/input.test.ts"
  "tests/web-domain/message-display.test.ts"
  "tests/web-domain/sse-streaming.test.ts"
  "tests/web-domain/world-export.test.ts"
)

for file in "${files[@]}"; do
  if [ -f "$file" ]; then
    # Add import after the comment block, before first import or code
    if ! grep -q "from 'vitest'" "$file"; then
      # Find line after comment block ending with */
      line_num=$(grep -n '^\*/' "$file" | head -1 | cut -d: -f1)
      if [ -n "$line_num" ]; then
        next_line=$((line_num + 1))
        sed -i '' "${next_line}i\\
import { describe, test, it, expect, beforeEach, afterEach, vi } from 'vitest';\\

" "$file"
        echo "✓ $file"
      fi
    fi
  fi
done
