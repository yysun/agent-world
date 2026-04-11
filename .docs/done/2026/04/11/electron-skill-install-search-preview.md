# Electron Skill Install Search and Preview Flow

**Date**: 2026-04-11  
**Type**: Feature + UX Improvement  
**Status**: Completed

## Overview

Completed the Electron skill install redesign so installation now starts in a browse/search workspace instead of a toolbar-driven preview form.

The delivered flow is split into two explicit stages:
- `browse`: source selection, install scope, repo/folder input, and skill discovery in the main editor area
- `preview`: file preview using the existing editor-style layout with file content on the left and the file tree on the right

The browse screen was further refined to group filters at the top and display GitHub skills like the chat welcome skill list.

## Implementation

- Renderer workspace flow:
  - Updated `electron/renderer/src/App.tsx` to treat skill install as a staged workspace editor route:
    - `kind: 'skill-install', stage: 'browse'`
    - `kind: 'skill-install', stage: 'preview'`
  - Added explicit preview entry and preview-back transitions.
  - Kept browse state and preview state separate so returning from preview preserves source/search context.

- New install browser surface:
  - Added `electron/renderer/src/features/skills/components/SkillInstallBrowser.tsx`.
  - Moved install discovery controls out of the skill preview/editor toolbar and into the main editor content area.
  - Grouped source, scope, repo, and search controls into a top filter block.
  - Restyled GitHub results to match the compact welcome-card skill list pattern used in the chat welcome screen.
  - Kept local installs as a simpler candidate-card flow rather than forcing a fake multi-result catalog.

- Preview reuse:
  - Refactored `electron/renderer/src/features/skills/components/SkillEditor.tsx` so install mode is preview-only.
  - Removed install discovery controls from `SkillEditor`.
  - Kept preview file rendering, markdown preview, file-tree navigation, and install scope/install action in the preview surface.
  - Added preview summary rendering for extracted skill descriptions.

- Async safety:
  - Added stale GitHub-load guarding in `electron/renderer/src/domain/skill-install-preview.ts` and `electron/renderer/src/App.tsx`.
  - GitHub skill-list results now apply only if they belong to the latest active repo request.
  - Repo edits are blocked while a GitHub load is in flight so the displayed repo and returned list do not drift out of sync.

- Feature exports:
  - Exported `SkillInstallBrowser` through `electron/renderer/src/features/skills/components/index.ts` and the skills feature surface.

## Testing and Validation

- Added or updated targeted tests:
  - `tests/electron/renderer/skill-install-browser.test.ts`
  - `tests/electron/renderer/skill-editor.test.ts`
  - `tests/electron/renderer/skill-install-preview-domain.test.ts`
  - `tests/electron/renderer/feature-entry-points.test.ts`

- Focused validation that actually ran:
  - `runTests` on:
    - `tests/electron/renderer/skill-install-browser.test.ts`
    - `tests/electron/renderer/skill-editor.test.ts`
    - `tests/electron/renderer/skill-install-preview-domain.test.ts`
  - Additional focused validation earlier in the work included:
    - `tests/electron/renderer/feature-entry-points.test.ts`

- Latest focused test result:
  - 25 passed, 0 failed

## Notes

- The implementation preserves existing `previewSkillImport` and `importSkill` IPC semantics.
- Existing installed-skill edit mode remains separate from the new install browse flow.
- There is still no dedicated App-level transition harness test for the staged install route in `App.tsx`; current coverage is at the component/domain boundary.

## Related Work

- Requirement: `.docs/reqs/2026/04/11/req-electron-skill-install-search-preview.md`
- Plan: `.docs/plans/2026/04/11/plan-electron-skill-install-search-preview.md`