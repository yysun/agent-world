# Requirement: Explicit Agent Turn Loop Runner

**Date**: 2026-03-29
**Type**: Feature
**Status**: Completed

## Overview

Promote the existing post-tool continuation behavior into one explicit, named runtime unit that owns an agent turn from first model call through tool execution, handoff dispatch, persistence, continuation, and stop. The runtime already behaves like a loop in practice, but the ownership is currently split across `core/llm-manager.ts`, `core/events/memory-manager.ts`, queue/restore paths, and message publication side effects.

This requirement makes that loop first-class and durable without moving orchestration responsibility into provider clients.

## Problem Statement

The current runtime can already:

- call a model
- execute tools
- continue after tool results
- reconstruct pending HITL and tool state from persisted messages
- resume work after restore

However, those capabilities are not represented as one canonical turn runner. The current design has four practical limitations:

1. The turn loop is conceptually real but structurally fragmented across several modules and side-effect paths.
2. Completion is still inferred too heavily from assistant text rather than from explicit turn state.
3. Post-tool continuation currently executes only the first returned tool call, which is safe but artificially weak.
4. LLM concurrency control is broader than necessary because a global singleton queue serializes unrelated work across all worlds and chats.

The result is a runtime that behaves like an agent harness, but does not yet present or persist that behavior as one coherent turn-owned state machine.

## Goals

- Introduce one canonical runtime owner for an agent turn loop.
- Make turn state and terminal outcomes explicit, durable, and inspectable.
- Preserve the current provider split where providers remain pure model clients and the runtime owns orchestration.
- Preserve the current durability/recovery story for tools, HITL, restore, and interrupted work.
- Unify tool calls and agent handoffs under one action model owned by the loop runner.
- Define the loop so future batching or planner/critic extensions can be added without another orchestration rewrite.

## Non-Goals

- Rewriting provider clients to own orchestration.
- Replacing the existing message/event contracts for ordinary chat messages in this requirement.
- Introducing a fixed up-front planning script that the model must follow before acting.
- Enabling unrestricted multi-tool execution in one hop.
- Redesigning Electron or web UI in this requirement beyond what is needed to expose loop status later.

## Functional Requirements

### Canonical Loop Ownership

- **REQ-1**: The runtime must provide one canonical, named agent-turn loop entry point responsible for the full lifecycle of a single agent turn.
- **REQ-2**: The loop owner must cover, at minimum:
  - initial LLM call
  - action inspection
  - tool execution
  - post-tool continuation
  - agent handoff dispatch
  - stop/guardrail/timeout handling
  - persistence between hops
- **REQ-3**: The loop must be scoped explicitly to world, agent, and chat so execution and recovery remain chat-safe and world-isolated.
- **REQ-4**: The loop must remain the runtime authority for orchestration; providers must continue to act as pure model clients.

### Turn State and Terminal Outcome Model

- **REQ-5**: The loop must distinguish current turn state from terminal turn outcome instead of using one blended status list.
- **REQ-6**: Turn state and terminal outcome records must be durable enough for restore, replay, queue progression, and UI/runtime inspection.
- **REQ-7**: At minimum, the nonterminal turn-state model must represent:
  - `running`
  - `waiting_for_hitl`
  - `waiting_for_tool_result`
- **REQ-8**: `waiting_for_tool_result` must be reserved for a durable pause awaiting a resumable tool-related result or external continuation boundary. It must not be used as a synonym for ordinary inline synchronous tool execution that the runner is still actively processing in the same hop.
- **REQ-9**: At minimum, the terminal-outcome model must represent:
  - `completed`
  - `handoff_dispatched`
  - `guardrailed`
  - `cancelled`
  - `timed_out`
- **REQ-10**: Existing durable failed-turn recovery behavior must remain representable and must not be collapsed into ordinary completion.
- **REQ-11**: The turn-state and terminal-outcome model must align with the current user-turn lifecycle rule that a turn is not complete merely because assistant text or `tool-start` was emitted.

### Explicit Completion Signal

- **REQ-12**: The runtime must no longer rely on prompt wording alone to decide that an agent turn is done.
- **REQ-13**: Phase 1 shall use one canonical completion mechanism: structured completion metadata persisted with the terminal assistant response for that turn.
- **REQ-14**: Phase 1 shall not require a dedicated `complete_turn` built-in tool.
- **REQ-15**: Queue progression, restore/resume, and downstream orchestration must use the persisted completion metadata rather than inferring completion only from the existence of an assistant text message.

### Unified Action Model

- **REQ-16**: The loop must treat agent actions as one runtime-owned action model rather than as separate ad hoc continuations.
- **REQ-17**: At minimum, the action model must distinguish:
  - `tool_call`
  - `agent_handoff`
  - `final_response`
  - `hitl_request`
- **REQ-18**: For each action, the runtime must preserve a consistent lifecycle:
  - persist action intent
  - execute or enqueue dispatch
  - append durable result or wait artifact
  - continue or stop according to loop state
- **REQ-19**: A handoff performed through `send_message` must be treated as a loop-owned action outcome, not as an unrelated side path.

### Durability and Recovery

- **REQ-20**: The loop runner must preserve the current durable recovery guarantees for persisted tool execution, HITL prompts, and interrupted turns.
- **REQ-21**: Restore/replay must continue to reconstruct unresolved tool/HITL state from persisted artifacts rather than from transient in-memory state alone.
- **REQ-22**: Resume of a persisted in-flight turn must be idempotent. Repeating resume for the same persisted turn state must not duplicate tool calls, handoffs, assistant finalization, or queue advancement side effects.
- **REQ-23**: If a resume request targets a turn that is already terminal or already actively resumed, the runtime must converge by no-oping or rejoining the same pending state rather than creating a second concurrent loop instance for that turn.
- **REQ-24**: The loop runner must preserve strict world-level event isolation and chat-scoped execution ordering.
- **REQ-25**: The loop runner must preserve the current rule that only queue-owned user turns may auto-resume.

### Tool Execution Semantics

- **REQ-26**: The first delivery of the explicit loop runner must preserve the current conservative tool execution behavior for mutating or unsafe actions.
- **REQ-27**: The system must not require a redesign of the loop runner to later support bounded read-only multi-tool batches.
- **REQ-28**: Any future multi-tool batching support must remain bounded, deterministic, and policy-aware, with mutating tools remaining subject to stricter execution limits than read-only tools.

### Concurrency Control

- **REQ-29**: Correctness for a single chat turn must depend on per-chat serialization, not on a global one-at-a-time bottleneck across all worlds.
- **REQ-30**: The runtime may keep narrower concurrency controls such as per-chat serialization and optional per-world limits, but unrelated worlds/chats must not be forced through one global turn queue as a correctness requirement.
- **REQ-31**: Narrowing concurrency control must not weaken stop/cancel behavior or cross-chat isolation guarantees.

## Non-Functional Requirements

- **NFR-1 (Durability)**: Every hop in the loop must leave enough persisted state to explain whether the turn completed, is waiting, was cancelled, timed out, or requires recovery.
- **NFR-2 (Determinism)**: Given the same persisted transcript and action artifacts, restore/resume must converge to the same loop state.
- **NFR-3 (Isolation)**: Loop state, events, and continuation must remain isolated by world and chat.
- **NFR-4 (Maintainability)**: Turn orchestration must become easier to reason about than the current split ownership across continuation, queue, restore, and message publication code paths.
- **NFR-5 (Compatibility)**: Existing streaming, SSE, tool lifecycle visibility, queue semantics, and persisted message integrity rules must remain compatible.

## Constraints

- The provider layer must remain a pure client boundary.
- Existing `WorldMessageEvent` and `WorldSSEEvent` contracts must remain stable unless an explicitly coordinated follow-up requirement changes them.
- Existing queue rules remain in force:
  - queue is the only automatic resume authority for user turns
  - queue APIs remain user-turn-only
  - failed user turns do not auto-retry unless explicitly retried by the user
- Existing HITL durability and message-authoritative reconstruction guarantees remain in force.
- Existing durable tool lifecycle guarantees remain in force, including the rule that every persisted `tool-start` must reach a terminal partner or durable wait/recovery artifact.

## Phased Scope

### Phase 1

- Introduce the canonical loop runner.
- Add explicit turn-state and terminal-outcome semantics.
- Use structured completion metadata on the terminal assistant response as the single Phase 1 completion mechanism.
- Preserve the current single-tool continuation behavior for execution safety.
- Add idempotent resume semantics for persisted in-flight turns.

### Phase 2

- Narrow concurrency control from global serialization to per-chat serialization with optional per-world limits.
- Formalize loop action/result envelopes.
- Expose loop status to clients.

### Phase 3

- Add bounded read-only multi-tool batching.
- Consider optional planner/critic sub-loops only as an extension to the same explicit runner.

## Out of Scope

- Full planner-first orchestration.
- Unbounded multi-tool execution.
- Replacing current restore/durable-turn behavior with transient-only runtime state.
- Merging all assistant messages into a new execution-envelope format in this requirement.
- UI design details for how loop state is displayed.

## Acceptance Criteria

- [x] The system exposes one canonical runtime unit that owns a single agent turn loop end-to-end.
- [x] The runtime no longer relies solely on assistant text presence to infer that a turn is complete.
- [x] Each turn run records explicit durable turn state and, when terminal, a terminal outcome.
- [x] Tool calls, HITL requests, handoffs, and final responses are representable as loop-owned actions rather than unrelated side paths.
- [x] A `send_message` handoff is visible as a loop-owned action outcome and can participate in persistence/recovery rules.
- [x] Phase 1 uses structured completion metadata on the terminal assistant response as the canonical completion mechanism.
- [x] Restore and replay can reconstruct interrupted loop state from persisted artifacts without relying on a hidden transient loop owner.
- [x] Repeating resume against the same persisted in-flight turn does not duplicate tool calls, handoffs, assistant finalization, or queue advancement within one running process and ordinary restore/queue re-entry paths.
- [x] Existing world/chat isolation and current queue/HITL recovery rules remain intact.
- [x] The initial delivery preserves conservative single-tool execution semantics for unsafe or mutating actions.
- [x] The architecture leaves room for later bounded read-only multi-tool batching without another orchestration redesign.
- [x] Concurrency correctness can be explained in per-chat terms rather than by a mandatory global singleton LLM queue.

## Implementation Update

### Delivered in current Phase 1 slice

- Added explicit `agentTurn` metadata with separate turn state and terminal outcome semantics.
- Persisted terminal completion metadata durably through `agent_memory.message_metadata`.
- Added `runAgentTurnLoop(...)` as the canonical model-call / inspect / retry helper.
- Routed both direct initial turns and post-tool continuation turns through `runAgentTurnLoop(...)` for model-call ownership.
- Marked successful `send_message` dispatches as terminal `handoff_dispatched` outcomes.
- Normalized direct and continuation `human_intervention_request` tool intents to persist as `hitl_request` actions with `waiting_for_hitl` state.
- Added same-process resume leases for unresolved tool-call restoration to reduce duplicate resume side effects.
- Made queue completion consume persisted turn lifecycle metadata so queued user turns stay live across durable tool waits and only clear on terminal turn metadata.
- Made stale `sending` restore recovery remove rows when persisted terminal turn metadata already exists instead of replaying or erroring those turns.
- Added continuation no-op guards for already-terminal turns and stopped restore-resumed `send_message` handoffs from falling through into duplicate follow-up continuation.
- Centralized terminal assistant response persistence/publication behind a shared idempotent helper so repeated same-turn final-response calls do not append/publish twice.
- Added an in-process queue completion guard so duplicate terminal `idle`/`response-end` events do not remove or advance the same queued turn twice.
- Extracted shared persisted tool-action execution into `core/events/tool-action-runtime.ts` and routed direct, continuation, and restore tool execution through that runtime helper.
- Replaced the global singleton LLM queue with chat-scoped queue serialization so unrelated chats no longer block each other.
- Added explicit regression coverage that Phase 1 still executes at most one tool call per hop and that same-chat serialization remains ordered while different chats can run concurrently.

### Residual Risk

- Exactly-once tool execution across hard process crashes is still bounded by durable transcript state plus process-local leases, not by a cross-process distributed execution lock. The delivered runtime prevents duplicate same-turn execution inside one running process and across ordinary restore/queue re-entry paths, but it does not introduce a heavier crash-proof global execution ledger.

## References

- `core/events/memory-manager.ts`
- `core/llm-manager.ts`
- `core/send-message-tool.ts`
- Existing queue, HITL, and durable tool execution requirements under `.docs/reqs/2026/03/*`

## Architecture Review (AR)

**Review Date**: 2026-03-29
**Reviewer**: AI Assistant
**Result**: Approved

### Review Summary

The requirement is sound if the delivery is phased. The strongest version of this idea is not “add more planning,” but “make the runtime’s existing loop explicit, durable, and per-chat.” The current provider/runtime split is already the correct architectural direction and should be preserved.

### High-Priority Risks Found and Resolved

- **Scope explosion risk**: Combining loop ownership, completion semantics, concurrency redesign, action envelopes, UI status, and multi-tool batching in one implementation pass would create unnecessary migration risk.
  - **Resolution**: Split the requirement into Phase 1, Phase 2, and Phase 3.

- **False completion risk**: If completion continues to be inferred from assistant text alone, queue progression and recovery logic remain ambiguous.
  - **Resolution**: Require explicit turn-state and terminal-outcome records plus structured completion metadata on the terminal assistant response.

- **State-model ambiguity risk**: A mixed status list makes it unclear whether the system is describing a live wait condition or a finished turn.
  - **Resolution**: Separate nonterminal turn state from terminal outcome and rename the ambiguous waiting status to `waiting_for_tool_result`.

- **Mutation safety risk**: Expanding immediately to broad multi-tool execution would weaken the current conservative safety posture.
  - **Resolution**: Keep initial delivery aligned with current single-tool behavior and defer bounded read-only batching to a later phase.

- **Responsibility drift risk**: Moving orchestration into provider clients would reverse the project’s existing clean separation.
  - **Resolution**: Require the loop runner to remain a runtime concern and keep providers pure.

- **Recovery regression risk**: Replacing current durable recovery with a new transient runner would throw away one of the project’s strongest properties.
  - **Resolution**: Require the new runner to preserve the existing durable tool/HITL/restore story.

### Review Decisions

- Keep the provider layer pure and runtime-owned orchestration explicit.
- Treat `send_message` handoffs as first-class loop actions.
- Separate live turn state from terminal outcome.
- Use structured completion metadata on the terminal assistant response as the canonical Phase 1 completion mechanism.
- Require idempotent resume behavior for persisted in-flight turns.
- Preserve conservative tool execution behavior in the first delivery.
- Treat narrower concurrency control as a follow-up requirement, not a prerequisite for introducing the loop runner.

### Review Outcome

- Proceed to AP.
- The implementation plan should start with the smallest coherent Phase 1 slice:
  - canonical loop runner
  - explicit outcome model
  - explicit completion signal
  - minimal migration of current continuation ownership into the new runner
