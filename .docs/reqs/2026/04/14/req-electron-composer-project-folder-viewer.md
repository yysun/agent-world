# Requirement: Electron Composer Project Folder Viewer

**Date**: 2026-04-14  
**Type**: Feature Enhancement  
**Component**: Electron Desktop App - chat composer project controls and workspace folder viewer

## Overview

Redesign the Electron chat composer project affordance so the current combined folder icon plus Project label becomes two distinct actions.

Today the composer exposes one Project button that uses the existing folder-selection behavior. This requirement separates that experience into:

- an **Open Folder** icon button that keeps the current folder-picker behavior
- a **Project** button that opens a workspace folder viewer for the currently selected project folder

The new folder viewer must use a workspace-editor presentation similar to the existing skill editor: file content on the left and a folder tree on the right.
For supported text files, the viewer now also acts as an editor with an explicit save action similar to the skill editor.

## Goals

- Separate folder-picking and folder-viewing into two explicit composer actions.
- Preserve the current open-folder behavior behind a dedicated icon button.
- Add a Project viewer that opens in the main workspace area instead of overloading the picker action.
- Reuse the existing Electron workspace editor interaction quality established by the skill editor.
- Preserve current project-folder selection semantics used by chat/project context.

## Functional Requirements

### REQ-1: Composer Toolbar Split Actions

In the Electron chat composer toolbar:

- **MUST** replace the current combined Project affordance with two separate buttons.
- **MUST** present a dedicated icon-only button for opening a folder chooser.
- **MUST** present a separate Project button for opening a folder viewer.
- **MUST** keep both actions visually grouped as part of the composer toolbar.
- **SHOULD** make the distinction between selecting a folder and viewing a folder obvious at a glance.

### REQ-2: Open Folder Button Behavior

For the new Open Folder icon button:

- **MUST** preserve the existing folder-picker behavior used by the current composer Project control.
- **MUST** open the native folder selection flow exactly as the current action does today.
- **MUST** continue updating the active project-folder selection used for chat/project context.
- **MUST NOT** automatically open the folder viewer as a side effect unless a later plan explicitly chooses that behavior.
- **MUST NOT** change existing project selection persistence or world-scoped project-path semantics.

### REQ-3: Project Button Viewer Entry

For the new Project button:

- **MUST** open a workspace folder viewer instead of launching the folder picker.
- **MUST** use the currently selected project folder as the viewer source.
- **MUST** make it clear which folder is being viewed.
- **MUST** provide a clear return path back to the chat workspace.
- **SHOULD** allow the Project button to remain the primary visible label for the current project context.

### REQ-4: No-Project Selected State

When no project folder is currently selected:

- **MUST** handle Project button activation gracefully.
- **MUST NOT** fail silently.
- **MUST** either disable the Project button with clear unavailable state or open a clear empty/unavailable state that explains no project folder is selected.
- **MUST** preserve the Open Folder button as the path for selecting a folder.
- **SHOULD** make the next action obvious so the user can select a project folder without confusion.

### REQ-5: Folder Viewer Layout

The Project folder viewer must use a layout comparable to the Electron skill editor.

- **MUST** open in the main workspace/editor area rather than a small popup or dropdown.
- **MUST** show file content in the left pane.
- **MUST** show the folder tree in the right pane.
- **MUST** allow the user to select files from the folder tree and load them into the left pane.
- **MUST** support nested folders in the tree view.
- **SHOULD** align visually with the existing skill editor toolbar and split-pane treatment.

### REQ-6: Folder Viewer Reading Scope

Within the folder viewer:

- **MUST** read from the selected project folder.
- **MUST** support previewing common text-based project files that are useful to inspect in-context.
- **MUST** make the currently selected file path visible.
- **MUST** keep file selection scoped to the current project folder.

### REQ-6A: Editable Text File Support

For supported text files in the project viewer:

- **MUST** allow the file content to be edited in the left pane.
- **MUST** provide an explicit save affordance comparable to the skill editor.
- **MUST** keep edits and saves scoped to files inside the selected project folder.
- **MUST** continue showing clear placeholders for binary, unsupported, or oversized files instead of implying those file types are editable.
- **MUST NOT** allow the viewer to escape the selected project boundary while reading or saving files.

### REQ-7: Navigation and Workspace Continuity

Opening and closing the Project folder viewer:

- **MUST** preserve the current world, selected chat, and composer draft.
- **MUST NOT** reset unrelated right-panel or chat state as a side effect.
- **MUST** return the user to the same chat workspace context they launched from.
- **MUST NOT** change project-folder selection merely by viewing files.
- **SHOULD** preserve enough state that returning from the viewer feels like a temporary inspection flow rather than a mode switch with data loss.

### REQ-8: Existing Project Context Semantics

This redesign must preserve the meaning of the selected project folder in the Electron app.

- **MUST** keep the selected project folder as the same chat/world context input used today.
- **MUST NOT** change the payloads, storage meaning, or backend semantics associated with project-folder selection.
- **MUST NOT** change non-viewer project behavior outside the composer split-action redesign.

## Non-Functional Requirements

### Usability

- The split controls **SHOULD** remove ambiguity between opening a folder and viewing project files.
- The folder viewer **SHOULD** feel like a first-class workspace tool rather than a modal inspector.
- The viewed folder and file context **MUST** be readable at a glance.

### Compatibility

- The feature **MUST** fit the existing Electron renderer workspace-editor architecture.
- The feature **SHOULD** reuse existing split-pane editor patterns where practical.
- The feature **MUST** preserve current folder-selection contracts unless a later plan explicitly changes them.

### Regression Safety

- The feature **MUST NOT** regress the current folder-picker action.
- The feature **MUST NOT** regress existing skill editor flows.
- The feature **MUST NOT** regress composer send/stop/reasoning/tool-permission behavior.
- The feature **MUST NOT** clear chat UI state when entering or leaving the folder viewer.

## Constraints

### Scope Constraints

- This requirement covers the Electron composer project controls and project folder viewer only.
- This requirement does not redesign the web composer.
- This requirement does not introduce new backend project-context semantics.
- This requirement includes text-file editing and explicit save behavior inside the project folder viewer.
- This requirement does not introduce arbitrary project mutations outside explicit file edits initiated from the viewer.

### Technical Constraints

- The implementation **MUST** remain within the Electron renderer/main-process architecture already used for folder and editor flows.
- The implementation **SHOULD** reuse skill-editor-style layout patterns where that improves consistency.
- The implementation **MUST** preserve the existing project-path selection boundary and current folder open behavior.

## User Stories

### Story 1: Open a Folder Without Ambiguity

**As a** desktop user composing a message  
**I want to** use a dedicated open-folder icon  
**So that** choosing a project folder is separate from viewing project files.

### Story 2: Inspect the Current Project in a Workspace Viewer

**As a** desktop user working with a selected project folder  
**I want to** open a project viewer from the composer  
**So that** I can inspect files in a larger split-pane workspace.

### Story 3: Browse the Folder Tree and Read Files

**As a** desktop user reviewing project context  
**I want to** select files from a folder tree and read them in the main pane  
**So that** I can understand the project without leaving the app.

### Story 4: Return to Chat Without Losing Context

**As a** desktop user using the project viewer mid-conversation  
**I want to** return to the chat with my draft and session state intact  
**So that** file inspection does not interrupt message composition.

## Acceptance Criteria

- [ ] The composer project affordance is split into an Open Folder icon button and a separate Project button.
- [ ] The Open Folder icon button preserves the current folder-picker behavior.
- [ ] The Project button opens a workspace folder viewer instead of the folder picker.
- [ ] The folder viewer uses the selected project folder as its source.
- [ ] The folder viewer shows file content on the left and a folder tree on the right.
- [ ] The folder tree supports nested folders and file selection.
- [ ] Selecting a file loads its content into the left pane.
- [ ] Supported text files can be edited and saved from the viewer.
- [ ] Binary, unsupported, and oversized files remain non-editable and are handled explicitly.
- [ ] When no project folder is selected, the Project action handles that state clearly and without silent failure.
- [ ] Entering and leaving the folder viewer preserves the current chat/workspace state.
- [ ] Existing selected-project semantics and folder-picker behavior remain unchanged.

## Notes for Next Stage

- The next `AP` stage should decide whether the folder viewer is a new feature-owned editor surface or a thin variant over the existing workspace editor pattern.
- The next `AP` stage should define the exact empty-state behavior when no project folder is selected.
- The next `AP` stage should define which text file types are editable by default and how traversal limits are surfaced in the UI for very large repos.