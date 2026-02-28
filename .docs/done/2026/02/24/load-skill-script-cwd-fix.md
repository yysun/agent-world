# load_skill Script Execution CWD Fix

**Date:** 2026-02-24

## Summary

Fixed a bug in `core/load-skill-tool.ts` where skill scripts referenced in `SKILL.md` were executed with the wrong working directory (`context.workingDirectory`, the project root) instead of the skill's own root directory (`skillRoot`).

## Problem

When `load_skill` auto-executes scripts referenced in a `SKILL.md` file, the execution `cwd` was being set to:

```typescript
const executionDirectory = options.context?.workingDirectory || options.skillRoot;
```

Given a skill at `/projects/myapp/.agents/skills/my-skill/SKILL.md` and a project root of `/projects/myapp`, the cwd would be `/projects/myapp` instead of `/projects/myapp/.agents/skills/my-skill`. This caused scripts that resolved relative paths or expected to find sibling files to fail.

## Correct Behavior

- **Project:** `/projects/myapp`
- **Skill dir:** `/projects/myapp/.agents/skills/my-skill`
- **Script ref in SKILL.md:** `scripts/s.py`
- **Expected execution:** `command: python3`, `parameters: /projects/myapp/.agents/skills/my-skill/scripts/s.py`, `cwd: /projects/myapp/.agents/skills/my-skill`

The `cwd` must always be the skill root so that scripts can resolve sibling files and relative imports correctly.

## Changes

### `core/load-skill-tool.ts`

1. **Changed `executionDirectory` to always use `skillRoot`:**
   ```typescript
   // Before (buggy):
   const executionDirectory = options.context?.workingDirectory || options.skillRoot;
   // After (fixed):
   const executionDirectory = options.skillRoot;
   ```

2. **Removed redundant `isPathWithinRoot(executionDirectory, ...)` guard** that checked whether the absolute script path was within the project working directory. This check was wrong after the cwd change — the correct boundary is `options.skillRoot`, which was already validated earlier in the loop via `isPathWithinRoot(options.skillRoot, absoluteScriptPath)`.

3. Updated file header comment to reflect the intent.

### `tests/core/load-skill-tool.test.ts`

- **Replaced** `'rejects referenced scripts that resolve outside workingDirectory and skips execution'` with `'validates script scope using skill-root-relative path when skill is a subdirectory of cwd'`, which correctly verifies:
  - `validateShellCommandScope` is called with skill-root-relative path (`scripts/setup.sh`) and `skillRoot` as the trusted boundary
  - `executeShellCommand` is called with absolute script path and `skillRoot` as cwd (not the project working directory)

## Test Results

12/12 tests pass in `tests/core/load-skill-tool.test.ts`.

## Notes

- The skill registry correctly returns the full SKILL.md path via `getSkillSourcePath(skillId)`, and `path.dirname(sourcePath)` yields the correct `skillRoot`.
- `context.workingDirectory` (project root) is no longer used in `executeSkillScripts` — only `skillRoot` is used for both security validation and execution cwd.
