# Done: Web AppRun Layered Architecture

**Date:** 2026-03-24
**Status:** Completed
**Related:** [REQ](../../../reqs/2026/03/23/req-web-apprun-layered-architecture.md), [Plan](../../../plans/2026/03/23/plan-web-apprun-layered-architecture.md)

## Summary

Completed the layered-architecture refactor for the AppRun web client and tightened the resulting UI dependency rules so the web app now follows an explicit ownership model across app shell, pages, features, patterns, primitives, and foundations.

The work kept the existing AppRun route/page model, preserved the World event contract and generator-driven update behavior, and moved reusable UI concerns out of page files and the generic components bucket into explicit layers. The World update surface was split into feature-owned slices with a compatibility facade left in place for the legacy page-level import path.

## Delivered

1. **Layered web UI structure introduced**
   - Added `web/src/app-shell`, `web/src/foundations`, `web/src/primitives`, `web/src/patterns`, and feature-owned `web/src/features/*` surfaces.
   - Moved web bootstrapping into the app-shell layer and kept pages as route-entry assembly points.

2. **Design-system style layers established for the web app**
   - Added foundation CSS for tokens and base document rules.
   - Added primitive controls for button, input, select, and textarea.
   - Added pattern wrappers for action controls, form controls, form fields, modal shell, and centered state panels.

3. **Feature ownership clarified for Home, Settings, and World**
   - Rehomed Home and Settings page composition under feature-owned views.
   - Rehomed World-specific views under `features/world/views`.
   - Reduced legacy component paths to compatibility re-exports where callers still depend on the old import surface.

4. **World update logic split into feature-owned slices**
   - Added composed World update modules for lifecycle, composer, streaming, messages, history, management, and route-local UI handling.
   - Preserved the page-level `web/src/pages/World.update.ts` path as a compatibility facade re-exporting the composed feature update surface.
   - Extracted shared runtime helpers into dedicated modules without changing public event behavior.

5. **Tightened architecture rules and enforcement**
   - Added the missing web primitives and patterns needed to stop feature/page code from owning raw native controls directly.
   - Moved the Home carousel implementation under the Home feature and kept the old carousel component path as a shim.
   - Lifted cross-feature Home/World modal composition to the page layer.
   - Added source-inspection and rendered-surface regression tests for the tightened adjacent-only UI layer contract.

6. **Web instructions updated**
   - Updated `web/AGENTS.md` to document the layered AppRun architecture, adjacent-only UI dependency rules, transitional `components` guidance, and placement/review rules.

## Validation Executed

- `npx vitest run tests/web-domain/swipe-carousel-search.test.ts tests/web-domain/design-system-layer-boundaries.test.ts tests/web-domain/layered-control-patterns.test.ts`
- `npm run check`
- `npm test`

## Final Result

- The web app now has an explicit layered AppRun UI architecture with clearer ownership boundaries.
- The Home, Settings, and World routes assemble feature-owned UI instead of carrying large reusable view implementations directly.
- The World update surface now composes feature-owned slices while preserving the existing compatibility import path.
- Tightened layer-boundary and shared-control regression tests are green.
- Repository verification passed, including the full test suite.

## Review Result

- Code review result for the current uncommitted layered-architecture changes: **no findings**.
- Residual note: `features/world/update/runtime.ts` remains a large compatibility-heavy runtime module, but the current extraction is behavior-preserving and is covered by the validation above.