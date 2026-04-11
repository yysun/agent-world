# Requirement: Electron Agent and World Full-Area Editors

**Date**: 2026-04-11  
**Type**: Feature Enhancement  
**Component**: Electron Desktop App - Renderer editor surfaces for agent/world configuration

## Overview

Replace the current popup-based long-text editing flows in the Electron renderer with dedicated full-area editor experiences modeled after the existing skill editor.

Today, the agent create/edit flow expands `systemPrompt` into a modal popup, and the world edit flow expands `variables` and `mcpConfig` into a shared modal popup. This requirement introduces two editor surfaces:

- an **Agent Editor** for editing an agent system prompt within the main workspace area
- a **World Editor** for editing long-form world configuration text within the main workspace area

The new editors must open from the existing expand affordances instead of popup modals and must preserve the existing world/agent draft-save model.

## Goals

- Replace modal editing for agent system prompts with a workspace editor surface.
- Replace modal editing for world variables and world MCP config with a workspace editor surface.
- Match the interaction quality and workspace presence of the existing skill editor.
- Preserve current world/agent form drafts and final save behavior.
- Avoid regressions in the existing create/edit panel flows.

## Functional Requirements

### REQ-1: Agent Editor Entry and Scope

When a user is in the Electron create-agent or edit-agent panel:

- **MUST** provide an editor entry action from the existing system-prompt expand affordance.
- **MUST** open an Agent Editor in the main workspace area instead of opening a modal popup.
- **MUST** load the current draft `systemPrompt` value from the active create/edit agent form.
- **MUST** clearly indicate which agent draft is being edited.
- **MUST** preserve the originating panel context so the user can return to the same create/edit flow.

### REQ-2: World Editor Entry and Scope

When a user is in the Electron edit-world panel:

- **MUST** provide editor entry actions from the existing world long-text expand affordances.
- **MUST** open a World Editor in the main workspace area instead of opening a modal popup.
- **MUST** support editing the same long-form world fields currently handled by the popup flow:
  - `variables` (`.env` text)
  - `mcpConfig` (JSON text)
- **MUST** load the current draft value for the selected world field.
- **MUST** clearly indicate which world draft and which field are being edited.

### REQ-3: Full-Area Editor Behavior

For both Agent Editor and World Editor:

- **MUST** use a full-area workspace presentation comparable to the skill editor rather than a blocking dialog.
- **MUST** include a clear return path back to the originating workflow.
- **MUST** provide an explicit apply/save action for the editor surface.
- **MUST** provide a clear title and editing context so the user knows what text is being edited.
- **MUST** support large text comfortably without the size limitations of the current popup modals.
- **SHOULD** visually align with the existing skill editor patterns for toolbar, layout, and editor affordances.

### REQ-4: Draft Update Semantics

For both editor surfaces:

- **MUST NOT** directly persist changes to backend storage when the editor surface apply/save action is used.
- **MUST** write accepted changes back into the active in-memory agent/world draft model.
- **MUST** preserve the existing final persistence flow:
  - agent drafts remain persisted through the existing create/update agent action
  - world drafts remain persisted through the existing create/update world action
- **MUST** allow the user to leave the editor without silently overwriting the originating draft when the editor changes are not applied.

### REQ-5: Form and Navigation Continuity

Opening and closing either editor:

- **MUST** preserve unrelated unsaved changes already present in the active world or agent form.
- **MUST NOT** reset the active create/edit form state.
- **MUST NOT** switch the loaded world, selected chat, or selected agent as a side effect.
- **MUST** return the user to the same panel mode and draft context they launched from.
- **SHOULD** preserve enough context that the user can continue the save flow without re-entering data.

### REQ-6: World Field-Specific Behavior

For the World Editor:

- **MUST** preserve the existing distinction between env-style text and JSON-style text.
- **MUST** make it clear whether the user is editing Variables or MCP Config.
- **MUST** keep existing validation expectations intact for the final world save flow, including MCP JSON validity requirements.
- **MUST NOT** change the meaning of existing world fields or the payload sent through current world create/update APIs.

### REQ-7: Agent Field-Specific Behavior

For the Agent Editor:

- **MUST** keep the agent `systemPrompt` value semantically identical to the current field.
- **MUST NOT** change agent create/update payload shape or the meaning of system prompts.
- **MUST** support both create-agent drafts and edit-agent drafts.

### REQ-8: Popup Replacement

After this feature is adopted:

- **MUST** stop using the current popup modal flow for:
  - agent system prompt editing
  - world variables editing
  - world MCP config editing
- **MUST** route the existing expand actions to the new editor surfaces instead.
- **MUST** keep other unrelated modal/editor behaviors unchanged.

## Non-Functional Requirements

### Usability

- The new editors **SHOULD** feel consistent with the skill editor rather than like resized dialogs.
- The editing context **SHOULD** be readable at a glance.
- The return/apply actions **MUST** be obvious and reliable.

### Compatibility

- The feature **MUST** fit the existing Electron renderer architecture and IPC-free draft editing model for panel forms.
- The feature **MUST** preserve current world and agent validation behavior.
- The feature **MUST** avoid changing backend, storage, or transport contracts unless a later plan explicitly requires it.

### Regression Safety

- The feature **MUST NOT** regress the existing skill editor workspace flow.
- The feature **MUST NOT** regress right-panel create/edit form behavior outside the replaced popup flows.
- The feature **MUST NOT** introduce panel-state loss when switching between a form and its editor surface.

## Constraints

### Scope Constraints

- This requirement covers Electron renderer UX for agent/world long-text editing only.
- This requirement does not introduce new world fields or new agent fields.
- This requirement does not change final save ownership from the existing world/agent panel actions.
- This requirement does not require changes to web app editing flows.

### Technical Constraints

- The implementation **MUST** remain within Electron renderer architecture and follow the current layered UI ownership rules.
- The implementation **SHOULD** reuse existing workspace editor patterns where practical.
- The implementation **MUST** preserve current validation and update boundaries for agent/world mutations.

## User Stories

### Story 1: Edit Agent Prompt Without a Popup

**As a** desktop user editing an agent  
**I want to** open the system prompt in a full editor view  
**So that** I can work on long prompts with more space and less modal friction.

### Story 2: Edit World Variables in a Workspace Editor

**As a** desktop user editing a world  
**I want to** open world variables in a full editor view  
**So that** I can edit environment-style text without using a popup.

### Story 3: Edit World MCP Config in a Workspace Editor

**As a** desktop user editing a world  
**I want to** open MCP config in a full editor view  
**So that** I can comfortably inspect and edit larger JSON content.

### Story 4: Keep My Draft Intact

**As a** desktop user editing a world or agent draft  
**I want to** move in and out of the editor without losing form state  
**So that** I can continue the existing save flow safely.

## Acceptance Criteria

- [ ] Expanding Agent System Prompt opens an Agent Editor in the main workspace area instead of a popup modal.
- [ ] The Agent Editor loads the current create-agent or edit-agent draft prompt text.
- [ ] The Agent Editor applies accepted changes back to the active agent draft without directly saving to backend storage.
- [ ] Expanding World Variables opens a World Editor in the main workspace area instead of a popup modal.
- [ ] Expanding World MCP Config opens a World Editor in the main workspace area instead of a popup modal.
- [ ] The World Editor clearly indicates whether it is editing Variables or MCP Config.
- [ ] The World Editor loads the current world draft text for the selected field.
- [ ] The World Editor applies accepted changes back to the active world draft without directly saving to backend storage.
- [ ] Returning from either editor preserves the current panel mode and the rest of the draft form state.
- [ ] Existing agent/world final save actions continue to own persistence.
- [ ] No unrelated modal/editor flows are replaced.

## Notes for Next Stage

- The next `AP` stage should decide whether Agent Editor and World Editor are separate feature-owned components or variants over a shared renderer editor pattern.
- The next `AP` stage should define exact unsaved-change behavior for editor close/back actions.
- The next `AP` stage should define whether the World Editor uses one shared component with field modes or distinct editor entry views.