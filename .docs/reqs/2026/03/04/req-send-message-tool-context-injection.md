# REQ: Built-in send_message Tool With Context Injection

**Date:** 2026-03-04  
**Status:** Draft

---

## Overview

Add a new built-in tool named `send_message` that can send multiple messages to a world chat in a single call.

The tool must not rely on model-provided world/chat identifiers. Instead, it must resolve and inject required routing context (`worldId`, `chatId`) from trusted runtime context, similar to existing trusted context injection behavior used for working directory handling.

## Problem Statement

Tool-driven message dispatch currently lacks a dedicated built-in primitive for batching outbound messages to the active world/chat context. Existing routes require explicit world/chat handling outside a single tool contract.

Because world and chat identity are required for message dispatch and must remain chat-isolated, accepting those identifiers from tool arguments would risk context drift and cross-chat leakage.

## Goals

1. Introduce a built-in `send_message` tool available in all worlds.
2. Support sending an array of messages in one tool invocation.
3. Resolve `worldId` and `chatId` from trusted execution context, not from model arguments.
4. Preserve existing event/message isolation and queue semantics.
5. Keep tool behavior deterministic and validation-friendly.

## Functional Requirements

### FR-1: Built-in Tool Availability

- A new built-in tool named `send_message` must be registered in the built-in toolset.
- The tool must be returned by the world tool discovery path wherever built-in tools are exposed.

### FR-2: Array-based Message Input

- The tool must accept a required `messages` array.
- Each entry represents one outbound message request.
- Each message entry must follow one of these accepted forms:
1. string shorthand (treated as message content with default sender behavior)
2. object with required `content` string and optional `sender` string
- Empty content entries must be rejected as invalid for that item.

### FR-2.1: Per-item Routing Fields

- Message entries must not expose routing authority for `worldId` or `chatId`.
- If `worldId` or `chatId` fields are present on input entries, they may be ignored for compatibility but must never affect routing.

### FR-3: Trusted Context Injection

- The tool must require trusted runtime context containing world/chat routing information.
- `worldId` used for dispatch must be derived from trusted context world identity (`context.world.id`), not from tool arguments.
- `chatId` used for dispatch must be derived from trusted context (`context.chatId`) with trusted world fallback (`context.world.currentChatId`) when available.
- Any caller-provided `worldId` or `chatId` fields in arguments must not control dispatch routing.

### FR-4: Chat Isolation and Correct Routing

- All dispatched messages from one tool call must be routed to exactly one resolved chat scope.
- The tool must preserve world-level isolation and avoid cross-world or cross-chat leakage.
- If required context is unavailable, the tool must return a deterministic error payload and send nothing.

### FR-5: Queue and Publish Compatibility

- Dispatch behavior must align with existing queue-backed user-message ingress rules and immediate non-user behavior rules.
- The tool must not introduce behavior drift relative to current production dispatch boundaries.

### FR-6: Deterministic Output Contract

- The tool must return a deterministic JSON-string result summarizing:
1. resolved context used for routing
2. total requested messages
3. accepted/dispatched counts (dispatch to queue/immediate ingress boundary)
4. per-item validation or dispatch errors (if any)

### FR-6.1: Queue-aware Result Semantics

- Tool result counts must describe dispatch/enqueue outcomes only.
- The tool result must not claim downstream agent completion/response delivery.

### FR-7: Validation

- Tool parameter validation must reject malformed payloads (missing/empty `messages`, invalid entry shapes).
- Validation and normalization behavior must remain compatible with existing tool validation wrappers.

## Non-Functional Requirements

### NFR-1: Safety

- Routing identifiers must be trusted-context driven.
- The tool must not enable context spoofing through LLM-supplied arguments.

### NFR-2: Determinism

- Given the same valid input and trusted context, tool outcomes must be deterministic.

### NFR-3: Compatibility

- Existing tool contracts and existing message/event schemas must remain backward compatible.

## Acceptance Criteria

1. `send_message` appears in built-in tools for world tool retrieval.
2. Tool accepts a `messages` array and processes entries in order.
3. Dispatch uses trusted context `worldId/chatId`, not model arguments.
4. Missing context returns deterministic error and no message dispatch.
5. Message routing remains chat-isolated with no cross-chat leakage.
6. Tool returns deterministic JSON-string result with counts and per-item status.
7. At least one targeted unit test verifies context injection precedence.
8. At least one targeted unit test verifies array dispatch behavior.
9. Tool documentation and tests confirm that `worldId`/`chatId` in args or per-item payloads do not control routing.
10. Tool result terminology is queue-safe (`dispatched`/`enqueued`), not end-to-end delivery claims.

## Out of Scope

1. New transport protocol for message dispatch.
2. Changing canonical `WorldMessageEvent`/`WorldSSEEvent` schemas.
3. Cross-process queue redesign.
4. UI changes for composing or displaying messages.
