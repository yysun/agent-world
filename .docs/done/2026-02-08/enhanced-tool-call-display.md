# Enhanced Tool Call Display with Parameters

**Date:** 2026-02-08  
**Status:** Completed  

## Summary

Enhanced the tool call message display across CLI, web, and React applications to show tool parameters in addition to tool names, providing better visibility into what tools are being called with which arguments.

## Changes

### Before
```
● a1: Calling tool: shell_cmd
```

### After
```
● a1: Calling tool: shell_cmd (command: "ls", directory: "./")
```

## Implementation Details

### Core Changes

**File:** `core/events/orchestrator.ts`

1. **Added `formatToolCallsMessage()` helper function**
   - Parses tool call arguments from JSON
   - Shows up to 3 parameters per tool call
   - Truncates long values (>50 chars) for readability
   - Handles invalid JSON gracefully
   - Formats single tools: `Calling tool: name (param1: value1, param2: value2)`
   - Formats multiple tools: `Calling 2 tools: name1, name2`

2. **Updated tool call message generation**
   - Replaced simple tool name concatenation with `formatToolCallsMessage()`
   - Applies to all LLM responses with tool_calls

### Frontend Compatibility

**Existing Components:**
- `react/src/lib/domain/tool-formatting.ts` - Already has parameter formatting
- `web/src/components/world-chat.tsx` - Already has parameter formatting

The changes are **complementary** - the core now generates richer initial messages while frontends can still do their own enhanced formatting.

### Testing

**New Test File:** `tests/core/tool-call-formatting.test.ts`

Test coverage includes:
- Single tool with simple parameters ✓
- Single tool with one parameter ✓
- Long parameter value truncation ✓
- Multiple parameters (shows up to 3 + "...") ✓
- Multiple tool calls ✓
- Tool call with no parameters ✓
- Invalid JSON arguments (graceful fallback) ✓
- Object parameters with truncation ✓

**All tests pass:** 8/8 ✓

### Backward Compatibility

✓ Existing tests continue to pass (27/27 in message-prep.test.ts)  
✓ Legacy messages without parameters still work  
✓ Web/React components still function as before  
✓ Message history is not affected  

## Benefits

1. **Better CLI Experience**
   - Users can see what parameters are being passed to tools
   - Easier to understand agent behavior
   - Better debugging capability

2. **Improved Message History**
   - Tool calls stored with parameters in database
   - Better context for reviewing past conversations
   - More informative logs

3. **Consistent Display**
   - All clients (CLI, web, React) now show parameters
   - Core generates rich messages by default
   - Frontends can enhance further if needed

## Usage Examples

### Single Tool Call
```
Calling tool: shell_cmd (command: "npm test", directory: "/workspace")
```

### Multiple Parameters
```
Calling tool: read_file (filePath: "/path/to/file.ts", offset: 10, limit: 50)
```

### Long Values (Truncated)
```
Calling tool: write_file (content: "Lorem ipsum dolor sit amet, consectetur adipi...", ...)
```

### Multiple Tools
```
Calling 2 tools: shell_cmd, read_file
```

### No Parameters
```
Calling tool: get_status
```

## Technical Notes

- Parameter truncation set at 50 characters for readability
- Maximum 3 parameters shown (more indicated with "...")
- JSON parsing errors fall back to tool name only
- Function is pure and has no side effects
- Format matches existing frontend conventions

## Files Modified

- `core/events/orchestrator.ts` - Added helper function and updated message generation
- `tests/core/tool-call-formatting.test.ts` - New comprehensive test suite

## Files Not Modified (Already Compatible)

- `cli/stream.ts` - Displays message content as-is ✓
- `web/src/components/world-chat.tsx` - Has own formatting ✓
- `react/src/lib/domain/tool-formatting.ts` - Has own formatting ✓
