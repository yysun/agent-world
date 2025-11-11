# Tool Result Message Filtering - Implementation

**Date**: 2025-11-11  
**Files Modified**: `web/src/components/world-chat.tsx`

## Overview

Updated the web frontend to hide regular tool execution result messages while preserving the approval flow display.

## Requirements

- **Hide**: Regular tool execution results (e.g., shell command output)
- **Show**: Approval responses via `ToolCallResponseBox` component
- **Preserve**: Complete approval flow functionality

## Implementation

### Message Type Classification

1. **Approval Tool Results**
   - Structure: `{__type: 'tool_result', content: '{"decision": "approve|deny", ...}'}`
   - Detection: `detectToolCallResponse()` returns toolCallData
   - Display: Via `ToolCallResponseBox` component
   - Examples:
     - User approves tool execution (once/session)
     - User denies tool execution

2. **Regular Tool Results**
   - Structure: `{role: 'tool', content: '### Command Execution...'}`
   - Detection: `role === 'tool'` but no toolCallData
   - Display: **Hidden** from chat
   - Examples:
     - Shell command execution output
     - Tool execution success/failure messages

### Filtering Logic

```typescript
const shouldHideMessage = (message: Message): boolean => {
  // Don't hide if this is an approval response (has toolCallData for ToolCallResponseBox)
  if (message.isToolCallResponse && message.toolCallData) {
    return false; // Show approval responses
  }

  // Hide non-approval tool result messages
  if (message.type === 'tool') {
    return true; // Hide regular tool execution results
  }

  // Additional check for enhanced protocol format
  if (parsed.__type === 'tool_result' && parsed.tool_call_id) {
    return true; // Hide unless it's an approval (already checked above)
  }

  return false;
}
```

### Database Examples

From `~/agent-world/database.db`:

**Approval Tool Result** (ID: 132935) - **DISPLAYED**:
```json
{
  "__type": "tool_result",
  "tool_call_id": "call_iF2BORW4l0nCNQNiHVNa9",
  "agentId": "agent-1",
  "content": "{\"decision\":\"approve\",\"scope\":\"once\",\"toolName\":\"test_tool\",\"toolArgs\":{\"param\":\"legacy\"},\"workingDirectory\":\"/Users/esun/Documents/Projects/agent-world\"}"
}
```

**Regular Tool Result** (ID: 820858) - **HIDDEN**:
```markdown
### Command Execution

**Command:** `codex exec 'summarize project briefly'`
**Duration:** 31406ms
**Executed at:** 2025-11-11T15:00:50.809Z
**Status:** ✅ Exit code 0

### Standard Output
...
```

## Approval Flow Verification

### Flow Sequence

1. **Agent requests tool execution**
   - Creates tool call request
   - Displayed via `ToolCallRequestBox`

2. **User responds to approval request**
   - Clicks approve/deny button
   - Calls `publishToolResult()` with decision

3. **Approval response published**
   - Creates tool result with `__type: 'tool_result'` and `decision` field
   - `detectToolCallResponse()` detects approval
   - Sets `isToolCallResponse = true` and `toolCallData`

4. **Approval response displayed**
   - `shouldHideMessage()` returns `false` (don't hide)
   - Rendered via `ToolCallResponseBox` component
   - Shows approval/denial status and scope

5. **Tool execution result published**
   - Creates regular tool result with execution output
   - `detectToolCallResponse()` returns `null` (no decision)
   - Sets `isToolCallResponse = false`

6. **Tool execution result hidden**
   - `shouldHideMessage()` returns `true` (hide)
   - Filtered out before rendering
   - User only sees approval response, not raw output

## Testing

Verified against database `~/agent-world/database.db`:
- Chat ID: `chat-1762867765652-31noahu18`
- Total tool messages: 21
- Approval messages: 1 (ID 132935) - properly detected and displayed
- Regular results: 20 - properly filtered out

## Benefits

- Cleaner UI: No verbose tool execution output
- Preserved approval flow: Users see approval decisions
- Clear separation: Approval responses vs execution results
- No breaking changes: Existing approval system works unchanged
