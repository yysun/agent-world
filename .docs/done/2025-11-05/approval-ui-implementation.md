# CLI Approval UI Implementation

**Date:** 2025-11-05  
**Status:** ✅ ALREADY IMPLEMENTED  
**Location:** `cli/index.ts` → `handleNewApprovalRequest()`

## Overview

The CLI **already has** a fully implemented approval UI that displays options for user selection, similar to the world selection interface. It uses the `enquirer` library with a `select` prompt type.

## Implementation Details

### Function: `handleNewApprovalRequest()`

**Location:** `cli/index.ts` lines 169-230

**Features:**
- 🔒 Visual indicator with emoji and colors
- 📋 Displays tool name, arguments, and message
- ✅ Dynamic option list based on available choices
- 🎯 Uses enquirer's select prompt (same as world selection)
- 🔄 Sends approval response back to world

### UI Flow

```
┌─────────────────────────────────────────┐
│ 🔒 Tool Approval Required               │
├─────────────────────────────────────────┤
│ Tool: execute_command                   │
│ Arguments:                              │
│   command: rm important.txt             │
│   directory: ./                         │
│ Details: This command will delete...    │
├─────────────────────────────────────────┤
│ How would you like to respond?          │
│ ❯ Deny                                  │
│   Approve Once                          │
│   Approve for Session                   │
└─────────────────────────────────────────┘
```

### Code Structure

```typescript
async function handleNewApprovalRequest(
  request: ApprovalRequest,
  rl: readline.Interface,
  world: any
): Promise<void> {
  const { toolName, toolArgs, message, options } = request;

  // 1. Display header
  console.log(`\n${boldYellow('🔒 Tool Approval Required')}`);
  console.log(`${gray('Tool:')} ${yellow(toolName)}`);

  // 2. Display arguments
  if (toolArgs && Object.keys(toolArgs).length > 0) {
    console.log(`${gray('Arguments:')}`);
    for (const [key, value] of Object.entries(toolArgs)) {
      const displayValue = typeof value === 'string' && value.length > 100
        ? `${value.substring(0, 100)}...`
        : String(value);
      console.log(`  ${gray(key + ':')} ${displayValue}`);
    }
  }

  // 3. Display message
  if (message) {
    console.log(`${gray('Details:')} ${message}`);
  }

  // 4. Create dynamic choices
  const choices = [];
  if (options.includes('deny')) {
    choices.push({ name: 'Deny', value: 'deny' });
  }
  if (options.includes('approve_once')) {
    choices.push({ name: 'Approve Once', value: 'approve_once' });
  }
  if (options.includes('approve_session')) {
    choices.push({ name: 'Approve for Session', value: 'approve_session' });
  }

  // 5. Show selection prompt (same as world selection)
  const { decision } = await enquirer.prompt({
    type: 'select',
    name: 'decision',
    message: 'How would you like to respond?',
    choices
  }) as { decision: string };

  // 6. Send approval response
  const approvalResponse = `${decision}:${toolName}`;
  await processCLIInput(approvalResponse, world, 'human');
}
```

## Comparison with World Selection

### World Selection
```typescript
const { worldName } = await enquirer.prompt({
  type: 'select',
  name: 'worldName',
  message: 'Select a world:',
  choices: worldList
});
```

### Approval Selection
```typescript
const { decision } = await enquirer.prompt({
  type: 'select',
  name: 'decision',
  message: 'How would you like to respond?',
  choices: [
    { name: 'Deny', value: 'deny' },
    { name: 'Approve Once', value: 'approve_once' },
    { name: 'Approve for Session', value: 'approve_session' }
  ]
});
```

**Both use the same pattern:**
- ✅ `enquirer.prompt()` with `type: 'select'`
- ✅ User-friendly choice names
- ✅ Return values for processing
- ✅ Async/await flow
- ✅ Error handling

## Usage Example

When a tool requires approval:

```bash
# Agent tries to execute a tool
> execute dangerous command

# CLI intercepts and shows approval UI
🔒 Tool Approval Required
Tool: execute_command
Arguments:
  command: rm -rf /
  directory: ./
Details: This command is dangerous and will delete files

How would you like to respond?
❯ Deny
  Approve Once
  Approve for Session

# User selects with arrow keys and Enter
# Response is sent back: "deny:execute_command"
```

## Integration Points

### 1. Tool Call Detection
**File:** `cli/stream.ts` → `handleToolCallEvents()`
```typescript
// Detects client.requestApproval tool calls
if (toolCall.function?.name === 'client.requestApproval') {
  return {
    isApprovalRequest: true,
    approvalData: { toolName, toolArgs, message, options }
  };
}
```

### 2. Event Handling
**File:** `cli/index.ts` → `handleWorldEvent()`
```typescript
// SSE message events
if (eventType === 'sse' && eventData.type === 'message') {
  const toolCallResult = handleToolCallEvents(eventData);
  if (toolCallResult?.isApprovalRequest) {
    await handleNewApprovalRequest(toolCallResult.approvalData, rl, world);
  }
}

// Regular message events
if (eventType === 'message' && eventData.tool_calls) {
  const toolCallResult = handleToolCallEvents(eventData);
  if (toolCallResult?.isApprovalRequest) {
    await handleNewApprovalRequest(toolCallResult.approvalData, rl, world);
  }
}
```

### 3. Response Processing
**File:** `cli/commands.ts` → `processCLIInput()`
```typescript
// Approval response format: "decision:toolName"
// Examples:
//   "deny:execute_command"
//   "approve_once:execute_command"
//   "approve_session:execute_command"
```

## Dynamic Option Support

The UI adapts to available options:

```typescript
// Example 1: All options
options = ['deny', 'approve_once', 'approve_session']
→ Shows all three choices

// Example 2: Limited options
options = ['deny', 'approve_once']
→ Shows only deny and approve once

// Example 3: No options (fallback)
options = []
→ Shows default: deny, approve_once, approve_session
```

## Argument Display

Long arguments are truncated for readability:

```typescript
const displayValue = typeof value === 'string' && value.length > 100
  ? `${value.substring(0, 100)}...`
  : String(value);
```

**Example:**
```
Arguments:
  command: rm important.txt
  path: /very/long/path/that/goes/on/and/on/and/on/and/on/and/on/and/on/and/...
  force: true
```

## Testing

**Unit Tests:** `tests/cli/tool-call-handling.test.ts` (25 tests)
- ✅ Approval request detection
- ✅ Data extraction and parsing
- ✅ Edge case handling
- ✅ OpenAI protocol compliance

**Manual Testing:**
1. Start CLI with world that has MCP tools
2. Execute command requiring approval
3. Verify selection UI appears
4. Test each option (deny, approve once, approve session)
5. Verify tool executes/blocks based on selection

## Status

✅ **FULLY IMPLEMENTED** - No changes needed

The CLI already has a proper selection UI for approval requests that works exactly like the world selection interface. It uses `enquirer` for consistent, user-friendly prompts with arrow key navigation.

## Related Files

- `cli/index.ts` - Main approval UI implementation
- `cli/stream.ts` - Tool call detection
- `cli/commands.ts` - Response processing
- `core/tool-utils.ts` - Approval checking logic
- `core/events.ts` - Approval flow coordination
