# Generic HITL Tool - Implementation Complete

**Date:** November 14, 2025  
**Status:** ✅ Complete (33/33 tests passing)

## Overview

Successfully implemented a generic Human-in-the-Loop (HITL) tool that enables LLMs to request human decisions with dynamic options. The tool follows the existing approval flow pattern, supporting both Web UI and CLI interfaces.

## Architecture

**Tool Name Mapping:**
- **LLM Layer:** `human_intervention.request` (public API)
- **Client Layer:** `client.humanIntervention` (internal protocol)

**Flow:**
1. LLM calls `human_intervention.request` with prompt + options
2. Core transforms to `client.humanIntervention` protocol
3. Client (Web/CLI) detects tool call and renders UI
4. User selects option
5. API validates choice
6. Agent receives choice as tool result
7. LLM resumes with chosen value

## Implementation Summary

### Phase 1: Core Tool Definition & Registration ✅
**Files:** `core/tool-utils.ts`, `core/mcp-server-registry.ts`

- Created `createHumanInterventionTool()` with parameter validation
- Validates prompt (required, non-empty) and options (minItems:1, string[])
- Generates `hitl_*` tool call IDs for tracking
- Transforms to `client.humanIntervention` protocol
- Returns `_approvalMessage` structure (reuses LLM provider compatibility)
- Registered in built-in tools list

**Tests:** 16/16 passing

### Phase 2: Detection, Memory Storage & Filtering ✅
**Files:** `core/events/subscribers.ts`, `core/message-prep.ts`

- Extended `subscribeAgentToMessages()` to detect `client.humanIntervention`
- Saves HITL requests to agent memory with incomplete status
- Prevents duplicate saves
- Extended `filterClientSideMessages()` to remove client-side tools from LLM context
- Filters both `client.humanIntervention` and `hitl_*` tool results

**Tests:** 8/8 passing

### Phase 3: Client-Side Detection & UI ✅

#### Web UI
**Files:** `web/src/types/index.ts`, `web/src/types/events.ts`, `web/src/utils/sse-client.ts`, `web/src/components/hitl-dialog.tsx`, `web/src/pages/World.tsx`, `web/src/pages/World.update.ts`

- Added `HITLRequest` interface and `Message.hitlData` property
- Added three HITL events: `show-hitl-request`, `hide-hitl-request`, `submit-hitl-decision`
- Extended SSE client to detect `client.humanIntervention` and emit events
- Created `HITLDialog` component with dynamic button generation
- Added handlers: `showHITLRequestDialog()`, `hideHITLRequestDialog()`, `submitHITLDecision()`
- Integrated dialog into `World.tsx` component

#### CLI
**Files:** `cli/stream.ts`, `cli/index.ts`

- Extended `handleToolCallEvents()` to detect `client.humanIntervention`
- Created `handleNewHITLRequest()` with numbered menu prompts
- Message listener routes HITL requests to handler
- User selects option → API submission → agent receives choice

**Tests:** 9/9 passing (web types)

### Phase 4: Server-Side Validation ✅
**Files:** `server/api.ts`, `core/types.ts`

- Extended `ToolResultSchema` with optional `choice` field
- Added Zod refinements:
  - Approval requests: `decision` required
  - HITL requests: `choice` required and non-empty
- Updated `ToolResultData` interface with `choice?: string`

### Phase 5: Agent Tool Result Handler ✅
**Files:** `core/events/subscribers.ts`, `core/events/publishers.ts`

- Extended `subscribeAgentToToolMessages()` to handle HITL choices
- Detects `toolName === 'client.humanIntervention'`
- Extracts choice and returns as tool result content
- Extended `publishToolResult()` to include choice in content
- Uses same `resumeLLMAfterApproval()` mechanism

## Test Coverage

```
Phase 1: Core Tool (16 tests)
├─ Tool creation and schema validation
├─ Parameter validation (prompt, options)
├─ Transformation to client protocol
├─ Tool registration verification
└─ _approvalMessage structure

Phase 2: Detection & Filtering (8 tests)
├─ client.humanIntervention detection
├─ Memory storage with incomplete status
├─ Duplicate prevention
├─ Message filtering (tool_calls and results)
└─ Compatibility with approval flow

Phase 3: Web Types (9 tests)
├─ HITLRequest interface validation
├─ Message.hitlData properties
├─ WorldComponentState.hitlRequest
└─ HITL event types

Total: 33/33 tests passing ✅
```

## Key Design Decisions

1. **Two-Layer Naming:** Public API (`human_intervention.request`) vs internal protocol (`client.humanIntervention`)
2. **Reuse Approval Infrastructure:** Uses `_approvalMessage` field, no LLM provider changes needed
3. **Dynamic Options:** Options array generates UI buttons/menu items dynamically
4. **Message Filtering:** Client-side tools removed from LLM context automatically
5. **Dual ID System:** `hitl_*` IDs for tracking, maps back to original tool call ID
6. **Full Context Audit Trail:** Tool result includes full context for debugging

## Files Modified

### Core Package
- `core/tool-utils.ts` - Tool creation function
- `core/mcp-server-registry.ts` - Built-in tool registration
- `core/events/subscribers.ts` - Detection and agent handler
- `core/message-prep.ts` - Message filtering
- `core/events/publishers.ts` - Tool result publishing
- `core/types.ts` - ToolResultData interface

### Web Package
- `web/src/types/index.ts` - HITLRequest interface, Message.hitlData
- `web/src/types/events.ts` - HITL event types
- `web/src/utils/sse-client.ts` - SSE detection
- `web/src/components/hitl-dialog.tsx` - Dialog component (new)
- `web/src/pages/World.tsx` - Dialog integration
- `web/src/pages/World.update.ts` - Event handlers

### CLI Package
- `cli/stream.ts` - Tool call detection
- `cli/index.ts` - HITL handler with menu prompts

### Server Package
- `server/api.ts` - ToolResultSchema validation

### Tests
- `tests/core/hitl-tool-phase1.test.ts` - Core tool tests (new)
- `tests/core/hitl-tool-phase2.test.ts` - Detection/filtering tests (new)
- `tests/core/hitl-tool-phase3-web.test.ts` - Web type tests (new)

## Usage Example

```typescript
// LLM calls the tool
{
  name: 'human_intervention.request',
  parameters: {
    prompt: 'Choose deployment environment',
    options: ['staging', 'production', 'rollback'],
    context: {
      service: 'api-server',
      version: 'v2.1.0',
      commit: 'abc123'
    }
  }
}

// User sees (Web):
// 🤔 Human Input Required
// Request: Choose deployment environment
// Context: service: api-server, version: v2.1.0, commit: abc123
// [staging] [production] [rollback]

// User sees (CLI):
// 🤔 Human Input Required
// Request: Choose deployment environment
// Context:
//   service: api-server
//   version: v2.1.0
//   commit: abc123
// 
// Please select an option:
//   1. staging
//   2. production
//   3. rollback

// User selects "production" → LLM receives "production" as tool result
```

## Remaining Work

**Optional Enhancements:**
- Inline HITL rendering in `message.tsx` (similar to approval's `ToolCallRequestBox`)
- End-to-end manual testing recommended

## Success Metrics

- ✅ 33/33 unit tests passing
- ✅ Build successful (TypeScript compilation)
- ✅ Web UI implementation complete
- ✅ CLI implementation complete
- ✅ Server validation complete
- ✅ Agent handler complete
- ✅ Follows existing approval flow pattern
- ✅ No LLM provider changes required
