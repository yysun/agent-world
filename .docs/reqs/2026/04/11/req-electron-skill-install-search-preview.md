# Requirement: Electron Skill Install Search and Preview Flow

**Date**: 2026-04-11  
**Type**: Feature Enhancement  
**Component**: Electron Desktop App - Skill installation editor flow

## Overview

Redesign the Electron skill installation experience so that all installation inputs live in the main editor area instead of the current toolbar-heavy layout.

The new flow must begin with a search/display surface where the user can browse or search installable skills. After selecting a skill, the editor must switch into a preview surface that behaves like the existing skill editor: file content on the left and file tree on the right. From that preview surface, the back button must return to the search/display surface rather than closing the entire install editor.

This requirement applies to the install flow only. Existing file-backed skill edit mode remains a separate workflow.

## Goals

- Move all skill installation fields and controls into the main editor content area.
- Replace the current install-first toolbar flow with a search/display-first flow.
- Let users select a skill before entering file preview.
- Reuse the existing skill-editor interaction quality for previewing installable skill files.
- Make preview back-navigation return to the search/display stage instead of leaving the install editor entirely.
- Preserve the existing ability to install into project or global scope.

## Functional Requirements

### REQ-1: Main-Area Install Controls

When the Electron skill install editor is opened:

- **MUST** place all install-related inputs and actions in the main editor area.
- **MUST NOT** require the primary install inputs to live in the top toolbar.
- **MUST** keep the install flow visually anchored in the workspace editor surface rather than in compact toolbar rows.
- **MUST** preserve the existing install entry point into the install editor workspace.

### REQ-2: Search/Display First Stage

The install editor must open into a search/display stage before any skill-file preview is shown.

- **MUST** show a search/display interface as the first visible stage of the install editor.
- **MUST** allow the user to discover candidate skills before entering preview.
- **MUST** support the existing install sources used by the Electron skill install flow.
- **MUST** clearly show the currently active source context so the user knows what catalog or source they are browsing.
- **SHOULD** let the user change search/display inputs without immediately dropping them into preview.

### REQ-3: Skill Selection and Preview Transition

After the user chooses a skill from the search/display stage:

- **MUST** open a skill preview stage for the selected skill.
- **MUST** populate the preview using the selected install source and selected skill.
- **MUST** make the selected skill identity clear in the preview surface.
- **MUST** keep the preview scoped to the currently selected candidate skill rather than a generic draft.

### REQ-4: Preview Layout

The preview stage must behave similarly to the existing skill editor.

- **MUST** show file content in the main left editor area.
- **MUST** show the selected skill's file tree in the right pane.
- **MUST** allow file selection from the tree while staying in the preview stage.
- **MUST** support readable preview of markdown/text content.
- **MUST** preserve current non-editable preview behavior for files that should not be editable in install preview.
- **SHOULD** visually align with the existing skill editor so preview feels familiar.

### REQ-5: Preview Back Behavior

Within the preview stage:

- **MUST** provide a back action.
- **MUST** make that back action return to the search/display stage.
- **MUST NOT** have the preview back action close the entire install editor.
- **MUST** preserve enough state when returning that the user can continue browsing without re-entering all search/display inputs.

### REQ-6: Install Action Placement and Scope

The install flow must still support explicit installation choices.

- **MUST** preserve target-scope selection for `project` and `global` installs.
- **MUST** keep the install action available within the redesigned main-area flow.
- **MUST** make it clear what skill will be installed and into which scope.
- **MUST NOT** remove the requirement for explicit user-triggered install confirmation.

### REQ-7: Search/Preview State Continuity

Moving between search/display and preview stages:

- **MUST** preserve the selected skill and source context while previewing.
- **MUST** preserve search/display state when returning from preview.
- **MUST NOT** lose the discovered skill list or current selection context as a normal consequence of entering preview and backing out.
- **SHOULD** avoid unnecessary reloads when returning from preview to search/display.

### REQ-8: Existing Install Semantics

The redesign must preserve current install semantics.

- **MUST** continue using the existing preview/import behavior for installable skill content.
- **MUST** continue supporting project-scope and global-scope installation.
- **MUST NOT** change the meaning of installed files or the canonical install roots.
- **MUST NOT** regress existing installed-skill edit mode.

## Non-Functional Requirements

### Usability

- The initial install surface **SHOULD** feel like browsing/selecting a skill, not editing a form in a toolbar.
- The preview surface **SHOULD** feel close to the existing skill editor.
- Navigation between search/display and preview **MUST** be obvious.

### Compatibility

- The feature **MUST** fit the current Electron renderer workspace-editor model.
- The feature **SHOULD** reuse existing preview/editor patterns where practical.
- The feature **MUST** preserve current install source support and backend install contracts unless a later plan explicitly changes them.

### Regression Safety

- The feature **MUST NOT** regress existing file-backed skill edit mode.
- The feature **MUST NOT** regress actual install behavior once a skill is selected and confirmed.
- The feature **MUST NOT** regress the ability to preview a skill before install.

## Constraints

### Scope Constraints

- This requirement covers the Electron skill install UX only.
- This requirement does not redesign normal installed-skill editing.
- This requirement does not change backend skill import contract semantics.
- This requirement does not change web app skill flows.

### Technical Constraints

- The implementation **MUST** follow Electron renderer UI ownership rules.
- The implementation **SHOULD** reuse the existing skill preview/editor surface where it improves consistency.
- The implementation **MUST** preserve current preview/import boundaries unless a later plan explicitly approves a contract change.

## User Stories

### Story 1: Browse Skills Before Preview

**As a** desktop user installing a skill  
**I want to** start from a search/display interface  
**So that** I can browse available skills before entering a file preview.

### Story 2: Preview a Selected Skill Like an Editor

**As a** desktop user evaluating a skill for installation  
**I want to** preview its files in an editor-style layout  
**So that** I can inspect what I am about to install.

### Story 3: Return from Preview to Results

**As a** desktop user previewing a candidate skill  
**I want to** back out to the search/display stage  
**So that** I can compare or choose another skill without leaving the install editor.

### Story 4: Keep Install Scope Explicit

**As a** desktop user installing a skill  
**I want to** clearly choose project or global install scope  
**So that** the install destination stays explicit.

## Acceptance Criteria

- [ ] Opening the install editor shows a search/display stage first rather than dropping directly into preview-oriented controls.
- [ ] All primary install controls are moved into the main editor area.
- [ ] Selecting a skill from the search/display stage opens a preview stage.
- [ ] The preview stage shows file content on the left and a file tree on the right.
- [ ] The preview back button returns to the search/display stage.
- [ ] Returning from preview preserves the previous search/display context.
- [ ] The redesigned flow still supports both project and global install scope.
- [ ] The redesigned flow preserves existing install preview/import semantics.
- [ ] Existing installed-skill edit mode remains unaffected.

## Notes for Next Stage

- The next `AP` stage should decide whether install search/display and install preview are two states of the existing `SkillEditor` or a small wrapper flow that reuses it only for preview.
- The next `AP` stage should define exactly which install controls live in search/display versus preview.
- The next `AP` stage should define how GitHub and local-source browsing differ while still fitting a single main-area interaction model.