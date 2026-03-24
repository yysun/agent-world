# Electron Renderer Layer Tightening

**Date**: 2026-03-24  
**Type**: Refactor / Architecture / Maintainability / CR / DD  
**Related Story**: `electron-renderer-design-system-layers`

## Story Context

This closeout records a follow-up tightening pass on top of the completed Electron renderer design-system layering work from 2026-03-23.

Reference docs:

- REQ: `.docs/reqs/2026/03/23/req-electron-renderer-design-system-layers.md`
- AP: `.docs/plans/2026/03/23/plan-electron-renderer-design-system-layers.md`
- Test spec: `.docs/tests/test-electron-renderer-design-system-layers.md`
- Prior done doc: `.docs/done/2026/03/23/electron-renderer-design-system-layers.md`

## Overview

Completed a cleanup and tightening pass for the Electron renderer's post-refactor ownership model.

The goal of this pass was not to force the web app's stricter adjacent-only UI dependency rule onto the Electron renderer. Instead, it documented and enforced the stricter contract the renderer can truthfully support today:

- the three-layer design-system core remains strict
- `design-system/foundations` stays internal to the design-system
- the root `components/` directory remains transitional only
- remaining app-shell access to transitional UI is routed through a single shell-owned seam

## Completed Implementation

1. Added contributor-facing Electron renderer UI layer rules to `electron/AGENTS.md`.
   - Documented layer ownership for `design-system/foundations`, `primitives`, `patterns`, `features`, `app/shell`, and transitional `components`.
   - Documented the allowed import directions for the current renderer architecture.
   - Added placement guidance and a short review checklist.

2. Added a shell-owned transitional seam at `electron/renderer/src/app/shell/components/transitional.ts`.
   - Centralized the remaining app-shell access to root `components/` modules.
   - Kept the shrinking compatibility surface auditable and easy to remove later.

3. Rewired shell/app imports away from direct root `components/` usage.
   - `AppOverlaysHost.tsx`, `MainContentArea.tsx`, and `LeftSidebarPanel.tsx` now import transitional UI through the shell seam.
   - `App.tsx` now consumes `WorkingStatusBar` from the `app/shell` barrel instead of reaching into the root `components/` layer directly.
   - `app/shell/components/index.ts` now re-exports the seam-owned `WorkingStatusBar` entry.

4. Tightened renderer boundary enforcement in `tests/electron/renderer/design-system-layer-boundaries.test.ts`.
   - Preserved the existing primitive and pattern direction checks.
   - Added a guard that blocks direct `design-system/foundations` imports outside `design-system/**`.
   - Added a guard that allows external imports of the root `components/` layer only through `app/shell/components/transitional.ts`.

## Code Review Result

### High-Priority Findings

- None.

### Review Notes

- The Electron tightening diff matches the intended architecture for the current renderer state.
- The new rules are stricter than the previous implicit contract, but they do not over-promise a web-style adjacent-only dependency model that the Electron renderer does not yet satisfy.
- The shell seam narrows the compatibility surface without forcing a larger ownership move than this pass required.

## Verification

Ran targeted Electron renderer tests covering the tightened contract and the touched shell/app boundaries:

```sh
npx vitest run \
  tests/electron/renderer/design-system-layer-boundaries.test.ts \
  tests/electron/renderer/feature-entry-points.test.ts \
  tests/electron/renderer/app-mount-regression.test.ts \
  tests/electron/renderer/left-sidebar-import-panel.test.ts
```

Result:

- 4 files passed
- 18 tests passed

## Final State

- `electron/AGENTS.md` now describes the renderer's real post-refactor ownership and import contract.
- The root `components/` directory remains transitional, but its remaining external usage is isolated behind a single shell seam.
- Renderer boundary tests now enforce both the internal design-system layering rules and the narrowed compatibility-layer access pattern.