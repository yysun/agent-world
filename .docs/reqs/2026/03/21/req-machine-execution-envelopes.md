# Requirement: Machine-Executed Tool Envelopes

**Date**: 2026-03-21
**Type**: Feature
**Status**: Requirements Reviewed (AR Completed)

## Overview

Standardize the existing tool envelope model for machine-executed runtime steps so the system can consistently carry three outputs for each executed step:

- execution status
- LLM-facing summarized result
- frontend-facing preview

This requirement applies to:

- direct tool calls such as `shell_cmd`
- other LLM-invoked tools that perform machine execution
- script execution steps initiated by `load_skill`

This requirement does not change normal assistant/agent response formatting or storage.

## Goals

- Reuse the existing tool envelope model instead of introducing parallel result formats for machine-executed steps.
- Ensure machine-executed steps expose explicit execution status.
- Ensure machine-executed steps expose a bounded summarized result suitable for LLM continuation.
- Ensure machine-executed steps expose preview data suitable for frontend rendering.
- Preserve a clear distinction between machine execution results and ordinary assistant responses.

## Artifact-Producing Script Protocol

Some `load_skill`-initiated scripts produce user-relevant output primarily as generated artifacts rather than as meaningful stdout. Representative scenarios include:

- generating a PNG, SVG, or other image asset
- generating an audio or video file
- generating a document such as Markdown, PDF, or PPTX
- generating an HTML artifact set consisting of a primary HTML file plus supporting JS and CSS assets

For those scenarios, the runtime must normalize script outcomes so the enclosing machine-execution result can carry:

- authoritative execution status
- bounded LLM-facing result content describing what was produced
- preview-capable metadata for artifacts that can be rendered or linked in the frontend

This protocol must work even when the script does not emit a rigid envelope-shaped payload.

## Functional Requirements

- **REQ-1**: Machine-executed steps must use the existing tool envelope model as the canonical durable result container.

- **REQ-2**: Each machine-executed envelope must carry, at minimum:
  - tool identity
  - execution status
  - LLM-facing result content
  - frontend-facing preview content

- **REQ-3**: The LLM-facing result content must remain bounded and suitable for reuse in continuation/replay flows.

- **REQ-4**: The frontend-facing preview content must remain independent from the LLM-facing result so clients can render concise, rich, or artifact-backed previews without forcing the same payload back into model context.

- **REQ-5**: `shell_cmd` executions must continue to emit durable tool envelopes that expose status, summarized result, and preview data.

- **REQ-6**: Other machine-executed tools that produce durable execution output must adopt the same envelope model instead of emitting tool-specific ad hoc durable result formats.

- **REQ-7**: `load_skill` script execution must participate in the envelope model.

- **REQ-8**: Script execution initiated by `load_skill` must expose per-script execution status, summarized result content, and preview-capable output in a way that can be incorporated into the enclosing `load_skill` result.

- **REQ-9**: `load_skill` must preserve script execution output as structured machine-execution data rather than flattening all script output to opaque plain text before the final `load_skill` result is assembled.

- **REQ-10**: The final durable `load_skill` result must retain the existing single-tool result semantics for `load_skill` while incorporating the structured outcomes of any executed scripts.

- **REQ-11**: Script execution support under `load_skill` must not require scripts themselves to masquerade as top-level runtime tool events.

- **REQ-12**: Artifact-producing script executions must be able to contribute structured machine-execution outcomes even when the script does not emit a rigid envelope-shaped payload, provided the runtime host can derive status, bounded result content, and preview material from observed execution outcomes and produced artifacts.

- **REQ-13**: The normalized structured outcome for an artifact-producing script must support zero or more artifact references with sufficient metadata for durable rendering or linking, including path or URL identity, media type when known, byte size when known, and human-readable display name when available.

- **REQ-14**: The protocol must support both previewable artifacts and non-previewable artifacts. Previewable artifacts may produce artifact-backed preview content; non-previewable artifacts must still be representable in bounded result content and durable file-style preview or link metadata.

- **REQ-14a**: Previewable artifacts must include, at minimum, support for images, audio/video, Markdown documents, HTML artifact sets, and PDF documents when the runtime can identify them from produced artifacts and metadata.

- **REQ-14b**: For HTML artifact sets, the normalized outcome must be able to identify a primary HTML entry artifact and preserve references to supporting JS and CSS assets needed for preview-capable frontend handling.

- **REQ-15**: Execution status must remain authoritative for machine-execution outcomes. Produced artifacts may enrich result and preview content, but they must not cause a failed execution to be represented as completed.

- **REQ-16**: When multiple candidate preview artifacts are produced by one machine-executed step, the durable outcome must select preview material deterministically or omit artifact preview when a deterministic primary artifact cannot be established.

- **REQ-17**: Frontend clients must be able to render preview data from durable machine-execution envelopes after reload, not only from live runtime events.

- **REQ-17a**: This requirement defines preview data and durable metadata only. It does not prescribe the exact frontend rendering mechanism, viewer implementation, sandboxing strategy, or client-specific component behavior for those previews.

- **REQ-18**: Continuation and replay paths must consume the LLM-facing result content from durable machine-execution envelopes rather than raw preview payloads.

- **REQ-19**: Machine-executed envelope adoption must preserve existing chat scoping, tool identity, and completion linkage semantics.

- **REQ-20**: Ordinary assistant/agent response messages are explicitly out of scope for this requirement and must not be migrated onto the tool envelope model in this delivery scope.

## Non-Functional Requirements

- **NFR-1 (Consistency)**: Identical categories of machine execution must expose the same conceptual fields (`status`, `result`, `preview`) across tools.

- **NFR-2 (Determinism)**: Given the same execution inputs and outputs, the durable envelope content and ordering of preview/result material must be stable.
- **NFR-2a (Deterministic Artifact Selection)**: When artifact preview is derived from produced files, the same execution outcome must lead to the same primary preview selection or the same omission behavior.
- **NFR-2b (Cross-Type Compatibility)**: The protocol must remain valid across multiple artifact categories, including images, audio/video, and generic file outputs such as presentation documents.
- **NFR-2c (Bundle Compatibility)**: The protocol must support previewable artifact bundles where one primary artifact depends on companion assets, such as an HTML file with JS and CSS.

- **NFR-3 (Separation of Concerns)**: Frontend preview concerns must remain separated from LLM continuation concerns.

- **NFR-4 (Compatibility)**: Existing clients must continue to function when replaying persisted machine-execution results.

- **NFR-5 (Maintainability)**: The system must avoid proliferating multiple durable result protocols for machine-executed steps.

## Constraints

- Must build on the existing tool envelope model already used by adopted tools.
- Must not change ordinary assistant response storage/role semantics in this scope.
- Must preserve current event and message isolation rules, including chat-scoped tool lifecycle behavior.
- Must preserve the current outer `load_skill` tool result contract while extending it to carry structured script execution outcomes.
- Must support host-derived artifact outcomes for scripts that generate images, media, markdown, HTML bundles, PDFs, or other document files without requiring every script to emit a rigid structured response format.

## Out of Scope

- Any redesign of assistant/agent response formatting, storage, or replay.
- Renaming the tool envelope model to a generic execution envelope in this scope.
- New frontend-only preview protocols unrelated to durable tool envelopes.
- Exact frontend preview rendering mechanics, including HTML sandboxing approach, PDF viewer choice, and client-specific display implementation.
- Changes to approval policy, shell risk policy, or tool permission policy beyond what is needed to carry structured machine-execution results.

## Acceptance Criteria

- [ ] `shell_cmd` continues to produce durable envelopes with explicit status, summarized result, and preview content.
- [ ] At least one additional machine-executed tool path beyond current adopted coverage uses the same durable envelope model.
- [ ] `load_skill` script execution no longer loses structured execution outcome data by flattening it immediately to plain text.
- [ ] `load_skill` durable results incorporate structured script execution outcomes while remaining a single `load_skill` tool result.
- [ ] A `load_skill` script that produces a previewable artifact such as PNG, SVG, audio, video, Markdown, HTML, or PDF can surface completed status, bounded LLM-facing result content describing the produced artifact, and durable artifact-backed preview data without the script needing to emit a top-level tool envelope.
- [ ] A `load_skill` script that produces a non-previewable artifact such as PPTX can still surface completed status, bounded LLM-facing result content, and durable file-style preview or link metadata.
- [ ] An HTML artifact set with a primary HTML file and companion JS/CSS assets can be represented durably without requiring the requirement or plan to prescribe exactly how clients render that bundle.
- [ ] A failed artifact-producing script execution is still represented as failed even if a partial or stale artifact is present.
- [ ] If multiple candidate artifacts are present for one execution, the durable preview selection is deterministic or explicitly omitted.
- [ ] Frontend clients can render preview material for durable machine-execution results after reload.
- [ ] LLM continuation paths consume summarized result content rather than preview-only content.
- [ ] No ordinary assistant response message is converted to the tool envelope model in this scope.

## References

- Existing tool envelope contract in core runtime
- Existing `shell_cmd` durable envelope behavior
- Existing `load_skill` outer tool result behavior

## Architecture Review (AR)

**Review Date**: 2026-03-21
**Reviewer**: AI Assistant
**Result**: Approved

### Review Summary

The requirement is sound if the existing tool envelope model remains limited to machine-executed runtime steps in this scope.

The main architecture risk was scope creep: applying the tool envelope model to ordinary assistant responses at the same time would blur role semantics, complicate replay rules, and increase migration surface across core, Electron, and web clients.

### Validated Assumptions

- The current tool envelope model already expresses the required split between durable preview data and LLM-facing result content.
- `shell_cmd` and `load_skill` already provide the correct baseline contract for status/result/preview separation.
- `load_skill` script execution currently loses structure because script output is flattened too early, not because the outer envelope model is insufficient.
- Additional machine-executed built-in tools can adopt the same envelope model incrementally without redesigning assistant-message storage.
- Artifact-producing skill scripts across image, media, markdown, HTML, PDF, and other document scenarios can be represented by host-derived status/result/preview synthesis even when stdout is unstructured.

### Review Decisions

- Keep the existing tool envelope model as the canonical durable container for machine-executed steps only.
- Do not migrate ordinary assistant/agent responses in this delivery scope.
- Keep the runtime host authoritative for durable envelope construction; scripts must not be required to emit top-level runtime tool envelopes themselves.
- Extend `load_skill` so it preserves structured per-script execution outcomes before assembling the final `load_skill` result.
- Treat produced artifacts, including images, media files, Markdown, HTML bundles, PDFs, and generic generated documents, as first-class inputs to preview/result derivation when script stdout alone is insufficient.
- Keep execution status authoritative; artifact discovery may enrich the durable outcome but must not override failure semantics.
- Require deterministic primary-artifact selection, or explicit preview omission, when one execution yields multiple candidate artifacts.
- Keep frontend rendering implementation details out of scope for this requirement; the contract ends at durable preview metadata.

### Review Outcome

- Proceed to implementation planning.
- Planning must select at least one concrete non-`shell_cmd`, non-`load_skill` machine-executed tool path for first adoption.