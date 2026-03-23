# Electron Renderer Design System Layers

**Date**: 2026-03-23  
**Type**: Refactor / Architecture / Maintainability / CR / DD

## Overview

Completed the Electron renderer layering refactor and closeout pass for the design-system core.

This story finished the migration to a strict three-layer model inside `electron/renderer/src/`:

- `Foundations`: tokens, globals, and shared field-style aliases
- `Primitives`: atomic generic controls and surfaces only
- `Patterns`: generic composed layout and interaction shells only

Business-specific renderer UI remains outside the design-system core and now consumes the extracted primitives and patterns through explicit layer-aware imports.

The closeout pass also finished the ownership cleanup outside the core: app-shell composition now lives under `app/shell`, business-specific renderer UI is grouped under feature boundaries where it has a clear product-area owner, and the legacy `components/index.ts` barrel is now explicitly documented as a transitional compatibility surface.

## Completed Implementation

- Split the mixed renderer stylesheet so `styles.css` remains the stable entry point while foundations and feature-specific selectors live in separate files.
- Replaced the transitional specialized-widget primitive surface with atomic primitives:
  - `Button`
  - `IconButton`
  - `Card`
  - `MenuItem`
  - `Input`
  - `Select`
  - `Textarea`
  - `Radio`
  - `Checkbox`
  - `Switch`
- Promoted only genuinely generic composed structures into patterns:
  - `AppFrameLayout`
  - `BaseEditor`
  - `TextEditorDialog`
  - `LabeledField`
  - `PanelActionBar`
- Rewired renderer business components such as `AgentFormFields`, `RightPanelContent`, `LeftSidebarPanel`, `ComposerBar`, `SkillEditor`, and the inline edit flow in `MessageListPanel` onto the shared design-system surface.
- Split mixed constants into `ui-constants.ts` and `app-defaults.ts`.
- Kept specialized widgets such as status/timer/sidebar/settings-row components out of the primitive layer.
- Moved app-owned workspace composition into `electron/renderer/src/app/shell/`, including `AppOverlaysHost`, `LeftSidebarPanel`, `MainContentArea`, `MainHeaderBar`, `MainWorkspaceLayout`, `RightPanelShell`, and `SidebarToggleButton`.
- Moved business-specific chat UI into `electron/renderer/src/features/chat/`, including `ComposerBar`, `EditorChatPane`, `ElapsedTimeCounter`, `MessageContent`, and `MessageListPanel`.
- Moved queue UI into `electron/renderer/src/features/queue/`, skills UI into `electron/renderer/src/features/skills/`, and settings toggle-row UI into `electron/renderer/src/features/settings/`.
- Narrowed `electron/renderer/src/components/index.ts` so it no longer fronts migrated feature or shell modules and now advertises itself only as a shrinking compatibility barrel for unmigrated UI.

## Code Review Result

### High-Priority Findings

- None.

### Review Notes

- The final renderer diff matches the approved architecture: the core stays small, dependency direction remains one-way, app-shell composition no longer pretends to be reusable shared UI, and migrated business-specific modules now sit behind explicit feature boundaries.
- The remaining residual risk is low severity and documentation-level: generic visual wrappers such as `LabeledField` standardize layout, but accessibility associations still need to stay explicit in each consuming component.

## Documentation Updates

- Updated the requirement doc to mark the story complete and checked all acceptance criteria.
- Updated the plan doc with completed status, implementation outcome, verification, and CR notes, including the follow-on app-shell and feature-boundary cleanup.
- Updated the test-spec doc to reflect the final generic pattern set, the `Switch` primitive, and the app-shell/feature entry-point boundary contract.
- Updated the done doc closeout summary to reflect the implemented `app/shell`, `features/*`, and compatibility-barrel outcome.

## Verification

Verified with the final focused renderer suite:

- `npx vitest run tests/electron/renderer/main-workspace-layout-status-slot.test.ts tests/electron/renderer/left-sidebar-import-panel.test.ts tests/electron/renderer/main-header-view-selector.test.ts tests/electron/renderer/main-header-agent-highlights.test.ts tests/electron/renderer/main-content-floating-layout.test.ts tests/electron/renderer/feature-entry-points.test.ts tests/electron/renderer/composer-bar-reasoning-effort.test.ts tests/electron/renderer/message-content-status-label.test.ts tests/electron/renderer/message-list-editing-controls.test.ts tests/electron/renderer/message-list-failed-turn-actions.test.ts tests/electron/renderer/message-list-tool-pending.test.ts tests/electron/renderer/message-list-collapse-default.test.ts tests/electron/renderer/message-list-plan-visibility.test.ts tests/electron/renderer/skill-editor.test.ts tests/electron/renderer/skill-folder-pane.test.ts tests/electron/renderer/right-panel-content.test.ts tests/electron/renderer/queue-message-item-status-label.test.ts`

Result:

- 17 files passed
- 85 tests passed

## Final State

- The Electron renderer now has a documented, tested, and enforced design-system core with clear layer ownership.
- App-owned composition is exposed through `app/shell`, feature-owned business UI is exposed through `features/<domain>`, and the remaining flat `components/` barrel is explicitly transitional.
- The matching requirement, plan, test, and done docs are aligned with the implemented code and final closeout state.