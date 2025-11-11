# AI Command Bypass Implementation

**Date:** 2025-11-11  
**Status:** ✅ Completed and Verified

## Overview

Implemented special handling for AI commands (gemini, copilot, codex) executed via shell_cmd tool to bypass LLM processing and save outputs directly to agent memory.

## Problem

AI commands like `codex exec 'query'` were sending their output back to the LLM for processing, which:
- Added unnecessary LLM calls and costs
- Introduced latency
- Could modify or interpret the AI command's response
- The command detection only checked exact command names, failing when arguments were included

## Solution

### 1. Enhanced Command Detection (`core/ai-commands.ts`)

**What was fixed:**
- Command detection now extracts first word from command strings
- Handles commands with arguments: `"codex exec 'query'"` → detects `"codex"`
- Case-insensitive matching
- Handles extra whitespace

**Before:**
```typescript
export function isAICommand(command: string): boolean {
  return AI_COMMANDS.has(command?.toLowerCase());
}
```

**After:**
```typescript
export function isAICommand(command: string): boolean {
  if (!command) return false;
  
  // Extract first word from command (handles "codex exec 'query'" -> "codex")
  const firstWord = command.trim().split(/\s+/)[0].toLowerCase();
  return AI_COMMANDS.has(firstWord);
}
```

### 2. Dual Message Save (`core/events/orchestrator.ts`)

**Implementation:**

When an AI command is detected:

1. **Tool Message** - Save full execution result (for context/debugging):
   - Command details
   - Exit code
   - Duration
   - Full stdout
   - Full stderr

2. **Assistant Message** - Extract and save only stdout (what user sees):
   - Clean output without command metadata
   - Bypasses LLM processing entirely
   - Direct presentation to user

**Message Flow:**

```
Normal Command (e.g., 'ls'):
User → Assistant (tool_call) → Tool (result) → [LLM processes] → Assistant (interpretation)

AI Command (e.g., 'codex exec'):
User → Assistant (tool_call) → Tool (full result) → Assistant (stdout only) [NO LLM]
                                       ↓
                                  Same timestamp
```

### 3. Documentation Updates

Updated documentation in:
- `core/shell-cmd-tool.ts` - Feature description and implementation notes
- `core/events/orchestrator.ts` - Module overview and implementation details

## Testing

### Unit Tests (`tests/core/ai-commands.test.ts`)

Created 7 comprehensive tests:
- ✅ Basic AI commands without arguments
- ✅ AI commands with subcommands and arguments
- ✅ Case-insensitive matching
- ✅ Extra whitespace handling
- ✅ Non-AI command rejection
- ✅ Edge cases (null, undefined, empty)
- ✅ Database example validation

### Database Verification (`chat-1762867765652-31noahu18`)

Verified actual production chat:

```sql
user     | regular          | 2025-11-11T13:53:22.752Z
assistant| with tool_calls  | 2025-11-11T13:53:26.423Z
tool     | tool_call_id: .. | 2025-11-11T13:54:00.624Z  ← Full result
assistant| regular          | 2025-11-11T13:54:00.624Z  ← Stdout only
```

**Key observations:**
- Both tool and assistant messages have identical timestamps
- No LLM call between them (confirmed by timestamp)
- Tool message contains full execution details
- Assistant message contains only clean stdout

## Benefits

✅ **Cost Reduction** - Eliminates unnecessary LLM calls for AI command results  
✅ **Lower Latency** - No round-trip to LLM for processing  
✅ **Preserved Fidelity** - AI command output shown exactly as produced  
✅ **Better UX** - Users see clean output without wrapper text  
✅ **Debugging Support** - Full tool result still saved for troubleshooting  

## Files Modified

- `core/ai-commands.ts` - Enhanced command detection logic
- `core/events/orchestrator.ts` - Dual message save implementation
- `core/shell-cmd-tool.ts` - Documentation updates
- `tests/core/ai-commands.test.ts` - New test suite (7 tests)

## Supported AI Commands

- `gemini` (and with arguments)
- `copilot` (and with arguments)
- `codex` (and with arguments)

All case-insensitive and argument-tolerant.
