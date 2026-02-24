# HITL Approval Flow (Core, Electron, Web, CLI)

This document explains how Human-in-the-Loop (HITL) approval works in the current codebase.

## Purpose

HITL provides world-scoped human interaction gates for actions that require user confirmation or selection.
The runtime is options-only, so features request selectable choices and block until:

- a user selects an option, or
- the request times out and uses a deterministic default option.

Current policy:

- `human_intervention_request` (LLM-initiated HITL tool) is options-only.
- System-enforced approvals (`create_agent`, `load_skill`) are also options-only.
- While a HITL prompt is pending in UI, sending a new chat message is blocked until prompt resolution.

## Core Runtime

Primary implementation: `core/hitl.ts`.

## Route Separation

HITL interactions use two distinct initiation routes that share the same runtime and client UI plumbing:

- System-enforced approval route:
  - initiated inside specific tools/features (`create_agent`, `load_skill`) via `requestWorldOption(...)`.
- LLM-initiated HITL route:
  - initiated by built-in `human_intervention_request`.

Both routes resolve through the same response API (`submitWorldHitlResponse`) and the same client queue/UI rendering.

### Data Model

- Request API: `requestWorldOption(world, request)`
- Response API: `submitWorldOptionResponse({ worldId, requestId, optionId })`
- Response API (shared): `submitWorldHitlResponse({ worldId, requestId, optionId })`
- Pending requests are stored in-memory in a process-local map:
  - key: `worldId::requestId`
  - value includes allowed option IDs, resolver, timeout handle, and chat scope.

### Request Lifecycle

When `requestWorldOption()` is called:

1. Options are normalized and deduplicated.
2. `requestId` is resolved (provided or generated).
3. `chatId` is resolved (`request.chatId` or `world.currentChatId`).
4. Default option is resolved:
   - preferred default if valid
   - else `no` if present
   - else first option.
5. Pending entry is inserted into the map.
6. A world `system` event is emitted with payload:
   - `eventType: "hitl-option-request"`
   - request metadata (`requestId`, title, message, options, defaultOptionId, timeoutMs, metadata).
7. The Promise remains pending until response or timeout.

### Resolution Lifecycle

When `submitWorldOptionResponse()` or `submitWorldHitlResponse()` is called:

1. Validates `worldId`, `requestId`, `optionId`.
2. Looks up pending request by `worldId::requestId`.
3. Validates selected option against pending request option set.
4. Clears timeout, removes pending map entry.
5. Resolves requester promise with `{ source: "user", optionId, ... }`.

If request times out:

- pending entry is removed,
- promise resolves with `{ source: "timeout", optionId: defaultOptionId, ... }`.

## Where HITL Is Triggered Today

Current triggers in core include:

- `load_skill` performs a skill-level HITL gate before applying skill instructions.
- `create_agent` uses HITL for pre-create approval and post-create informational dismissal.
- Built-in `human_intervention_request` allows LLMs to ask a question, offer options, and optionally require confirm/cancel.
  - `human_intervention_request` requires options and does not allow free-text mode.

### `yes_once` vs `yes_in_session` (load_skill)

In `core/load-skill-tool.ts`, these options are handled differently:

- `yes_once`: approves only the current request and is not cached.
- `yes_in_session`: caches approval in-memory for the current runtime process.
- `no`: rejects the request and skill instructions are not loaded.

The cache key format is:

- `worldId::chatId::skillId`

That means approval is per-skill and scoped to world/chat context.

### Does approval apply to all skills?

No. Approval is not global.

- `yes_in_session` for one skill does not approve other skills.
- A different `skillId` requires its own HITL approval.

## Electron Flow

Relevant files:

- `electron/main-process/realtime-events.ts`
- `electron/main-process/message-serialization.ts`
- `electron/renderer/src/App.jsx`
- `electron/preload/bridge.ts`
- `electron/main-process/ipc-handlers.ts`
- `electron/shared/ipc-contracts.ts`

Flow:

1. Core emits world `system` event with `hitl-option-request`.
2. Electron main serializes and forwards as `chat:event` payload type `system`.
3. Renderer subscription handler parses system payload and enqueues prompt.
4. Inline HITL card is rendered in the message flow from queue (`hitlPromptQueue`).
5. User selects option.
6. Renderer calls preload bridge `respondHitlOption(...)`.
7. Main IPC handler delegates to `submitWorldHitlResponse(...)`.
8. Core resolves blocked request.

Invoke channel used for response:

- `hitl:respond` (`DESKTOP_INVOKE_CHANNELS.HITL_RESPOND`).

## Web Flow

Relevant files:

- `web/src/domain/hitl.ts`
- `web/src/pages/World.update.ts`
- `web/src/api.ts`
- `server/api.ts`

Flow:

1. Web receives `system` event over SSE stream.
2. `parseHitlPromptRequest()` validates/enriches request payload.
3. Request is added to `hitlPromptQueue`.
4. User responds via inline HITL card (current approval flows are option-based).
5. Web calls `api.respondHitlOption(...)`.
6. Server endpoint `POST /worlds/:worldName/hitl/respond` calls `submitWorldHitlResponse`.
7. Core resolves blocked request.

## CLI Flow

Relevant files:

- `cli/hitl.ts`
- `cli/index.ts`

Flow:

1. CLI listens to world `system` events.
2. `parseHitlPromptRequest()` parses HITL requests.
3. Interactive mode:
   - prompts user to choose by index or option ID,
   - submits via `submitWorldHitlResponse`.
4. Pipeline/non-interactive mode:
   - auto-submits deterministic default response to avoid blocking.

## End-to-End Sequence

```mermaid
sequenceDiagram
    participant Feature as Feature (e.g. load_skill)
    participant Core as core/hitl.ts
    participant Client as Electron/Web/CLI UI
    participant Bridge as IPC or REST

    Feature->>Core: requestWorldOption(world, request)
    Core-->>Client: world system event (hitl-option-request)
    Client->>Client: render queue + prompt user
    Client->>Bridge: submit selected option
    Bridge->>Core: submitWorldHitlResponse(worldId, requestId, optionId)
    Core-->>Feature: resolve promise with selected option
    Feature->>Feature: continue/abort based on option
```

## Validation and Guardrails

- Option IDs are validated against pending request option set.
- Responses for unknown/expired `requestId` are rejected (`accepted: false`).
- Timeout fallback is deterministic (no hanging waits).
- Scope is world-specific (`worldId::requestId`) to avoid cross-world collisions.
- Runtime is in-memory and process-local (not persisted across process restarts).

## Operational Notes

- Prompt visibility in clients depends on active event subscription for the target world/chat.
- Multiple pending requests are supported through unique `requestId` keys.
- For new HITL use cases, prefer `requestWorldOption()` rather than ad-hoc approval events.
- Web and Electron composers prevent sending new chat messages while HITL prompt queue is non-empty.
