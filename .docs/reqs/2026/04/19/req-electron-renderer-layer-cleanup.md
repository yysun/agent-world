# REQ: Electron Renderer Layer Cleanup

## Goal

Resolve the current renderer architecture findings by tightening ownership boundaries in the Electron renderer app.

## Requirements

- Remove stale renderer migration residue that is no longer part of the active shell path.
- Keep the renderer app root thin so it mainly assembles app-level composition instead of owning feature workflows directly.
- Keep `app/shell` focused on framing and routing instead of directly owning unrelated domain workflows.
- Move right-panel content ownership toward explicit shell or feature modules instead of a single transitional catch-all component.
- Move left-sidebar workflow ownership toward feature-owned sections while preserving current user behavior.
- Preserve existing renderer behavior for:
  - settings panel
  - logs panel
  - world create/edit flows
  - agent create/edit flows
  - world import flow
  - world/session sidebar interactions

## Non-Goals

- Redesign renderer behavior or UX beyond what is needed for layer cleanup.
- Refactor unrelated chat/runtime logic outside the files implicated by the findings.
- Replace the renderer-specific `electron/AGENTS.md` boundary rules with the stricter web-app layering model.

## Acceptance Criteria

- The stale legacy `electron/renderer/src/components/MainContentArea.tsx` no longer breaks renderer validation.
- `App.tsx` becomes a thin app root that delegates renderer workspace ownership to a dedicated app-layer module.
- Right-panel routing lives in `app/shell` and delegates panel bodies to feature- or shell-owned modules.
- `LeftSidebarPanel` composes feature-owned sidebar sections instead of directly owning the full world/session workflow surface.
- Renderer boundary tests are updated to reflect the new ownership boundaries.
- At least one targeted unit test is added or updated to lock the new boundaries in place.
