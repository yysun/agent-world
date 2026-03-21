# Requirement: Frontend Tool Envelope Preview Display

**Date**: 2026-03-21
**Type**: Feature
**Status**: Requirements Reviewed (AR Completed)
**Related Requirements**:
- [req-machine-execution-envelopes.md](./req-machine-execution-envelopes.md)

## Overview

Frontend clients must display tool execution previews from the existing `tool_execution_envelope` contract rather than relying on tool-specific string parsing or result-body inference.

For Electron artifact-backed previews that are themselves previewable in the app surface, preview interaction must remain inside the frontend display surface rather than depending on a dedicated local-path bridge to the main process.

This requirement applies to both frontend surfaces in this repository:

- Electron renderer chat transcript views
- Web chat transcript views

This requirement also applies to both transcript compositions where tool results currently appear:

- standalone tool-result rows
- assistant-linked combined request/result views that embed completed tool output

The goal is to make frontend preview display consistent for live tool activity and for persisted tool results restored after reload, while preserving the current separation between:

- preview-oriented frontend data
- LLM-facing result content
- ordinary assistant response messages

## Goals

- Display frontend previews from durable tool execution envelope data.
- Preserve parity between live tool events and restored persisted tool-result messages.
- Render supported preview types consistently across Electron and web clients.
- Fall back safely when preview content is missing, partial, or not directly renderable inline.
- Keep frontend preview rendering scoped to tool results only.
- Keep Electron previewable-artifact interaction inside the frontend surface for adopted envelope paths.

## Functional Requirements

- **REQ-1**: Frontend clients must recognize the existing `tool_execution_envelope` contract as the canonical source of displayable tool preview data for adopted tool-result messages.

- **REQ-1a**: This preview-display contract must apply consistently whether the tool result is rendered as a standalone tool row or as part of an assistant-linked combined request/result transcript view.

- **REQ-2**: Frontend clients must be able to derive the effective tool preview from either:
  - live tool event payload preview data, or
  - persisted tool-result message content that contains a serialized tool execution envelope.

- **REQ-3**: When both live preview metadata and persisted envelope content are available for the same displayed tool result, the frontend must treat them as the same conceptual preview payload rather than showing conflicting or duplicated representations.

- **REQ-4**: Frontend display logic must use `envelope.preview` as the primary source for preview rendering and must not treat `envelope.result` as the preferred rich-display source when preview data is present.

- **REQ-5**: Frontend clients must preserve access to the tool identity and execution status carried by the envelope so preview display remains associated with the correct tool result.

- **REQ-6**: Frontend clients must support normalized preview collections where `preview` may be either a single preview item or an ordered list of preview items.

- **REQ-7**: The ordering of preview items from the envelope must be preserved in frontend display so the same durable envelope yields the same visual/content ordering after reload.

- **REQ-8**: Frontend clients must support preview display for the current envelope preview categories used by the system, including:
  - text previews
  - markdown previews
  - URL previews
  - artifact-backed previews
  - graphic/media previews derived from artifact metadata

- **REQ-9**: Frontend clients must support the renderer intent carried by the envelope preview metadata when available, including current renderer classes such as:
  - text
  - markdown
  - image
  - SVG
  - audio
  - video
  - YouTube
  - file-style preview or link presentation

- **REQ-10**: Artifact-backed preview items must be displayable from the artifact metadata contained in the envelope, including path or URL identity, media type when known, byte size when known, title/display label, and any preview text provided alongside the artifact.

- **REQ-11**: Frontend clients must support preview-capable artifact scenarios already modeled by the envelope protocol, including at minimum:
  - images and graphics
  - audio and video
  - Markdown documents
  - HTML entry artifacts with companion JS/CSS assets
  - PDF documents
  - non-inline file outputs such as presentation documents presented as file-style preview or link metadata

- **REQ-11a**: In Electron, when an artifact-backed preview item is previewable within the app surface, activating that preview must open or focus a frontend-surface viewer state rather than delegating to a dedicated local-path open bridge.

- **REQ-12**: When a preview item is not supported for inline rendering by a specific client, the frontend must still provide a stable non-destructive fallback presentation derived from the envelope metadata rather than dropping the preview entirely.

- **REQ-12a**: In Electron, non-previewable artifact outputs may still use stable file-style fallback presentation, but adopted previewable artifact interactions must not require a new main/preload bridge purely to open local filesystem paths.

- **REQ-13**: When an envelope contains no preview items, or when all preview items are unusable for display, the frontend must fall back to a stable textual representation of the tool result without requiring tool-specific parsing rules.

- **REQ-14**: Frontend clients must be able to restore and display preview content for persisted tool execution envelopes after transcript reload, refresh, or chat restore.

- **REQ-15**: Frontend clients must preserve chat-scoped tool-result display semantics and must not let preview rendering introduce cross-chat leakage, duplicate tool rows, or mismatched tool-result associations.

- **REQ-15a**: Frontend clients must not regress assistant-linked tool transcript composition while adopting preview-first rendering. Combined request/result views must continue to show the associated tool result while using envelope-aware preview/fallback logic.

- **REQ-16**: Frontend clients must continue to display non-enveloped tool results in a backward-compatible fallback form while adopted tool paths progressively move to envelope-based rendering.

- **REQ-17**: Ordinary assistant/agent response messages must remain outside this preview-display contract and must not be reclassified as tool envelope previews in this scope.

- **REQ-18**: Electron and web clients must provide behaviorally equivalent preview outcomes for the same durable envelope content, while remaining free to use app-local implementations that respect the repository app-boundary rules.

## Non-Functional Requirements

- **NFR-1 (Parity)**: A given durable tool execution envelope must produce materially equivalent preview behavior in Electron and web clients.

- **NFR-2 (Determinism)**: The same persisted envelope content must produce the same preview item ordering and fallback behavior across reloads.

- **NFR-3 (Separation of Concerns)**: Frontend preview rendering must remain independent from LLM continuation content and must not require clients to reinterpret the model-facing result body as rich preview data when structured preview data already exists.

- **NFR-4 (Compatibility)**: Existing transcript histories must remain viewable even when some older tool results do not use the envelope format.

- **NFR-5 (Safety)**: Unsupported, incomplete, or partially populated preview metadata must degrade to safe fallback display instead of breaking the transcript or hiding the tool result entirely.

- **NFR-6 (App Boundary Compliance)**: The web app and Electron app must continue to keep preview parsing/rendering logic in app-local modules rather than introducing cross-app shared UI/runtime modules.

- **NFR-7 (Frontend-Surface Interaction)**: Electron adopted artifact-preview interactions should remain within the renderer/frontend surface for previewable artifacts and should not depend on a dedicated local-path opener bridge.

## Constraints

- Must build on the existing `tool_execution_envelope` contract.
- Must preserve the current distinction between `preview` and `result`.
- Must preserve current chat-scoped message and tool lifecycle semantics.
- Must work with both live tool event payloads and persisted tool-result messages.
- Must preserve backward compatibility for non-enveloped historical tool results.
- Must respect the repository rule that web and Electron implementations remain separate.
- Must allow Electron to present previewable artifact interaction without requiring a dedicated local-path opening bridge for the adopted preview path.

## Out of Scope

- Changes to the core backend envelope contract itself.
- Migration of ordinary assistant/agent response messages onto the tool envelope model.
- Detailed UI styling, layout, theming, or transcript chrome decisions.
- Exact visual chrome for a frontend-surface artifact viewer, such as modal versus inline expansion versus side-panel presentation.
- Any new preview protocol outside the existing tool execution envelope model.

## Acceptance Criteria

- [ ] A persisted tool-result message containing a serialized `tool_execution_envelope` can be restored and displayed from envelope preview data in both Electron and web clients.
- [ ] A live tool event carrying preview metadata can be displayed using the same conceptual preview model as the restored persisted result for that tool.
- [ ] A tool result with envelope preview data is rendered from `preview` rather than by inferring rich display from `result`.
- [ ] Standalone tool rows and assistant-linked combined request/result views both use the envelope-aware preview/fallback model for adopted tool results.
- [ ] Single-item and multi-item preview payloads display in stable order after reload.
- [ ] Markdown, URL, image/SVG, audio/video, file-style, and artifact-backed preview cases are representable by the frontend display contract.
- [ ] HTML bundle and PDF artifact previews remain representable through envelope metadata without this requirement prescribing a specific viewer implementation.
- [ ] In Electron, activating a previewable artifact-backed tool preview keeps the user in a frontend-surface viewer flow and does not depend on a dedicated local-path opening bridge.
- [ ] When inline preview is unsupported for a specific preview item, the frontend still presents a stable fallback derived from envelope metadata.
- [ ] Tool identity and status remain associated with the rendered preview.
- [ ] Non-enveloped historical tool results still render in fallback form.
- [ ] No ordinary assistant message is reclassified into this tool preview display flow.

## References

- Existing frontend envelope helpers in Electron and web clients
- [req-machine-execution-envelopes.md](./req-machine-execution-envelopes.md)

## Architecture Review (AR)

**Review Date**: 2026-03-21
**Reviewer**: AI Assistant
**Result**: Approved

### Review Summary

The requirement is sound once frontend scope is defined at the transcript-composition level, not only at the standalone tool-row level.

The main architecture risk in the initial draft was partial coverage: both clients also surface tool results inside assistant-linked combined request/result views, and leaving that path implicit would allow an implementation that upgrades only direct tool rows while still flattening envelope previews to text elsewhere.

### Review Decisions

- Keep `tool_execution_envelope.preview` as the canonical frontend display source for adopted tool results.
- Keep backend envelope semantics unchanged in this scope.
- Apply the requirement to both standalone tool-result rows and assistant-linked combined request/result transcript views.
- Preserve backward-compatible fallback display for non-enveloped historical tool results.
- Keep exact viewer implementation, sandboxing, and styling choices out of scope.

### Review Outcome

- Proceed to implementation planning and execution using the broadened transcript-surface scope above.