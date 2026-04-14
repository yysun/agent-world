# Electron Composer Project Folder Viewer

**Date**: 2026-04-14  
**Type**: Feature  
**Status**: Completed

## Overview

Completed the Electron composer project-control split and delivered a project workspace viewer/editor that opens from the new `Project` button.

The final implementation now supports:
- separate Open Folder and Project actions in the composer
- split-pane project browsing with file content on the left and tree navigation on the right
- editable text-file content with explicit save behavior modeled after the skill editor
- markdown preview/text mode for markdown files
- bounded directory traversal and canonical path guards to keep the viewer responsive and scoped safely to the selected project root

## Implementation

- Composer UX:
  - Split the old project affordance into an icon-only folder picker plus a dedicated `Project` viewer button.
  - Kept reasoning and permission controls aligned with the new grouped toolbar layout.

- Renderer workspace editor:
  - Added `project-folder-viewer` as a workspace editor route in `electron/renderer/src/App.tsx`.
  - Added viewer state for folder entries, selected file, editable content draft, saved content, markdown mode, and busy flags.
  - Preserved chat/workspace continuity when entering and leaving the project viewer.

- Project viewer UI:
  - Added `ProjectFolderViewer` and `ProjectFolderPane` under `electron/renderer/src/features/projects/`.
  - Reused the workspace-editor split-pane pattern from the skill editor.
  - Surfaced the selected file path plus save/markdown controls in an in-pane file action row.

- Main-process safety and IPC:
  - Added project folder structure, file read, and file save IPC contracts plus preload/main-process wiring.
  - Added `electron/main-process/project-file-helpers.ts` for bounded traversal, binary/large-file handling, and safe file writes.
  - Fixed CR findings by:
    - rejecting symlink escape paths via canonical parent/target validation
    - capping directory traversal depth and total entries during initial project-tree load

- Documentation:
  - Updated the requirement and architecture plan docs to reflect that the project viewer is now editable for supported text files and that traversal/path safety are part of the implementation.

## Testing and Validation

- Focused tests run:
  - `tests/electron/main-process/project-file-helpers.test.ts`

- Result:
  - All focused helper tests passed after adding regression coverage for traversal caps and symlink escape rejection.

## Related Work

- Requirement: `.docs/reqs/2026/04/14/req-electron-composer-project-folder-viewer.md`
- Plan: `.docs/plans/2026/04/14/plan-electron-composer-project-folder-viewer.md`
