# REQ: Tool Execution Envelope

**Date:** 2026-03-06
**Status:** Draft

---

## Summary

Define a generic persisted `ToolExecutionEnvelope` contract for tool-completion records so the system can separate:

1. UI-facing persisted preview data
2. LLM-facing canonical tool result data
3. transient streaming progress transport

The envelope must be generic enough for multiple tools, while the initial implementation scope for this story is:

- `shell_cmd`
- skill-script execution outputs produced through `load_skill`

This requirement exists to support large or non-LLM-safe outputs, such as generated SVG files, without losing useful UI previews or overloading continuation context.

---

## Problem

Current tool-result handling mixes concerns that should be separate:

1. Some tools effectively try to use one payload for both UI rendering and LLM continuation.
2. Large outputs such as generated SVG are useful to show in the UI but are too large or too noisy to send back to the LLM.
3. Frontend custom renderers exist, but there is no generic persisted preview contract that tools can target.
4. `shell_cmd` currently has special output shaping behavior, while skill-script outputs under `load_skill` do not yet share a common generic result envelope.

This creates unnecessary coupling between tool execution, transcript persistence, UI rendering, and LLM continuation.

---

## Goals

1. Define one generic tool-completion envelope that can be reused across tools.
2. Persist UI preview data separately from LLM continuation data.
3. Keep streaming progress outside the persisted completion envelope.
4. Support large artifacts, including SVG, audio, video, and other media, without sending raw payloads to the LLM.
5. Provide a minimal renderer contract so web and Electron can render common preview types deterministically.

---

## Functional Requirements

### FR-1: Generic ToolExecutionEnvelope

- Tool completion records must support a generic `ToolExecutionEnvelope` shape.
- The envelope must be associated with the original `tool_call_id`.
- The envelope must include:
  - `preview`
  - `result`
- The envelope may include stable metadata needed for rendering or bookkeeping, such as:
  - `tool`
  - `tool_call_id`
  - `status`
  - `version`

### FR-2: Streaming Is Out of Band

- Transient tool progress streaming must remain outside the persisted `ToolExecutionEnvelope`.
- SSE or equivalent runtime progress transport must continue to support running-state UI behavior.
- The final persisted envelope must represent completion state only.

### FR-3: Preview Is Persisted for UI, Not LLM

- `preview` must be persisted on the final tool result record.
- `preview` must be available to transcript restoration and reload flows.
- `preview` must not be forwarded into LLM continuation context as the tool result payload.

### FR-4: Result Closes the Tool Loop

- `result` must be the canonical LLM-facing tool completion payload.
- `result` must contain enough structured information for the model to continue correctly after the tool call.
- `result` must be bounded and safe for continuation context.
- `result` must not require the model to parse UI-oriented preview content in order to determine success, failure, or next-step context.

### FR-5: Preview Supports Large and Non-LLM-Safe Outputs

- `preview` must support outputs that are too large, too noisy, or otherwise inappropriate to send back to the LLM.
- For large generated artifacts, the preview should reference an artifact or URL instead of embedding the full payload inline.
- The envelope must support cases where:
  - the UI needs to render a large SVG preview
  - the LLM only needs to know the SVG was created successfully and where it is located

### FR-6: Artifact-Aware Preview Contract

- `preview` must support artifact-oriented previews with metadata sufficient for UI rendering.
- Artifact preview metadata must support at least:
  - stable file or resource location
  - media type
  - optional byte size
  - optional display name
- Large binary or text artifacts should be referenced by location and metadata instead of inlined by default.

### FR-7: Basic Preview Types and Renderers

- The preview contract must support a small set of basic preview categories for initial implementation.
- The initial preview coverage must support at least:
  - plain text
  - markdown
  - image
  - SVG
  - audio
  - video
  - YouTube URL/embed-style preview
  - generic artifact/file preview
- The contract may use `kind` plus `media_type`, an explicit `renderer`, or both.
- If an explicit `renderer` is present, it must be treated as a UI hint rather than the source of truth.

### FR-8: Basic Renderer Safety and Determinism

- Frontends must be able to render the initial preview set without executing arbitrary code from tool payloads.
- Tool previews must be declarative data only.
- Arbitrary HTML, JavaScript, or executable component definitions must not be required for normal preview rendering.

### FR-9: shell_cmd Must Use the Envelope

- `shell_cmd` final tool results must use `ToolExecutionEnvelope`.
- For `shell_cmd`, `preview` must contain bounded UI-facing stdout/stderr preview data.
- For `shell_cmd`, `result` must contain the canonical continuation payload used to close the tool call loop.
- The `shell_cmd` envelope must preserve existing normalized terminal outcome semantics such as success, non-zero exit, timeout, cancellation, validation failure, and execution failure.

### FR-10: Skill-Script Outputs Must Use the Envelope

- Skill-script execution outputs produced through `load_skill` must support `ToolExecutionEnvelope`.
- When a skill script produces a large or renderable artifact, the tool result must be able to persist a UI preview reference without forcing the artifact body into LLM continuation context.
- Skill-script result payloads must still communicate successful setup or failure clearly to the LLM.

### FR-11: Message Preparation Must Respect the Split

- Message preparation for LLM calls must pass only the `result` portion of the envelope back to the model.
- `preview` must be excluded from ordinary continuation payload assembly.
- This rule must apply consistently for immediate continuation and resumed pending tool calls.

### FR-12: Persistence and Restoration

- Completed tool cards must be restorable from persisted assistant tool-call data plus persisted tool-result envelopes.
- The persisted envelope must be sufficient for UI preview reconstruction after reload.
- The design must not require replaying transient stream chunks to rebuild completed preview state.

### FR-13: Event and Isolation Guarantees

- Envelope adoption must not break world-level event isolation.
- Tool lifecycle ordering must remain stable:
  - request
  - start
  - progress when applicable
  - final result or explicit error
- Preview/result persistence must remain scoped to the originating world and chat.

### FR-14: Incremental Adoption

- The system must define `ToolExecutionEnvelope` generically enough for future tool adoption.
- Initial implementation is limited to `shell_cmd` and skill-script execution outputs.
- Non-adopted tools may continue using existing result behavior until migrated, provided their existing behavior does not regress.

---

## Non-Functional Requirements

### NFR-1: Bounded LLM Context

- `result` payload size must remain bounded and appropriate for continuation.

### NFR-2: Deterministic Preview Semantics

- Given the same persisted envelope data, web and Electron must be able to derive the same preview category and render target.

### NFR-3: Transport Separation

- The envelope contract must not depend on SSE delivery timing or transient stream state for completed preview rendering.

### NFR-4: Backward-Compatible Extensibility

- The envelope must support future preview types without forcing a redesign of the base persistence contract.

---

## Acceptance Criteria

1. A generic `ToolExecutionEnvelope` requirement exists and distinguishes persisted `preview` from LLM-facing `result`.
2. The documented contract explicitly keeps streaming outside the persisted envelope.
3. The documented contract explicitly states that `preview` is persisted but not sent to the LLM.
4. The documented contract explicitly states that `result` is the only payload sent to the LLM to close the tool-call loop.
5. `shell_cmd` is required to emit the envelope with bounded preview data and canonical continuation result data.
6. Skill-script execution outputs under `load_skill` are required to support the envelope for large or renderable artifacts.
7. The documented preview contract covers at least text, markdown, image, SVG, audio, video, YouTube, and generic artifact previews.
8. The documented contract prohibits arbitrary executable UI payloads.
9. The documented contract requires message preparation to exclude `preview` from LLM continuation.
10. The documented contract preserves existing event-ordering and world/chat isolation requirements.

---

## Assumptions

1. Existing frontend custom-renderer infrastructure can be extended to consume a generic preview contract.
2. A renderer hint may be useful for some previews, but `kind` and `media_type` remain important for validation and fallback behavior.
3. Large artifacts should normally be referenced by metadata instead of embedded inline.
4. This story does not require migrating every tool at once.

---

## Out of Scope

1. Migrating every existing tool to the envelope in one change.
2. Redesigning the entire streaming transport protocol.
3. Defining arbitrary interactive application runtimes inside tool previews.
4. Replacing existing domain-specific frontend renderers beyond what is needed for the initial basic renderer set.
5. Historical-data migration of previously persisted tool rows.

---

## AR Findings and Resolutions

1. High: A single undifferentiated tool payload for both UI and LLM would keep the current coupling problem in a new format.
   - Resolution: require separate persisted `preview` and LLM-facing `result` inside the same final envelope.
2. High: Putting streaming into the same persisted envelope would blur runtime transport with durable completion state.
   - Resolution: require streaming to remain transient and out of band.
3. High: Large generated artifacts such as SVG can exceed safe LLM context size.
   - Resolution: require preview artifact references and a compact `result` payload for continuation.
4. Medium: An explicit `renderer` field could create brittle frontend coupling if treated as authoritative.
   - Resolution: treat `renderer` as optional UI hint, not the sole rendering truth.
5. Medium: Allowing arbitrary embedded HTML or code in preview payloads would create security and rendering risks.
   - Resolution: require declarative preview data only.
6. Medium: Requiring all tools to migrate immediately would unnecessarily broaden risk.
   - Resolution: make the envelope generic, but scope initial adoption to `shell_cmd` and skill-script outputs.
