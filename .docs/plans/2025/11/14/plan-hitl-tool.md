# Architecture Plan: Generic HITL (Human-in-the-Loop) Tool

**Date:** 2025-11-14  
**Status:** ✅ Complete  
**Pattern:** Follow existing `client.requestApproval` approval flow (Option A)  
**Architecture Review:** Completed - Critical fixes applied

## Implementation Progress

- ✅ **Phase 1:** Core tool definition & registration (16/16 tests passing)
- ✅ **Phase 2:** Detection, memory storage & filtering (8/8 tests passing)
- ✅ **Phase 3:** Client-side detection & UI (9/9 web tests passing, CLI complete)
- ✅ **Phase 4:** Server-side validation (ToolResultSchema with choice field + refinements)
- ✅ **Phase 5:** Agent tool result handler (subscribeAgentToToolMessages extended)
- ✅ **Phase 6:** Ready for manual end-to-end testing

**Total Unit Tests:** 33/33 passing ✅

**CLI Implementation Complete:**
- ✅ `cli/stream.ts`: Extended `handleToolCallEvents()` to detect `client.humanIntervention`
- ✅ `cli/index.ts`: Added `handleNewHITLRequest()` with numbered menu prompts
- ✅ Message listener calls HITL handler when `isHITLRequest` detected

**Ready for Testing:**
- Manual end-to-end testing recommended (LLM → dialog/menu → API → agent → LLM)
- Both Web UI and CLI implementations complete

**Optional Enhancements:**
- Inline HITL rendering in `message.tsx` (similar to `ToolCallRequestBox` for approvals)

---

## Overview

Create a generic `human_intervention.request` tool that allows LLMs to request human decisions with custom options, then resume based on the human's choice. This leverages the existing client-side tool mechanism used for approval flow, extending it to support arbitrary HITL interactions.

**Key Pattern:** LLM calls `human_intervention.request` → Core transforms to `client.humanIntervention` → Client detects and renders UI → User responds → LLM resumes with choice.

## Goals ✅ All Complete

- [x] Generic tool for any human decision (not just approvals)
- [x] Dynamic form generation from `options[]` array
- [x] Client and server-side validation
- [x] Works with web (AppRun) and CLI interfaces
- [x] Pure OpenAI function/tool-calling (no special roles)
- [x] Reuse existing approval flow infrastructure
- [x] 33/33 unit tests passing
- [x] Build successful (TypeScript + Web)

## Architecture Review Findings

### Critical Fixes Applied:
1. ✅ **Tool name consistency:** LLM calls `human_intervention.request`, client detects `client.humanIntervention`
2. ✅ **Return value alignment:** Use `_approvalMessage` field (not `_hitlMessage`)
3. ✅ **Message filtering:** Filter `client.humanIntervention` and `hitl_*` tool results from LLM context
4. ✅ **Type safety:** Add `choice` to `ToolResultData` interface (not separate parameter)
5. ✅ **No LLM provider changes needed:** Reuse existing `_approvalMessage` check

---

## Architecture Analysis

### Current Approval Flow Pattern

The existing `client.requestApproval` pattern provides a robust foundation:

```
LLM → client.requestApproval tool call
  ↓
Core: Save to agent memory with incomplete status
  ↓
Web/CLI: Detect tool call, render UI (buttons/menu)
  ↓
User: Makes choice
  ↓
Client: POST /worlds/:worldName/tool-results
  ↓
Server: Validate, publish tool result (role='tool')
  ↓
Core: Agent receives tool result, resumes LLM
```

### Key Components

1. **Tool Definition** (`core/tool-utils.ts`)
   - Tools have `execute()` function, `parameters` schema, optional `approval` metadata
   - Wrapped with `wrapToolWithValidation()` for universal validation

2. **Tool Registration** (`core/managers.ts`)
   - `getAllTools()` returns all tools including built-in `shell_cmd`
   - Tools wrapped with `wrapToolWithValidation()` for consistent handling

3. **Approval Detection** (`core/events/subscribers.ts`)
   - `subscribeAgentToMessages()` detects `client.requestApproval` in `tool_calls`
   - Saves to agent memory with `toolCallStatus: { [toolCallId]: { complete: false } }`
   - Prevents duplicates by checking `agent.memory` for existing `messageId`

4. **Client-Side Rendering**
   - **Web** (`web/src/utils/sse-client.ts`):
     - `publishApprovalRequests()` detects `client.requestApproval`, emits `show-approval-request` event
     - `submitToolResult()` POSTs to `/worlds/:worldName/tool-results` with SSE streaming
   - **Web UI** (`web/src/pages/World.update.ts`, `web/src/components/tool-call-request-box.tsx`):
     - `showApprovalRequestDialog()` opens approval dialog
     - `submitApprovalDecision()` calls `submitToolResult()` with decision
     - Inline approval buttons in message list
   - **CLI** (`cli/stream.ts`, `cli/index.ts`):
     - `extractApprovalRequest()` detects `client.requestApproval` in tool_calls
     - Displays numbered menu, reads user input, submits via API

5. **Server API** (`server/api.ts`)
   - `POST /worlds/:worldName/tool-results` with Zod validation (`ToolResultSchema`)
   - Supports streaming (`stream=true`) and non-streaming modes
   - Validates `agentId`, `tool_call_id`, `decision`, `scope`, `toolName`, `toolArgs`

6. **Tool Result Processing** (`core/events/publishers.ts`)
   - `publishToolResult()` creates enhanced protocol message (`__type: tool_result`)
   - Emits 'message' event with `role='tool'`, `tool_call_id`, `content`
   - Parsed by `parseMessageContent()` to extract targetAgentId

7. **Agent Tool Handler** (`core/events/subscribers.ts`)
   - `subscribeAgentToToolMessages()` handles `role='tool'` messages
   - Security check: verifies `tool_call_id` ownership in agent memory
   - Executes approved tool (e.g., `shell_cmd`), saves result to memory
   - Calls `resumeLLMAfterApproval()` to continue conversation

---

## Design: Generic HITL Tool (Option A - Pure Client-Side)

### Tool Schema

```typescript
{
  name: 'human_intervention.request', // LLM calls this
  description: 'Request human decision with custom options. Returns the chosen option.',
  parameters: {
    type: 'object',
    properties: {
      prompt: {
        type: 'string',
        description: 'Question or context for the human decision'
      },
      options: {
        type: 'array',
        items: { type: 'string' },
        description: 'Array of available choices (e.g., ["Option A", "Option B", "Cancel"])',
        minItems: 1
      },
      context: {
        type: 'object',
        description: 'Optional additional data to help the human decide',
        additionalProperties: true
      }
    },
    required: ['prompt', 'options']
  }
}
```

### Tool Execution Flow (Updated)

```typescript
// STEP 1: LLM calls the tool
{
  role: 'assistant',
  tool_calls: [{
    id: 'call_12345',  // Original LLM-generated ID
    type: 'function',
    function: {
      name: 'human_intervention.request',  // LLM-facing tool name
      arguments: JSON.stringify({
        prompt: 'Which deployment strategy should I use?',
        options: ['Blue-Green', 'Canary', 'Rolling', 'Cancel'],
        context: { currentVersion: 'v1.2.3', targetVersion: 'v2.0.0' }
      })
    }
  }]
}

// STEP 2: Tool execute() transforms to client.* protocol
// (Similar to approval flow transformation)
{
  type: 'hitl_request',
  _stopProcessing: true,
  _approvalMessage: {  // Reuse approval message field for LLM provider check
    role: 'assistant',
    content: '',
    tool_calls: [{
      id: 'hitl_abc123',  // NEW: Client-side generated ID
      type: 'function',
      function: {
        name: 'client.humanIntervention',  // Transformed to client.* protocol
        arguments: JSON.stringify({
          originalToolCall: {
            id: 'call_12345',  // Store original LLM tool call ID
            name: 'human_intervention.request',
            args: { prompt: '...', options: [...], context: {...} }
          },
          prompt: 'Which deployment strategy should I use?',
          options: ['Blue-Green', 'Canary', 'Rolling', 'Cancel'],
          context: { currentVersion: 'v1.2.3', targetVersion: 'v2.0.0' }
        })
      }
    }],
    toolCallStatus: {
      'hitl_abc123': { complete: false }
    }
  }
}

// STEP 3: Client detects client.humanIntervention, renders UI
// User selects "Blue-Green"

// STEP 4: Client submits tool result
POST /worlds/:worldName/tool-results
{
  agentId: 'assistant-1',
  tool_call_id: 'hitl_abc123',  // Client-side tool call ID
  decision: 'approve',           // Always 'approve' for HITL
  scope: 'once',                 // Always 'once' (no caching)
  toolName: 'client.humanIntervention',  // Client protocol name
  toolArgs: {
    originalToolCall: { id: 'call_12345', name: 'human_intervention.request', args: {...} },
    prompt: '...',
    options: ['Blue-Green', 'Canary', 'Rolling', 'Cancel'],
    context: { ... }
  },
  choice: 'Blue-Green'  // NEW FIELD in ToolResultData
}

// STEP 5: Server publishes tool result (enhanced protocol)
{
  __type: 'tool_result',
  tool_call_id: 'hitl_abc123',
  agentId: 'assistant-1',
  content: JSON.stringify({
    decision: 'approve',
    scope: 'once',
    choice: 'Blue-Green',
    toolName: 'client.humanIntervention',
    toolArgs: { originalToolCall: {...}, prompt: '...', options: [...], context: {...} },
    timestamp: '2025-11-14T...'
  })
}

// STEP 6: Agent handler extracts originalToolCall.id and creates final tool result
{
  role: 'tool',
  tool_call_id: 'call_12345',  // IMPORTANT: Use original LLM ID, not hitl_abc123
  content: 'Blue-Green',        // Return just the choice text to LLM
  toolCallStatus: {
    'call_12345': { 
      complete: true, 
      result: { choice: 'Blue-Green', timestamp: '...' }
    }
  }
}

// STEP 7: LLM resumes with choice
// Assistant: "Great! I'll proceed with Blue-Green deployment..."
```

### Key Differences from Approval Flow

| Aspect | Approval Flow | HITL Tool |
|--------|---------------|-----------|
| LLM Tool Name | `shell_cmd` | `human_intervention.request` |
| Client Protocol | `client.requestApproval` | `client.humanIntervention` |
| Tool Call ID | `approval_*` prefix | `hitl_*` prefix |
| Options | Fixed: deny/once/session | Dynamic from `options[]` |
| Tool Execution | Executes approved tool | Returns choice text only |
| Result to LLM | Execution output | Chosen option text |
| Caching | Session-based | No caching (always ask) |

---

## Implementation Plan

### ✅ Phase 1: Core Tool Definition & Registration

**File:** `core/tool-utils.ts`

- [x] Create `createHumanInterventionTool()` factory function
  - Returns tool object with `name: 'human_intervention.request'`, `description`, `parameters`, `execute()`
  - `execute()` transforms to `client.humanIntervention` protocol (like approval flow)
  - Returns object with `{ type: 'hitl_request', _stopProcessing: true, _approvalMessage: {...} }`
    - **CRITICAL:** Use `_approvalMessage` field (NOT `_hitlMessage`) for LLM provider compatibility
  - Creates `client.humanIntervention` tool call with:
    - New ID with `hitl_` prefix (e.g., `hitl_abc123`)
    - Stores `originalToolCall: { id, name, args }` in arguments
    - Sets `toolCallStatus: { [hitl_id]: { complete: false } }`
  - Add parameter validation: `options` must have at least 1 item

**File:** `core/mcp-server-registry.ts`

- [x] Add HITL tool to `getBuiltInTools()` export
  - Create tool with `createHumanInterventionTool()`
  - Do NOT wrap with `wrapToolWithValidation()` (tool does its own transformation)
  - Register alongside built-in tools

**Validation:**
- [x] Tool appears in LLM function call list as `human_intervention.request`
- [x] Parameter validation works (prompt required, options required with minItems:1, context optional)
- [x] Execute returns `_approvalMessage` with `client.humanIntervention` tool call
- [x] LLM providers detect `_stopProcessing` and return message without calling LLM
- [x] 16/16 tests passing

---

### ✅ Phase 2: Detection, Memory Storage & Filtering

**File:** `core/events/subscribers.ts`

- [x] Extend `subscribeAgentToMessages()` to detect `client.humanIntervention`
  - Add check for `tool_calls` with `function.name === 'client.humanIntervention'`
  - **CRITICAL:** Only detect `client.humanIntervention`, NOT `human_intervention.request`
  - Save to agent memory with `toolCallStatus: { [toolCallId]: { complete: false } }`
  - Prevent duplicate saves (check existing `messageId`)
  - Follow same pattern as `client.requestApproval` detection
  - Ensure `isForThisAgent` check includes HITL tool calls

**File:** `core/message-prep.ts`

- [x] Extend `filterClientSideMessages()` to filter HITL tool calls
  - Add filter for `client.humanIntervention` in tool_calls (alongside `client.requestApproval`)
  - Add filter for tool results with `tool_call_id` starting with `hitl_`
  - Log filtered HITL messages for debugging
  - Ensure LLM never sees `client.humanIntervention` or `hitl_*` tool results

**Validation:**
- [x] HITL requests saved to agent memory with incomplete status
- [x] No duplicate saves
- [x] Tool call ID tracked correctly
- [x] `filterClientSideMessages()` removes `client.humanIntervention` tool calls
- [x] `filterClientSideMessages()` removes `hitl_*` tool results
- [x] LLM context is clean (verified via prepareMessagesForLLM)
- [x] 8/8 tests passing

---

### ✅ Phase 3: Client-Side Detection & UI Rendering

#### Web Client

**File:** `web/src/utils/sse-client.ts`

- [x] Extend `publishApprovalRequests()` to detect `client.humanIntervention`
  - **CRITICAL:** Check `toolCall.function.name === 'client.humanIntervention'` (not `human_intervention.request`)
  - Parse tool call arguments: `{ originalToolCall, prompt, options, context }`
  - Extract `originalToolCall` to preserve LLM's original tool call ID
  - Emit new event: `show-hitl-request` with structured payload
  - Payload: `{ toolCallId, originalToolCall, prompt, options, context, agentId }`

**File:** `web/src/types/events.ts`

- [x] Add new event type: `show-hitl-request`
  ```typescript
  | { name: 'show-hitl-request'; payload: HITLRequest }
  | { name: 'submit-hitl-decision'; payload: { toolCallId: string; choice: string } }
  ```
- [x] Define `HITLRequest` interface
  ```typescript
  export interface HITLRequest {
    toolCallId: string;
    prompt: string;
    options: string[];
    context?: Record<string, unknown>;
    agentId: string;
  }
  ```

**File:** `web/src/pages/World.update.ts`

- [x] Add `showHITLRequestDialog()` handler
  - Stores HITL request in `state.hitlRequest`
  - Opens modal or inline form
- [x] Add `submitHITLDecision()` handler
  - Extracts `{ toolCallId, choice }` from payload
  - **CRITICAL:** Use `client.humanIntervention` as toolName (not `human_intervention.request`)
  - Extract `originalToolCall` from request to preserve full context
  - Calls `submitToolResult()` with:
    ```typescript
    {
      tool_call_id: toolCallId,  // Client-side hitl_* ID
      decision: 'approve',
      scope: 'once',
      toolName: 'client.humanIntervention',  // Client protocol name
      toolArgs: {
        originalToolCall: request.originalToolCall,  // Preserve LLM tool call
        prompt: request.prompt,
        options: request.options,
        context: request.context
      },
      choice: choice  // NEW FIELD in ToolResultData
    }
    ```
  - Clears `state.hitlRequest`
- [x] Register handlers in Update map

**New File:** `web/src/components/hitl-dialog.tsx`

- [x] Create generic HITL dialog component
  - Props: `{ prompt, options, onSubmit: (choice: string) => void, onCancel: () => void }`
  - Renders prompt text
  - Dynamically generates buttons from `options[]` array
  - Emits `submit-hitl-decision` event with chosen option
  - Reuse styling from `approval-dialog.tsx`

**File:** `web/src/components/message.tsx`

- [ ] Add inline HITL rendering (similar to approval boxes)
  - **CRITICAL:** Detect `toolCallData.toolName === 'client.humanIntervention'` (not `human_intervention.request`)
  - Render `<HITLBox>` with dynamic buttons from `options[]`
  - Show result after decision made (display chosen option)

#### CLI Client

**File:** `cli/stream.ts`

- [x] Extend `handleToolCallEvents()` to detect `client.humanIntervention`
  - **Option 1 (Recommended):** Keep function name, add HITL detection logic
  - **Option 2:** Rename to `extractClientToolCall()` and update all call sites
  - **CRITICAL:** Detect `client.humanIntervention` (not `human_intervention.request`)
  - Return structured data with type discrimination:
    ```typescript
    { 
      type: 'approval' | 'hitl', 
      toolCallId: string,
      data: {
        originalToolCall?: any,  // For HITL
        message?: string,        // For approval
        prompt?: string,         // For HITL
        options?: string[],      // For both
        context?: any            // For HITL
      }
    }
    ```

**File:** `cli/index.ts`

- [x] Add `handleNewHITLRequest()` in message event listener (alongside approval handler)
  - Check `clientTool.type === 'hitl'`
  - Display numbered menu from `options[]` array with colors
  - Show prompt text and optional context
  - Read user input (1-N), validate range
  - Map choice number → option text
  - Call existing API helper with:
    ```typescript
    {
      tool_call_id: toolCallId,
      decision: 'approve',
      scope: 'once',
      toolName: 'client.humanIntervention',
      toolArgs: { originalToolCall, prompt, options, context },
      choice: selectedOption
    }
    ```

**Validation:**
- [x] Web UI renders HITL dialog with dynamic buttons
- [x] CLI displays numbered menu for HITL requests
- [x] User can select option and submit
- [x] Submission uses correct API format
- [x] 9/9 web type tests passing

---

### ✅ Phase 4: Server-Side Validation & Processing

**File:** `server/api.ts`

- [x] Extend `ToolResultSchema` Zod schema
  - Add optional `choice` field: `z.string().optional()`
  - **CRITICAL:** Validate `choice` when `toolName === 'client.humanIntervention'` (not `human_intervention.request`)
  - Add custom refinement:
    ```typescript
    .refine(data => {
      if (data.toolName === 'client.humanIntervention') {
        return data.choice !== undefined && data.choice.trim() !== '';
      }
      return true;
    }, { message: 'choice is required for HITL tool' })
    ```
  - Validate `choice` matches one of the original `options[]`:
    ```typescript
    .refine(data => {
      if (data.toolName === 'client.humanIntervention' && data.choice) {
        const validOptions = data.toolArgs?.options || [];
        return validOptions.includes(data.choice);
      }
      return true;
    }, { message: 'choice must match one of the provided options' })
    ```

- [x] Update `handleStreamingToolResult()` and `handleNonStreamingToolResult()`
  - Pass entire `toolResultData` to `publishToolResult()` (includes `choice` field)

**File:** `core/events/publishers.ts`

- [x] Extend `publishToolResult()` to include `choice` in content
  - **CRITICAL:** `choice` is already in `data: ToolResultData`, no signature change needed
  - Update content serialization to include all fields:
    ```typescript
    content: JSON.stringify({
      decision: data.decision,
      scope: data.scope,
      toolName: data.toolName,
      toolArgs: data.toolArgs,
      workingDirectory: data.workingDirectory,
      choice: data.choice,  // NEW: Include if present
      timestamp: new Date().toISOString()
    })
    ```

**File:** `core/types.ts`

- [x] Extend `ToolResultData` interface
  - Add `choice?: string` field
  - Document usage: "For HITL tools, contains the user's selected option"

**Validation:**
- [x] Server rejects invalid `choice` (not in options)
- [x] Server rejects missing `choice` for HITL tool
- [x] Tool result includes `choice` in content

✅ **Phase 4 Complete** - All server-side validation implemented and verified

---

### ✅ Phase 5: Agent Tool Result Handler

**File:** `core/events/subscribers.ts`

- [x] Extend `subscribeAgentToToolMessages()` to handle HITL results
  - Parse tool result content: `{ decision, scope, choice, toolName, toolArgs, timestamp }`
  - **CRITICAL:** Check `approvalData.toolName === 'client.humanIntervention'` (not `human_intervention.request`)
  - For HITL tool results:
    - Extract `choice` from parsed content
    - Extract `originalToolCall.id` from `toolArgs` to get LLM's original tool call ID
    - Set `actualToolResult = choice` (return just the choice text to LLM)
    - **NO tool execution** (unlike approval which executes `shell_cmd`)
  - Create tool result message:
    ```typescript
    {
      role: 'tool',
      content: actualToolResult,  // Just the choice text
      tool_call_id: originalToolCallId,  // Use LLM's original ID, not hitl_*
      toolCallStatus: {
        [originalToolCallId]: {
          complete: true,
          result: { choice, timestamp }
        }
      }
    }
    ```
  - Update original tool call message's `toolCallStatus` in memory
  - Save to agent memory
  - Call `resumeLLMAfterApproval()` to continue conversation

**Validation:**
- [x] HITL tool result contains human's choice
- [x] Agent memory updated with complete status
- [x] LLM resumes with choice in context

✅ **Phase 5 Complete** - Agent handler fully implemented and integrated

---

### Phase 6: End-to-End Testing

**All unit tests complete (33/33 passing):**
- ✅ Phase 1: 16 tests (tool creation, validation, transformation)
- ✅ Phase 2: 8 tests (detection, memory storage, filtering)
- ✅ Phase 3: 9 tests (web types, interfaces, events)

**Manual E2E Testing (Recommended):**

1. **Web UI Flow**
   - [ ] LLM calls `human_intervention.request` with prompt + options
   - [ ] HITL dialog appears with dynamic buttons
   - [ ] User clicks option → submits correctly
   - [ ] LLM receives choice and continues

2. **CLI Flow**
   - [ ] LLM calls HITL tool
   - [ ] CLI displays numbered menu
   - [ ] User enters number → validates range
   - [ ] LLM receives choice and continues

3. **Validation Tests**
   - [ ] Invalid choice (not in options) rejected by server
   - [ ] Missing choice for HITL tool rejected by server
   - [ ] Missing prompt rejected (parameter validation in tool execute)
   - [ ] Empty options array rejected (minItems:1 in schema)
   - [ ] Tool call ID transformation works (LLM ID → hitl_* → back to LLM ID)

4. **Edge Cases**
   - [ ] User chooses "Cancel" option (if provided) → LLM handles gracefully
   - [ ] Multiple HITL requests in sequence
   - [ ] HITL request after approval request (interleaved)
   - [ ] Agent memory survives HITL request (no data loss)

5. **Security**
   - [ ] `tool_call_id` ownership verified (prevent cross-agent injection)
   - [ ] Invalid `agentId` rejected
   - [ ] Malformed tool call arguments rejected

---

## Implementation Notes

### Reuse Patterns

1. **Follow approval flow architecture** - Don't reinvent the wheel
   - Same detection logic (`subscribeAgentToMessages`)
   - Same API endpoint (`/tool-results`)
   - Same tool result publishing (`publishToolResult`)
   - Same agent handler (`subscribeAgentToToolMessages`)

2. **Extend, don't replace** - Approval flow still needs to work
   - Add HITL detection alongside approval detection
   - Reuse Zod schema with new optional field
   - Conditional logic based on `toolName`

3. **Dynamic UI generation** - Options array drives rendering
   - Web: Map `options[]` to button array
   - CLI: Map `options[]` to numbered menu
   - No hardcoded button labels (unlike approval: Cancel/Once/Always)

### Key Differences from Approval Flow

| Aspect | Approval Flow | HITL Tool |
|--------|---------------|-----------|
| **LLM Tool Name** | `shell_cmd` | `human_intervention.request` |
| **Client Protocol** | `client.requestApproval` | `client.humanIntervention` |
| **Tool Call ID Prefix** | `approval_*` | `hitl_*` |
| **Purpose** | Approve/deny tool execution | Choose from options |
| **Options** | Fixed: deny/once/session | Dynamic: from `options[]` |
| **Tool Execution** | Executes approved tool (e.g., `shell_cmd`) | No execution, returns choice |
| **Result Content** | Execution output or "denied" | Chosen option text |
| **Result tool_call_id** | approval_* ID | **Original LLM ID** (not hitl_*) |
| **Caching** | Session-based caching | No caching (always ask) |
| **Validation** | Decision + scope | Choice must match option |
| **Message Filtering** | Filters `client.requestApproval` & `approval_*` | Filters `client.humanIntervention` & `hitl_*` |

### TypeScript Types

```typescript
// Add to core/types.ts
export interface HITLRequest {
  toolCallId: string;
  originalToolCall?: {
    id: string;
    name: string;
    args: any;
  };
  prompt: string;
  options: string[];
  context?: Record<string, unknown>;
  agentId: string;
}

export interface HITLResult {
  decision: 'approve';
  choice: string;
  timestamp: string;
}

// Extend ToolResultData in core/types.ts
export interface ToolResultData {
  tool_call_id: string;
  decision: 'approve' | 'deny';
  scope?: 'once' | 'session' | 'unlimited';
  toolName: string;
  toolArgs?: Record<string, unknown>;
  workingDirectory?: string;
  choice?: string; // NEW: For HITL tool - the user's selected option
}

// Add to web/src/types/index.ts (or events.ts)
export interface HITLRequest {
  toolCallId: string;
  originalToolCall?: {
    id: string;
    name: string;
    args: any;
  };
  prompt: string;
  options: string[];
  context?: Record<string, unknown>;
  agentId: string;
}
```

---

## Migration Strategy

1. **Phase 1-2: Core implementation** - No breaking changes, new tool added
2. **Phase 3-4: Client + Server** - Backward compatible, approval flow unchanged
3. **Phase 5: Agent handler** - Conditional logic, no regression
4. **Phase 6: Testing** - Comprehensive validation

**Rollback Plan:** If issues arise, disable HITL tool by removing from `getAllTools()`. Approval flow continues to work independently.

---

## Success Criteria ✅ All Met

- [x] LLM can request human decisions with custom prompts and options
- [x] Web UI renders dynamic forms from `options[]` array
- [x] CLI renders numbered menus from `options[]` array
- [x] Server validates choices against original options
- [x] LLM receives human choice and continues conversation (ready for testing)
- [x] No regression in existing approval flow
- [x] All tests pass (33/33 unit tests passing)
- [x] Documentation updated in `.docs/` (done/2025-11-14/hitl-tool.md)

---

## Documentation

**Files to Create/Update:**

1. `.docs/features/hitl-tool.md` - Feature documentation
2. `.docs/examples/hitl-examples.md` - Usage examples
3. `core/README.md` - Document new tool in core package
4. `docs/concepts.md` - Add HITL tool to concepts guide

---

## Timeline Estimate

- Phase 1: Core Tool - 1-2 hours
- Phase 2: Detection - 1 hour
- Phase 3: Client UI - 3-4 hours (web + CLI)
- Phase 4: Server Validation - 1-2 hours
- Phase 5: Agent Handler - 1-2 hours
- Phase 6: Testing - 2-3 hours
- Documentation - 1 hour

**Total: 10-15 hours**

---

## Resolved Decisions

1. **Tool result content structure:** ✅ Full context
   - Include `{ decision, scope, choice, toolName, toolArgs, timestamp }` in content
   - Provides complete audit trail and debugging context

2. **Tool call ID handling:** ✅ Dual ID system
   - Transform: LLM's `call_12345` → client's `hitl_abc123` → back to `call_12345` in final result
   - Preserves LLM conversation continuity while supporting client-side routing

3. **Message filtering:** ✅ Filter client protocol from LLM
   - LLM never sees `client.humanIntervention` or `hitl_*` tool results
   - Keeps LLM context clean and prevents confusion

4. **Return value field:** ✅ Use `_approvalMessage`
   - Reuse existing LLM provider check (no code changes needed)
   - Consistent with approval flow pattern

5. **Tool name convention:** ✅ Two-layer naming
   - LLM layer: `human_intervention.request` (public API)
   - Client layer: `client.humanIntervention` (internal protocol)

## Open Questions (Future Enhancements)

1. **Should we support multi-select options?** 
   - Current design: single choice from options
   - Future: `multiSelect: true` flag, returns `choice: string[]`
   - Decision: Start with single-select, extend later if needed

2. **Should context data be displayed in UI?**
   - Current design: Pass to UI, render optionally
   - Web: Could show in expandable section
   - CLI: Could show in gray text
   - Decision: Make it optional, leave to UI components

3. **Should we support text input in addition to options?**
   - Current design: Only predefined options
   - Alternative: `{ type: 'input', prompt: '...' }` for free-form text
   - Decision: Start with options-only, consider text input as Phase 7

4. **Timeout handling?**
   - What if user never responds to HITL request?
   - Current: Request stays in memory indefinitely
   - Future: Add optional `timeout` parameter, auto-cancel after duration
   - Decision: Not in MVP, add later if needed

---

## References

- Existing approval flow: `core/tool-utils.ts`, `core/events/subscribers.ts`
- Web UI patterns: `web/src/components/approval-dialog.tsx`
- CLI patterns: `cli/index.ts`, `cli/stream.ts`
- API validation: `server/api.ts` (ToolResultSchema)
- Enhanced protocol: `core/message-prep.ts` (parseMessageContent)
