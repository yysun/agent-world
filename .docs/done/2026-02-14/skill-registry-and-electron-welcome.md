# Skill Registry and Electron Welcome Screen

**Date**: 2026-02-14  
**Type**: Feature + UX Improvement

## Overview

Implemented a core singleton skill registry with sync support and integrated it into the Electron new-chat welcome screen. The registry now auto-syncs on core load, resolves metadata from SKILL front matter, hashes full file content, enforces project-over-user precedence on collisions, and is exposed through Electron IPC for renderer display.

## Implementation

- Core skill registry:
  - Added singleton exports and sync API in `core/skill-registry.ts`.
  - `skill_id` is parsed from front-matter `name`; `description` is parsed from front-matter `description`.
  - Hashing now uses full `SKILL.md` content.
  - Added startup auto-sync on module load and `waitForInitialSkillSync` for deterministic startup waiting.
  - Collision resolution now guarantees project-scope skills override user-scope skills.
  - Default user roots include:
    - `~/.agents/skills`
    - `~/.codex/skills`

- Electron IPC and preload bridge:
  - Added new invoke channel contract: `skill:list`.
  - Added main handler/route wiring to sync and return registry entries.
  - Added preload `listSkills()` bridge method with typed return (`SkillRegistrySummary[]`).
  - Added generic response typing in preload invoke helper for strict TypeScript compatibility.

- Electron renderer welcome screen:
  - Replaced empty-chat placeholder with centered welcome state.
  - Added skill registry list display (skill name + compact description).
  - Simplified welcome card design to a compact single-surface layout.
  - Added scrollable skill-list region for larger skill sets.
  - Updated welcome copy to be shorter and removed session-name greeting.

- Documentation:
  - Added/updated REQ + AP docs for core skill registry work:
    - `.docs/reqs/2026-02-14/req-core-skill-registry.md`
    - `.docs/plans/2026-02-14/plan-core-skill-registry.md`

## Testing

- Core + Electron targeted tests:
  - `npm test -- tests/core/skill-registry.test.ts tests/core/skill-registry-autosync.test.ts tests/electron/main/main-ipc-routes.test.ts tests/electron/preload/preload-bridge.test.ts tests/electron/preload/preload-invoke.test.ts`

- Electron builds:
  - `npm run main:build --prefix electron`
  - `npm run renderer:build --prefix electron`

All commands completed successfully.
