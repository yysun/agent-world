# Requirement: Electron World Import/Export Parity with CLI

**Date**: 2026-02-19  
**Type**: Feature Enhancement  
**Component**: Electron Desktop App - World Management  
**Related**: CLI world save/import behavior, cross-computer world migration

## Overview

Add world save/export capability to the Electron app equivalent to CLI `/world save`, and align Electron open/import behavior with CLI file-based world import semantics so users can reliably move worlds between computers.

## Goals

- Provide an Electron UI flow to save/export the currently loaded world to a chosen storage target.
- Ensure Electron import reads world data from selected external file-storage folders, not only by world ID from current runtime storage.
- Support practical migration flow: export on machine A, transfer files, import on machine B.
- Support a simpler transfer format for end users (single-file packaging) without breaking CLI/file-storage compatibility.
- Keep existing world/session UI behavior intact outside import/export flows.

## Functional Requirements

### REQ-1: Electron World Export Action

When a world is loaded in Electron:

- **MUST** provide a user-visible action to export/save the loaded world.
- **MUST** include all persisted world data in export:
  - world configuration
  - agents
  - chats/sessions
  - events (when available)
- **MUST** allow user selection of export storage type:
  - `file`
  - `sqlite`
- **MUST** allow user selection of target directory path.
- **MUST** present explicit success/failure feedback with meaningful details.
- **MUST** preserve current loaded-world/session context after export attempt (no forced world switch).

### REQ-2: Electron Import Semantics Must Match CLI Intent

When user triggers world import in Electron:

- **MUST** read world data from a selected **world folder** (single world), not from a marker file such as `/.world`.
- **MUST** validate world-folder structure using file-storage semantics, including expected persisted artifacts such as:
  - `config.json` (required)
  - `agents/` (optional; may be absent for worlds without saved agents)
  - `chats/` (when chats exist)
  - event storage artifacts (when present)
- **MUST** provide clear error messages when the selected folder is not a valid world folder.
- **MUST** import selected world data into the existing runtime storage target for Electron (merge/add behavior), not replace whole storage.
- **MUST** import associated agents/chats/events when present.

### REQ-3: Duplicate/Conflict Handling During Import

Before writing imported world data into target storage:

- **MUST** detect conflicts by both:
  - world `id`
  - world `name`
- **MUST** ask for explicit user confirmation before resolving a conflict via overwrite/replacement behavior.
- **MUST** identify the specific conflicting existing world in the confirmation prompt before any destructive action.
- **MUST** support canceling conflict resolution without modifying existing target data.
- **MUST** report conflict type (`id`, `name`, or both) and outcome clearly.

### REQ-4: Post-Import Runtime Consistency

After successful import:

- **MUST** make imported world available in Electron world list immediately.
- **MUST** allow immediate loading/selection of the imported world.
- **MUST** return/update session list and counts consistently with existing load-world flow.
- **MUST** preserve existing renderer subscription/event behavior.

### REQ-5: Cross-Computer Portability Workflow

System behavior **MUST** support this end-to-end user workflow:

1. Export world on source computer to file target directory.
2. Transfer exported directory to destination computer.
3. Import world from transferred directory in Electron on destination.
4. Open imported world with chats/agents/history intact.

### REQ-6: Optional ZIP Transfer Format (UX Layer)

To simplify transfer between computers:

- **SHOULD** support exporting a world as a single `.zip` file.
- **SHOULD** support importing from `.zip` by extracting and validating the contained world folder structure.
- **MUST** keep world-folder import/export as the canonical data model.
- **MUST** ensure ZIP import runs the same validation/conflict checks as folder import (`id` + `name`).
- **MUST** preserve compatibility with existing CLI file-storage workflows (ZIP is an additional transport option, not a replacement).

## Non-Functional Requirements

### Usability

- Import/export actions **SHOULD** be discoverable near existing world management controls.
- Prompts and outcomes **SHOULD** be concise and actionable.
- Canceled operations **MUST** not show misleading failure states.

### Data Integrity

- Import/export **MUST** avoid partial writes where feasible or report partial-copy warnings explicitly.
- Existing unrelated worlds/data **MUST NOT** be modified by import/export of a single world.

### Compatibility

- **MUST** work with current Electron storage runtime configuration.
- **MUST** remain compatible with worlds produced by existing CLI save/import workflows.
- **MUST** preserve behavior for users who do not use import/export.

## Constraints

### Technical Constraints

- Must use existing Electron IPC bridge pattern (renderer ↔ preload ↔ main).
- Must reuse existing core/storage APIs where possible.
- Must not require users to run CLI for routine import/export when using Electron.

### Scope Constraints

- Requirement covers world import/export behavior only.
- Requirement does not introduce new world schema/versioning format changes.
- ZIP support, when implemented, is packaging/transport only and must not change internal world schema.

## Acceptance Criteria

- [ ] Electron provides a world export/save action for loaded worlds.
- [ ] Export flow prompts for storage type (`file` or `sqlite`).
- [ ] Export flow prompts for destination directory.
- [ ] Export result reports counts/details and success/failure.
- [ ] Electron import reads from external file-storage source folders.
- [ ] Import validates a world folder by persisted structure (`config.json`, `agents`, etc.), without requiring a `/.world` marker file.
- [ ] Import adds the imported world into existing storage rather than replacing unrelated stored worlds.
- [ ] Import detects duplicate world IDs and world names in target and requests explicit conflict confirmation.
- [ ] Import copies world/agents/chats/events when available.
- [ ] Imported world appears in world list and can be loaded immediately.
- [ ] Cross-computer migration workflow succeeds without CLI dependency.
- [ ] (Optional enhancement) Export can produce a `.zip` package for one-click transfer.
- [ ] (Optional enhancement) Import accepts `.zip` and applies identical structure/conflict validation as folder import.

## Architecture Review Notes (AR)

### Decision

- **Recommended approach**: implement folder-based parity first (mandatory), then add ZIP as an optional UX layer.

### Tradeoffs

- **Folder-only**
  - Pros: aligns directly with existing storage APIs and CLI behavior; lower implementation risk.
  - Cons: less convenient to share (multiple files/folders).
- **ZIP-only**
  - Pros: easiest sharing for users.
  - Cons: adds extraction/temporary-file complexity and can hide validation failures until unpack time.
- **Hybrid (recommended)**
  - Pros: preserves robust canonical model and adds user-friendly transfer.
  - Cons: slightly larger implementation/testing surface.

## User Stories

### Story 1: Export from Electron
**As a** desktop user  
**I want to** export my active world from the Electron UI  
**So that** I can back it up or move it elsewhere.

### Story 2: Import on Another Computer
**As a** desktop user  
**I want to** import a transferred world folder into Electron  
**So that** I can continue working with full history and configuration.

### Story 3: Safe Conflict Handling
**As a** desktop user  
**I want to** confirm before overwrite when a world already exists  
**So that** I do not lose existing data unintentionally.
