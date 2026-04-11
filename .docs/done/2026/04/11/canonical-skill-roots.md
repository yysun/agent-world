# Done: Canonical Skill Roots

**Date:** 2026-04-11
**Status:** Completed
**Related:** [REQ](../../reqs/2026/04/11/req-canonical-skill-roots.md), [Plan](../../plans/2026/04/11/plan-canonical-skill-roots.md)

## Summary

Completed the canonical Agent World skill-root standardization for discovery, import defaults, runtime path handling, and user-facing documentation.

This delivery makes `~/.agent-world/skills` the canonical global root, makes `<project folder>/.agent-world/skills` the canonical on-disk project root, and removes legacy skill-root compatibility from discovery and import defaults.

## Delivered

1. **Shared canonical root contract**
   - Added `core/skill-root-contract.ts`.
   - Centralized:
     - canonical global root
   - canonical project display root
     - precedence ordering
     - canonical project alias remapping

2. **Canonical-first discovery and precedence**
   - Updated `core/skill-registry.ts` to resolve roots through the shared contract.
   - Made precedence explicit so canonical roots win over legacy roots within the same scope.
   - Preserved project-over-global precedence after canonical-vs-legacy ordering.
   - Kept legacy roots readable so previously installed skills remain discoverable.

3. **Canonical write/import defaults**
   - Updated Electron skill import defaults in `electron/main-process/ipc-handlers.ts`.
   - Global imports now default to `~/.agent-world/skills`.
   - Project imports now default to `<project folder>/.agent-world/skills` on disk.
   - GitHub import candidates now use `.agent-world/skills/<name>` as the only canonical skill-folder layout.

4. **Runtime path-surface alignment**
   - Updated `core/shell-cmd-tool.ts` so skill-relative path resolution recognizes the canonical project alias `.agent-world/skills/...`.
   - Updated `core/file-tools.ts` so read/list/grep flows accept the canonical project alias rooted at `./.agent-world/skills`.

5. **Docs and regression coverage**
   - Updated `README.md` to describe the canonical roots and project-folder-based path resolution.
   - Updated the implementation plan status and completion checkboxes.
   - Added targeted regression coverage for:
     - canonical global-root default discovery
     - canonical-over-legacy collision precedence
     - canonical project alias handling in file tools
     - canonical project alias handling in shell skill-path resolution
     - canonical-first GitHub skill import/discovery ordering

## Scope

- Changed core skill-root resolution, runtime path helpers, Electron skill import behavior, docs, and unit tests.
- Removed legacy roots from default discovery and import behavior.

## Code Review Outcome

- Completed CR on the shared root contract, registry precedence behavior, runtime helper changes, Electron import changes, and updated tests.
- No blocking correctness, regression, or maintainability findings remained after the final pass.

## Verification

Executed and passed:

- `npm test -- tests/core/skill-registry.test.ts tests/core/file-tools.test.ts tests/core/shell-cmd-tool.test.ts tests/electron/ipc-handlers.test.ts`
- `npm test`

Observed final full-suite result:

- `264` test files passed
- `2035` tests passed

## Files Delivered

- `core/skill-root-contract.ts`
- `core/skill-registry.ts`
- `core/shell-cmd-tool.ts`
- `core/file-tools.ts`
- `electron/main-process/ipc-handlers.ts`
- `README.md`
- `tests/core/skill-registry.test.ts`
- `tests/core/file-tools.test.ts`
- `tests/core/shell-cmd-tool.test.ts`
- `tests/electron/ipc-handlers.test.ts`
- `.docs/reqs/2026/04/11/req-canonical-skill-roots.md`
- `.docs/plans/2026/04/11/plan-canonical-skill-roots.md`
- `.docs/done/2026/04/11/canonical-skill-roots.md`

## Remaining Work

- If the product wants to remove legacy-root reads entirely, that should be a separate migration/deprecation story with explicit user migration handling.
- If a migration helper is needed for old skill directories, that should be handled as a separate follow-up.
