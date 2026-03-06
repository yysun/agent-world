# REQ: Tool Call Output Simplification

**Date:** 2026-03-06
**Status:** Draft

---

## Summary

Simplify tool-call output handling so shell command output is represented through one canonical tool-result contract instead of multiple LLM result modes plus persisted synthetic transcript messages.

The resulting behavior must preserve chat/world isolation, deterministic tool lifecycle behavior, and bounded output size while reducing UI/runtime coupling.

---

## Problem

Current `shell_cmd` behavior mixes several responsibilities:

1. LLM continuation shaping uses multiple result modes (`minimal`, `smart`, `verbose`).
2. Runtime output is partly shown through streaming events and partly persisted as a synthetic assistant transcript message.
3. UI layers merge assistant tool-call rows, tool-result rows, and streamed output to reconstruct a single user-visible tool card.
4. Reconnect/resume paths synthesize pending tool-start state to compensate for split persistence.

This creates unnecessary branching, duplicated concepts, and higher risk of behavior drift across core, server, web, Electron, and CLI layers.

---

## Goals

1. Establish one canonical persisted tool-result representation for `shell_cmd`.
2. Remove persisted synthetic shell transcript messages used only to mirror tool output.
3. Preserve real-time progress visibility during execution.
4. Bound tool-result output so continuation and UI remain safe for large outputs.
5. Keep current chat/session/event isolation guarantees intact.

---

## Functional Requirements

### FR-1: Canonical Shell Tool Result

- `shell_cmd` must always produce one canonical final tool result associated with the original `tool_call_id`.
- The canonical final tool result must be the authoritative persisted execution result for continuation and transcript restoration.
- The final tool result must include normalized execution outcome fields:
  - `status`
  - `exit_code`
  - `timed_out`
  - `canceled`
  - `reason` when applicable

### FR-2: Bounded Output Preview

- The canonical final tool result must include bounded output preview data for stdout and stderr when available.
- Output preview must be truncated deterministically when it exceeds configured bounds.
- Truncation state must be explicit in the result so both runtime and UI can distinguish full vs partial output.
- Output that matches explicitly unsafe or non-useful payload classes for continuation context, such as image data URIs, must be redacted or summarized instead of returned verbatim.

### FR-2.1: Explicit Full-Output Requests

- If a user-facing shell invocation explicitly requests full output, runtime may return full stdout/stderr content.
- Even in that case, the full content must remain attached to the canonical final `tool` result rather than being persisted as a separate assistant transcript mirror message.
- The presence of explicit full-output behavior must not reintroduce separate continuation modes for ordinary post-tool reasoning.

### FR-3: No Persisted Synthetic Shell Transcript Message

- Final shell stdout must not be persisted as a separate assistant message solely to mirror tool execution output.
- Runtime must not require a synthetic assistant transcript row to reconstruct completed shell execution state after reload or reconnect.

### FR-4: Streaming Remains Transient

- Runtime progress streaming may continue during tool execution, but streaming events must remain transient execution-state transport, not the authoritative persisted final result.
- Completion state after reload/reconnect must be derivable from persisted assistant tool-call plus persisted tool-result records.

### FR-5: Simplified Continuation Contract

- Continuation logic must not depend on three shell-specific LLM result modes.
- Shell continuation must use one bounded-preview result contract for normal post-tool reasoning.
- Explicit full-output return behavior may remain available only for direct user-requested tool usage where full output is necessary.

### FR-6: Stable Tool Lifecycle Ordering

- Existing lifecycle ordering guarantees must remain intact:
  - tool request
  - tool start
  - progress/chunks when applicable
  - final result or explicit error
- Simplification must not reorder completion relative to persisted tool-result publication.

### FR-7: Chat and World Isolation

- Tool output state must remain scoped to the originating world and chat.
- Simplification must not introduce cross-chat or cross-world leakage in streaming state, persistence, or restoration.

### FR-8: UI Reconstruction from Canonical Records

- Web and Electron transcripts must be able to render completed shell execution from canonical assistant tool-call and tool-result records without requiring a persisted synthetic assistant shell-output message.
- Pending/running display may use runtime events, but completed display must rely on canonical persisted records.

### FR-9: Compatibility with Existing Tool Metadata

- Existing tool lifecycle events (`tool-start`, `tool-result`, `tool-error`) must remain consistent enough that current status tracking, waiting indicators, and activity accounting do not regress.
- Any simplification of result content must preserve deterministic failure classification for non-zero exit, timeout, cancellation, validation failure, and execution error.

### FR-10: Canonical Result Applies to All Terminal Outcomes

- The canonical shell result contract must apply to successful execution, non-zero exit, timeout, cancellation, validation failure, approval denial, and execution errors.
- Terminal shell outcomes must not switch between unrelated string formats based on error source.

### FR-11: Legacy Transcript Compatibility

- Existing historical chats that already contain persisted synthetic assistant stdout mirror messages must continue to render correctly after the new contract ships.
- New runtime writes must stop producing those legacy rows, but readers must remain backward compatible for previously stored chats.

---

## Non-Functional Requirements

### NFR-1: Determinism

- Given the same command result and same truncation bounds, the canonical tool-result payload must be deterministic.

### NFR-2: Bounded Size

- Tool-result payload size must be bounded by configuration or constants and must not scale unbounded with stdout/stderr length.

### NFR-3: Separation of Concerns

- Streaming transport, persisted result storage, and UI rendering concerns must be separable and must not require synthetic persistence purely for presentation.

### NFR-4: Backward-Compatible Safety

- Existing shell safety constraints, approval rules, and trusted working-directory enforcement must remain unchanged.

---

## Acceptance Criteria

1. Given a successful shell command with stdout, one persisted `tool` result exists for the `tool_call_id`, and no separate persisted assistant stdout mirror message is created.
2. Given a failed shell command with stderr, the final tool result includes normalized failure status and bounded stderr preview.
3. Given very large stdout or stderr, the final tool result is truncated deterministically and explicitly marks truncation.
4. Given stdout containing an image data URI or similarly disallowed payload class, the final tool result returns a redacted/summarized preview instead of raw content.
5. Given a restored chat/session after completion, the UI can render the completed tool card from persisted assistant tool-call plus persisted tool-result data only.
6. Given a restored chat/session with a pending unresolved tool call, the UI can still show pending state without relying on a persisted synthetic assistant stdout transcript row.
7. Shell continuation no longer branches among `minimal`, `smart`, and `verbose` modes for ordinary continuation behavior.
8. Existing tool lifecycle ordering and chat/world isolation behavior remain unchanged.
9. At least one targeted unit test covers canonical truncated tool-result output.
10. At least one targeted unit test covers absence of persisted synthetic assistant stdout mirror messages.
11. At least one targeted unit test covers canonical terminal-result formatting for a non-execution failure path such as validation error or approval denial.
12. Existing chats containing legacy persisted assistant stdout mirror messages continue to render without regression.
13. For transport/runtime path changes, `npm run integration` remains required by project policy.

---

## Assumptions

1. Real-time streaming remains useful and should not be removed as part of this simplification.
2. Full raw shell output may still be needed in explicit user-driven cases, but not as the default continuation contract.
3. Current UI merge logic can be simplified once canonical persistence is reduced to request + result as the durable source of truth.
4. Existing full-output behavior, if retained, should stay on the canonical tool-result row instead of creating a second durable transcript row.

---

## Out of Scope

1. Redesigning non-shell tool contracts.
2. Removing live progress streaming entirely.
3. Changing HITL approval semantics for unrelated tools such as `load_skill`.
4. Refactoring unrelated message rendering or SSE infrastructure beyond what is required for this story.
5. Data migration that rewrites historical chats in storage.

---

## AR Findings and Resolutions

1. High: Replacing all shell continuation output with status-only data would regress script/skill flows that currently need some bounded stdout context.
   - Resolution: require one canonical bounded-preview result contract, not status-only output.
2. High: Removing streaming entirely would reduce user-visible execution progress and make long-running commands feel stalled.
   - Resolution: keep streaming as transient runtime transport while making persisted tool-result records authoritative for completion.
3. High: Completed-state restoration currently depends on split persistence and synthesis behavior.
   - Resolution: require completed shell cards to be reconstructable from persisted assistant tool-call plus persisted tool-result only.
4. Medium: UI and server reconnect logic may still need synthetic pending-state events for unresolved tool calls.
   - Resolution: allow transient pending-state synthesis on reconnect, but prohibit persisted synthetic stdout transcript messages.
5. Medium: The proposal originally left validation failures, approval denials, and execution errors free to return different textual formats.
   - Resolution: require one canonical terminal-result contract across all shell exit paths.
6. Medium: Stopping new synthetic stdout rows without accounting for legacy data would regress old transcript rendering.
   - Resolution: require backward-compatible read/render behavior for historical chats while stopping new legacy writes.
7. Medium: Allowing explicit full-output behavior without constraints could accidentally recreate split persistence.
   - Resolution: permit full output only on the canonical final tool-result row and prohibit restoring the separate assistant stdout mirror pattern.
