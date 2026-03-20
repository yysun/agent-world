# Requirement: World-Scoped Skill Registry Path Resolution

**Date**: 2026-03-19
**Type**: Feature / behavior change
**Component**: `core` skill registry, Electron renderer/main world selection flows

## Summary

Project-scope skill discovery must stop depending on the process-wide `AGENT_WORLD_WORKSPACE_PATH` and `AGENT_WORLD_DATA_PATH` environment variables.

Instead, project-scope skill roots must be derived from the active world's existing `variables` text, with a user-home fallback (`~/`) when no world-scoped path is available.

When the frontend changes the selected working directory for a world, it must persist that change into the world's existing `variables` text and refresh the visible skill registry. When the frontend switches to a different world, it must also refresh the skill registry so the project-scope skills shown to the user match the newly active world's `variables`.

## Problem Statement

The current behavior mixes two different sources of truth for project skill scope:

1. `core/skill-registry.ts` still derives default project roots from process-wide env variables.
2. The frontend lets users choose a world-specific working directory, but that world-local choice is not the canonical source used everywhere for skill registry refresh.
3. Skill-registry refresh behavior is currently tied to ad hoc workspace/project path inputs instead of the active world's env state.

This produces drift between the world the user is looking at and the project skills the product discovers for that world.

## Goals

- Make `world.variables` the canonical source of project-scope skill path resolution.
- Remove `AGENT_WORLD_WORKSPACE_PATH` and `AGENT_WORLD_DATA_PATH` as authorities for skill-registry project root selection.
- Keep skill-registry output aligned with the active world's selected working directory stored in `variables`.
- Ensure project-scope skill lists refresh immediately after world cwd changes and world switches.

## Non-Goals

- Redesigning skill registry UI.
- Changing global-skill discovery behavior.
- Changing unrelated storage/runtime behavior unless required to support the world-scoped skill-registry contract.
- Reworking world variable editing UX outside the flows needed to keep skill registry state accurate.

## Requirements

### R1: `world.variables` is the canonical project-skill source

Project-scope skill discovery must resolve its active project root from the active world's `variables` text, not from `AGENT_WORLD_WORKSPACE_PATH` or `AGENT_WORLD_DATA_PATH`.

### R2: Canonical variable key for project-scope skill discovery

The active world's `variables` text must continue to hold the world-scoped working directory used for project-scope skill discovery.

For this story, the project-scope skill root must follow the same world-local working-directory selection shown in the frontend.

### R3: User-home fallback

If the active world has no usable project/workspace path in its `variables` text, project-scope skill discovery must fall back to the user's home directory root (`~/`) rather than `process.cwd()`.

### R4: No skill-registry dependency on removed env vars

`core/skill-registry.ts` must not use `AGENT_WORLD_WORKSPACE_PATH` or `AGENT_WORLD_DATA_PATH` when deriving default project-skill roots for discovery or filtering.

### R5: Frontend cwd selection updates world env

When the frontend user selects a cwd/project folder for a world, that choice must be persisted into the loaded world's existing `variables` text before the UI treats the new cwd as authoritative.

### R6: Frontend cwd selection refreshes skill registry

After a successful cwd/project-folder update for the active world, the frontend must refresh the skill registry so project-scope entries reflect the newly selected `working_directory` stored in `variables`.

### R7: World switch refreshes skill registry

When the frontend switches from one world to another, the skill registry must refresh against the newly active world's `variables` before the skill list is treated as current.

### R8: Refresh behavior must follow active-world isolation

Skill-registry refresh on world switch or cwd update must remain scoped to the active world only. A refresh for one world must not leak project-scope skill roots from another world.

### R9: Existing global/project filtering semantics remain intact

This change must preserve the existing global-skill vs project-skill filtering behavior, collision precedence, and registry metadata contract. Only the project-root source-of-truth and refresh triggers are changing.

### R10: Renderer and main process must agree on the active world context

Any renderer-triggered skill-registry refresh must use the same active-world `variables` context that the backend/runtime considers authoritative for the loaded world, so the UI does not display project skills from a stale workspace path.

## Acceptance Criteria

1. If a world has `working_directory=/tmp/project-a` in `variables`, project-scope skill discovery resolves project roots from `/tmp/project-a`, not from `AGENT_WORLD_WORKSPACE_PATH` or `AGENT_WORLD_DATA_PATH`.
2. If the active world has no usable `working_directory` value in `variables`, project-scope skill discovery falls back to `~/`.
3. When the user selects a new cwd in the frontend for the loaded world, the world's `variables` reflects that cwd and the skill registry refreshes without requiring an app restart.
4. When the user switches from world A to world B, the skill registry refreshes and reflects world B's project-scope skills rather than world A's previous cwd.
5. Global-skill entries and project-over-global collision precedence continue to behave as they do today.

## Architecture Review Notes (AR)

### Findings

- The requested behavior is coherent for skill registry and world-selection flows, but the repo still uses `AGENT_WORLD_DATA_PATH` for storage-path configuration outside the skill-registry path-resolution concern.
- A full project-wide deletion of `AGENT_WORLD_DATA_PATH` would be a broader storage/runtime story than the behavior described in this request.
- The current renderer already refreshes the skill registry in some cases, but it still passes project/workspace paths directly instead of treating active world `variables` as the canonical source of truth.

### AR Decision

Proceed with this story as a world-env and skill-registry source-of-truth change:

- remove `AGENT_WORLD_WORKSPACE_PATH` and `AGENT_WORLD_DATA_PATH` from skill-registry project-root resolution,
- make active world `variables` authoritative for project-scope skill discovery,
- refresh skill registry after world cwd updates and world switches.

Storage-specific use of `AGENT_WORLD_DATA_PATH` is explicitly out of scope for this REQ unless separately expanded.

### Exit Condition

No major architecture issue remains once project-scope skill discovery and renderer refresh behavior are driven by active world `variables` rather than the removed process-wide workspace/data env vars.
