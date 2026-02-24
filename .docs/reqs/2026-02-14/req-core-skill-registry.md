# Requirement: Core Skill Registry and Synchronization

**Date**: 2026-02-14  
**Type**: Feature  
**Status**: ✅ Requirements Reviewed (AR Completed)

## Architecture Review (AR)

**Review Date**: 2026-02-14  
**Reviewer**: AI Assistant  
**Result**: ✅ APPROVED

### Review Summary

The requested capability is feasible and aligns with the current agent-skill model. A centralized registry in `core` with deterministic synchronization requirements is the correct scope for enabling reliable downstream skill loading and prompt construction.

### Validated Assumptions

- User-agent and project-agent skill folders are both valid sources of `SKILL.md` files.
- Registry entries must be keyed by stable skill identity (`skill_id`) and store hash metadata for change detection.
- Synchronization must handle additions, updates, and removals to keep registry state accurate.

### AR Decision

- Proceed with a singleton registry module exposed from `core`.
- Treat registry consistency (no stale entries) as a required behavior.

## Overview

Create a core-level skill registry module and a synchronization function that discovers skill definitions from configured skill folders, parses front matter from `SKILL.md` files, updates changed entries based on full-file content hash, and removes entries for skills that no longer exist on disk.

## Goals

- Provide one shared registry surface in `core` for skill metadata.
- Keep registry content in sync with actual `SKILL.md` files from supported skill folders.
- Ensure stale or deleted skills are removed from registry state.

## Functional Requirements

- **REQ-1**: `core` must expose a singleton skill registry module through exports that can be consumed by other core features.
- **REQ-2**: Registry entries must include:
  - `skill_id` (string)
  - `description` (string; parsed from SKILL.md front-matter `description`)
  - `hash` (string)
  - `lastUpdated` (string timestamp)
- **REQ-3**: A function `syncSkills` must be exposed for registry synchronization.
- **REQ-3a**: Skill registry sync must run automatically when the core module loads so in-memory skill state is refreshed at startup.
- **REQ-4**: `syncSkills` must scan both user-agent skill directories and project-agent skill directories for `SKILL.md` files.
- **REQ-4a**: Default user-agent skill directories must include both `~/.agents/skills` and `~/.codex/skills`.
- **REQ-5**: For each discovered skill file, `syncSkills` must:
  - parse front matter from `SKILL.md`,
  - resolve `skill_id` from front-matter `name`,
  - resolve `description` from front-matter `description`,
  - compute a hash from the full `SKILL.md` content for comparison,
  - insert a new registry entry when missing.
- **REQ-5a**: Skills missing front-matter `name` must be ignored (not registered).
- **REQ-6**: If a discovered skill already exists in the registry and its full-file content hash has changed, `syncSkills` must update the registry entry and refresh `lastUpdated`.
- **REQ-7**: If a discovered skill already exists and hash is unchanged, registry data must remain unchanged.
- **REQ-7a**: On `skill_id` collisions, project-scope skill definitions must override user-scope definitions regardless of file timestamps.
- **REQ-8**: After scanning, `syncSkills` must remove any registry entries whose corresponding skill files no longer exist.
- **REQ-9**: `syncSkills` must complete successfully when zero skills are present, producing an empty registry state without errors.
- **REQ-10**: Registry behavior must be deterministic for repeated sync runs against unchanged files.

## Non-Functional Requirements

- **NFR-1 (Reliability)**: Sync must be resilient to missing folders and continue processing other valid sources.
- **NFR-2 (Determinism)**: Given unchanged skill files, repeated sync runs must produce identical registry state.
- **NFR-3 (Maintainability)**: Registry API must be straightforward for other core modules to consume without direct filesystem logic.

## Constraints

- Must follow existing core module conventions and export patterns.
- Must not require callers outside `core` to understand folder scanning details.
- Must preserve backward compatibility for unrelated existing skill-loading flows.

## Out of Scope

- Skill execution/runtime behavior changes.
- New UI for skill registry inspection.
- Remote skill source synchronization.

## Acceptance Criteria

- [x] Singleton skill registry module exists in `core` and is exported.
- [x] Registry entries include `skill_id` (from front-matter `name`), `description` (from front-matter `description`), `hash`, and `lastUpdated`.
- [x] `syncSkills` is exposed and scans both user and project skill directories.
- [x] New skills are inserted into registry.
- [x] Changed skills are updated when hash differs.
- [x] Unchanged skills are left intact.
- [x] Removed/missing skills are deleted from registry.
- [x] Sync behaves correctly when no skills exist.
- [x] Re-running sync with unchanged inputs is deterministic.
- [x] Skills without front-matter `name` are ignored.
