# Skill Script Absolute Path Directive

**Date:** 2026-02-24

## Summary

Fixed `load_skill` for global (user-level) skills: the LLM now receives the skill root path in the `<execution_directive>` so it knows to use absolute paths when invoking scripts via `shell_cmd`. Without this, the LLM would use relative paths like `scripts/init_skill.py` from the project directory, causing "can't open file" errors for global skills whose scripts are outside the project tree.

## Root Cause

`executeSkillScripts` correctly resolves and auto-executes skill scripts with absolute paths from the skill root. However, the SKILL.md `<instructions>` content references scripts with relative paths (e.g., `scripts/init_skill.py my-skill --path skills/public`). After loading the skill, the LLM reads these instructions and invokes the scripts via `shell_cmd` using those relative paths. For a global skill at `~/.codex/skills/.system/skill-creator/`, no `scripts/` directory exists under the project directory, producing:

```
Python: can't open file '/Users/esun/Documents/Projects/test-agent-world/scripts/init_skill.py': [Errno 2] No such file or directory
```

## Changes

### `core/load-skill-tool.ts`

1. Added `skillRoot: string` and `scriptPaths: string[]` parameters to `buildSuccessResult`.
2. When `scriptPaths.length > 0`, appended a 4th point to `<execution_directive>`:
   ```
   4. Scripts referenced in <instructions> are located at skill root: {skillRoot}. When invoking them via shell commands, construct the absolute path (e.g., {skillRoot}/scripts/example.py) since they may not be accessible via relative paths from the project directory.
   ```
3. Updated the `buildSuccessResult` call site to pass `skillRoot` and `scriptPaths`.
4. Removed temporary debug logs added during investigation.

### `tests/core/load-skill-tool.test.ts`

- Added assertion to `'validates script scope using skill-root-relative path when skill is a subdirectory of cwd'`: verifies skill root path appears in execution directive.
- Added new test `'omits skill root directive from execution_directive when skill has no referenced scripts'`: verifies the directive is omitted when there are no script references.

## Test Results

13/13 tests pass.
