# Shell Command Tool - Required Directory Parameter

**Date:** 2025-11-03  
**Status:** Completed

## Overview

Enhanced the shell command tool (`shell_cmd`) to require an explicit directory parameter and implemented intelligent LLM guidance to handle directory specification naturally.

## Features Implemented

### 1. Required Directory Parameter

**File:** `core/shell-cmd-tool.ts`

- Changed `directory` from optional to **required positional parameter**
- Function signature: `executeShellCommand(command, parameters, directory, options)`
- Removed `cwd` from options object
- Added validation: "Directory must be a non-empty string"

**Benefits:**
- Explicit control over command execution location
- Prevents unintended execution in wrong directories
- Better security through explicit specification
- Improved debugging and traceability

### 2. Intelligent LLM Guidance

**Files:** `core/llm-manager.ts`, `core/shell-cmd-tool.ts`

**System Prompt Instructions (added to both streaming and non-streaming):**
```
SHELL COMMAND TOOL (shell_cmd) REQUIREMENTS:
- The shell_cmd tool REQUIRES a "directory" parameter
- If user says "current directory", "here", "this directory", or similar: use "./"
- If user specifies a path (absolute or relative): use that path
- Only ask "In which directory should I run this command?" if the location is truly ambiguous
- Common patterns: "current" → "./", "home" → "~/", "tmp" → "/tmp"
```

**Smart Pattern Recognition:**
- "current directory", "here", "this directory" → `"./"`
- "home directory", "home" → `"~/"`
- "tmp" → `"/tmp"`
- Explicit paths → use as-is
- Truly ambiguous → ask user

**Tool Description Updates:**
- Main description: "CRITICAL: This tool REQUIRES a 'directory' parameter. If user says 'current directory' or 'here', use './'. If user specifies a path, use that. Only ask for clarification if the location is truly ambiguous."
- Parameter description: "REQUIRED: Working directory where the command should be executed. Use './' for current directory when user says 'current', 'here', or 'this directory'. Use '~/' for home directory. Use specified path if provided."

### 3. Timeout Improvements

**File:** `core/shell-cmd-tool.ts`, `core/llm-manager.ts`

- Increased shell command default timeout from 30s to **10 minutes** (600,000ms)
- Increased LLM queue timeout from 2 minutes to **15 minutes** (900,000ms)
- Added warning logs at 50% timeout threshold
- Made LLM queue timeout configurable via `setProcessingTimeout()`

**Benefits:**
- Supports long-running commands (builds, tests, installations)
- Prevents premature timeout errors
- Better debugging with warning logs

## Implementation Details

### System Prompt Integration

The tool usage rules are **appended** (not replaced) to agent system prompts:

```typescript
let systemPrompt = agent.systemPrompt || 'You are a helpful assistant.';

if (hasMCPTools) {
    systemPrompt += '\n\nCRITICAL TOOL USAGE RULES:...'  // APPENDED
}
```

This preserves agent personality while enforcing tool requirements.

### Example Interactions

**User:** "list files in the current directory"  
**LLM:** *Calls shell_cmd with `directory: "./"`*

**User:** "list files in /tmp"  
**LLM:** *Calls shell_cmd with `directory: "/tmp"`*

**User:** "list files"  
**LLM:** "In which directory should I run this command?"

## Test Coverage

**Updated Test Files:**
- `tests/core/shell-cmd-tool.test.ts` - 26 tests
- `tests/core/shell-cmd-integration.test.ts` - 7 tests

**All tests passing:** ✅ 33 shell command tests  
**Full test suite:** ✅ 813 tests passing

**Test Updates:**
- All `executeShellCommand` calls updated to include directory parameter
- Added directory validation tests
- Updated tool schema validation tests
- Updated integration tests with directory parameter

## Configuration Changes

### No Configuration Required

Users don't need to:
- Mention shell_cmd in agent system prompts
- Configure directory handling
- Write special instructions

Everything is handled automatically by the system.

## Architecture

### Tool Flow

1. **Tool Registration:** `shell_cmd` automatically registered in all worlds
2. **System Prompt:** Tool rules appended to agent prompts
3. **LLM Processing:** LLM receives tool definitions + usage rules
4. **Smart Inference:** LLM interprets user intent for directory
5. **Validation:** Tool validates directory parameter exists
6. **Execution:** Command runs in specified directory

### Security Considerations

- **Explicit directory requirement** prevents accidental execution
- **No implicit assumptions** about working directory
- **User confirmation** for ambiguous locations
- **Clear audit trail** in execution history

## Documentation Updates

### Comment Blocks Updated

**core/shell-cmd-tool.ts:**
- Added "Required directory parameter for explicit working directory control"
- Added "LLM guidance to ask user for directory if not provided"
- Updated implementation details

**core/llm-manager.ts:**
- Added "shell_cmd tool guidance: LLM asks user for directory when not provided"
- Updated timeout configuration details

## Files Modified

1. `core/shell-cmd-tool.ts` - Core implementation
2. `core/llm-manager.ts` - System prompt integration (streaming + non-streaming)
3. `tests/core/shell-cmd-tool.test.ts` - Unit tests
4. `tests/core/shell-cmd-integration.test.ts` - Integration tests

## Breaking Changes

### API Changes

**Before:**
```typescript
executeShellCommand('ls', ['-la'], { cwd: '/tmp' })
```

**After:**
```typescript
executeShellCommand('ls', ['-la'], '/tmp')
```

**Migration:** All callers must provide directory as third parameter.

### Tool Schema Changes

**Before:**
- `cwd` optional in parameters
- `required: ['command']`

**After:**
- `directory` required parameter
- `required: ['command', 'directory']`

## Benefits Summary

✅ **Security:** Explicit directory control prevents unintended execution  
✅ **User Experience:** Natural language understanding ("current directory" works)  
✅ **Reliability:** Longer timeouts support real-world use cases  
✅ **Maintainability:** Clear, predictable behavior  
✅ **Debugging:** Better logging and error messages  
✅ **Flexibility:** Smart enough to infer, strict enough to be safe

## Future Enhancements

Potential improvements:
- Remember last used directory per session
- Suggest directory based on file paths mentioned in conversation
- Add directory validation (check if exists before execution)
- Support environment variable expansion in directory paths
- Add working directory context to agent memory
