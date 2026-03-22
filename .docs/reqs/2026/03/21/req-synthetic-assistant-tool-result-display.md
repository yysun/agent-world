# Requirement: Synthetic Assistant Tool Result Display

**Date**: 2026-03-21
**Type**: Feature
**Status**: Requirements Reviewed (AR Completed)
**Related Requirements**:
- [req-tool-execution-envelope.md](../03/06/req-tool-execution-envelope.md)
- [req-frontend-tool-envelope-preview-display.md](./req-frontend-tool-envelope-preview-display.md)

## Overview

Tool transcript rows should no longer render rich preview content directly inside the tool message body.

Instead, when a completed tool result contains displayable full-result content that should be shown to the user, the system must expose that content as a synthetic assistant message for frontend display. This synthetic assistant message is a display artifact for transcript UX, not an authoritative conversation-history message for future model turns.

This requirement applies to both frontend surfaces in this repository:

- Electron renderer chat transcript views
- Web chat transcript views

The goal is to keep tool rows focused on compact lifecycle/status information while moving user-facing full-result display into an assistant-style transcript message that reads naturally in the conversation, without polluting future conversation history or replay semantics.

## Goals

- Remove rich preview rendering from tool message bodies.
- Present user-facing full tool results through an assistant-style display message.
- Preserve compact tool lifecycle/status rows for request/result tracking.
- Ensure synthetic assistant display messages do not become part of future conversation history or tool lifecycle authority.
- Preserve parity between Electron and web for the same completed tool result.

## Functional Requirements

- **REQ-1**: Tool transcript rows must not render adopted rich preview/full-result content directly in the tool message body.

- **REQ-2**: Completed tool results that have user-displayable full-result content must be surfaced to the frontend as a synthetic assistant message intended for transcript display.

- **REQ-2a**: The synthetic assistant message must be persisted to storage so restored chats can display the same assistant-style full-result content without recomputing it from transient runtime state alone.

- **REQ-3**: The synthetic assistant message must present the full result in a form appropriate for normal assistant-message display, rather than as tool-row preview chrome.

- **REQ-3a**: The synthetic assistant message may contain richer or fuller display content than the LLM-facing tool `result`, as long as the display content remains explicitly marked as display-only and excluded from future model history.

- **REQ-3b**: For adopted `shell_cmd` outputs that contain assistant-renderable markdown content, including markdown image links that embed SVG data URIs, the persisted synthetic assistant message must preserve the full display markdown needed by the frontend renderer rather than only the bounded/redacted LLM-facing result summary.

- **REQ-4**: Tool transcript rows must continue to provide compact tool lifecycle/status visibility, including tool identity and terminal outcome, even when full-result display is moved to a synthetic assistant message.

- **REQ-5**: The synthetic assistant message must remain logically associated with the originating tool result so the frontend can preserve transcript ordering and avoid mismatched result display.

- **REQ-6**: The synthetic assistant message must be treated as display-only conversation output and must not be included in future LLM conversation-history assembly for later turns.

- **REQ-6a**: Excluding the synthetic assistant message from future conversation history must apply consistently across immediate continuation, restored chat replay, queued-turn resume, and any other transcript-to-model reconstruction path.

- **REQ-6b**: Persisted synthetic assistant messages must carry stable display-only semantics so model-facing message preparation can deterministically exclude them from future LLM history.

- **REQ-6c**: Display-only exclusion must be based on explicit persisted metadata, not on fragile text-pattern inference.

- **REQ-6d**: Persisted synthetic assistant display messages must not participate in agent auto-reply, mention-routing, or ordinary incoming-message processing as if they were canonical assistant turns.

- **REQ-7**: The canonical tool lifecycle must continue to be owned by the original assistant tool request and terminal tool result records; the synthetic assistant message must not become the authoritative completion artifact for tool execution.

- **REQ-8**: The synthetic assistant message must not create duplicate tool completion semantics, duplicate tool rows, or duplicate future-history entries for the same underlying tool result.

- **REQ-8a**: Each persisted synthetic assistant message must keep a stable link to the originating tool result and tool call so restore, trim, and deduplication logic can treat it as a display artifact of that tool outcome.

- **REQ-8b**: Persisting fuller display content for a synthetic assistant message must not change the canonical tool success/failure/status semantics carried by the originating tool result.

- **REQ-8c**: Edit/delete tail trimming and orphan cleanup must remove persisted synthetic assistant display messages when their owning tool result or owning user-turn tail is removed.

- **REQ-9**: Frontend transcript composition must preserve stable ordering between:
  - the assistant tool request row
  - the compact tool status/result row
  - the synthetic assistant full-result display message

- **REQ-10**: Electron and web clients must provide behaviorally equivalent display outcomes for the same adopted tool result, while remaining free to implement app-local rendering logic.

- **REQ-11**: Historical chats that still contain older tool-row preview rendering or non-synthetic result display formats must remain viewable without requiring destructive transcript migration.

- **REQ-12**: The system must support tool results that do not produce a synthetic assistant display message; compact tool-row rendering must remain valid for tools whose results are not meant to be shown as assistant-style full output.

## Non-Functional Requirements

- **NFR-1 (History Isolation)**: Synthetic assistant display messages must be excluded deterministically from future conversation-history inputs so later turns are unaffected by frontend display-only artifacts.

- **NFR-2 (Parity)**: A given adopted tool result must produce materially equivalent transcript behavior in Electron and web.

- **NFR-3 (Separation of Concerns)**: Tool lifecycle/state tracking, frontend transcript display, and future conversation-history assembly must remain separable concerns.

- **NFR-4 (Determinism)**: Given the same persisted tool result and same transcript state, the system must derive the same presence/absence and ordering of the synthetic assistant display message.

- **NFR-5 (Compatibility)**: Existing non-adopted tools and historical chats must remain viewable without requiring storage rewrites.

## Constraints

- Must preserve the existing distinction between tool execution records and assistant conversation messages.
- Must preserve current world/chat isolation and tool lifecycle ordering guarantees.
- Must not let persisted display-only synthetic assistant messages become queue-owned user turns, tool terminal records, or authoritative replay state.
- Must not let persisted display-only synthetic assistant messages trigger agent-processing side effects merely because they are stored or restored.
- Must respect the repository rule that web and Electron implementations remain separate.

## Out of Scope

- Detailed visual styling of the synthetic assistant message.
- Redesign of compact tool status-row chrome beyond what is needed to stop rendering previews there.
- Changes to unrelated non-tool assistant messages.
- Storage migration that rewrites historical transcript records.
- Generalizing every tool to always emit a synthetic assistant result message.

## Acceptance Criteria

- [ ] An adopted completed tool result no longer renders its rich preview/full-result content inside the tool message body.
- [ ] The same adopted completed tool result can be shown to the user as a synthetic assistant message in the transcript.
- [ ] The compact tool row still shows the tool identity and terminal outcome.
- [ ] The synthetic assistant message appears in stable transcript order relative to the originating tool activity.
- [ ] Future conversation-history assembly excludes the synthetic assistant display message for later turns.
- [ ] Persisted synthetic assistant display messages carry explicit metadata that lets model-facing history filters exclude them deterministically.
- [ ] Persisted synthetic assistant display messages do not trigger agent auto-reply or mention-routing side effects during publish, restore, or reload.
- [ ] Reload/restore/replay paths do not accidentally reintroduce the synthetic assistant display message into model-facing history.
- [ ] Edit/delete trim removes orphaned persisted synthetic assistant display messages together with their owning tool/user-turn tail.
- [ ] Tool lifecycle ownership remains with the tool request/result records, not the synthetic assistant message.
- [ ] Electron and web show materially equivalent behavior for the same adopted tool result.
- [ ] Older chats without this behavior remain viewable.
- [ ] An adopted `shell_cmd` result may send a safe bounded/redacted summary to the LLM while persisting fuller assistant-renderable markdown for the synthetic assistant display message.
- [ ] Markdown image content such as `data:image/svg+xml;base64,...` can be preserved in the synthetic assistant display message even when the LLM-facing tool result omits or redacts that payload.

## Assumptions

- Some tool outputs are better understood by users as assistant-style conversation content than as tool-row preview payloads.
- Compact tool transcript rows remain useful even when full result display moves elsewhere in the transcript.
- Future conversation-history assembly already has a distinct boundary where display-only transcript artifacts can be excluded consistently.
- For some adopted tools, especially `shell_cmd`, the best user-facing display payload may be richer than the safe LLM-facing result payload.

## Architecture Review (AR)

**Review Date**: 2026-03-21
**Reviewer**: AI Assistant
**Result**: Approved

### Review Summary

The requirement is sound once the synthetic assistant result is treated as a persisted display artifact rather than a canonical assistant turn for future model history.

The main architecture risk is not persistence itself; it is unmarked persistence or reusing the wrong payload. If the synthetic result were stored without explicit display-only metadata and linkage, or if it were forced to reuse only the bounded/redacted LLM-facing tool `result`, it would either contaminate later LLM history, trigger ordinary assistant-message side effects, or fail to preserve the richer assistant-renderable display content the frontend needs. The reviewed requirement therefore allows persistence of fuller display content, but only with stable metadata that keeps tool lifecycle authority on the real assistant tool request plus terminal tool result records.

### Review Decisions

- Treat the synthetic assistant result as persisted display-only transcript output.
- Persist the synthetic result so restored chats can render the same transcript artifact.
- Allow the persisted synthetic result to carry fuller assistant-renderable display content than the LLM-facing tool `result` when needed.
- Require stable persisted metadata so model-facing history assembly can exclude the synthetic result deterministically.
- Require persisted synthetic messages to stay out of agent auto-reply and related message-processing side effects.
- Preserve compact tool rows as the canonical lifecycle/status representation.
- Exclude persisted display-only synthetic messages from all future model-facing history assembly paths.
- Keep Electron and web behavior aligned while allowing app-local transcript rendering implementations.

### Review Outcome

- Proceed to implementation planning using persisted display-only synthetic assistant messages with explicit exclusion from future model history.
