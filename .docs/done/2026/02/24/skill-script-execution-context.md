# Skill Script Execution Context

**Date:** 2026-02-24
**Requirement:** `.docs/reqs/2026-02-24/req-skill-script-execution-context.md`

> Historical note: this doc records the older behavior where `load_skill` invoked scripts directly.
> That contract was superseded on 2026-03-22 by [req-load-skill-no-auto-script-run.md](../../reqs/2026/03/22/req-load-skill-no-auto-script-run.md).

## Summary

Fixed the execution working directory (CWD) for skill scripts invoked during `load_skill`. Scripts now run with the user's Current Project Directory as CWD, not the skill root. Script paths are still resolved to absolute paths from the skill root.

## Changes

### `core/load-skill-tool.ts`

Single line change in `executeSkillScripts` (`core/load-skill-tool.ts:338`):

```typescript
// before — CWD was skill root (wrong):
const executionDirectory = options.skillRoot;

// after — CWD is project directory, skill root as fallback:
const executionDirectory = options.context?.workingDirectory || options.skillRoot;
```

`trustedWorkingDirectory` passed to `executeShellCommand` already mirrors `executionDirectory`, so it updates automatically.

`validateShellCommandScope` continues to use `options.skillRoot` as the trusted boundary for script path validation — unchanged and correct per REQ-1.

### `tests/core/load-skill-tool.test.ts`

Updated the `'validates script scope using skill-root-relative path when skill is a subdirectory of cwd'` test assertion:

```typescript
// before (wrong):
expect(mockedExecuteShellCommand).toHaveBeenCalledWith(
  'bash',
  ['/projects/myapp/skills/my-skill/scripts/setup.sh'],
  '/projects/myapp/skills/my-skill',   // skillRoot as CWD
  expect.objectContaining({ timeout: 120000 }),
);

// after (correct):
expect(mockedExecuteShellCommand).toHaveBeenCalledWith(
  'bash',
  ['/projects/myapp/skills/my-skill/scripts/setup.sh'],
  '/projects/myapp',                   // project dir as CWD
  expect.objectContaining({ timeout: 120000 }),
);
```

## Requirement Coverage

| Requirement | Status |
|---|---|
| REQ-1: Resolve script paths to absolute from skill root | ✅ unchanged |
| REQ-2: Execute scripts with project directory as CWD | ✅ fixed |
| REQ-3: Scripts self-locate bundled resources (script author contract) | ✅ N/A |
| REQ-4: Global skills use absolute path + project CWD | ✅ covered by REQ-1 + REQ-2 |

## Test Results

12/12 tests pass.
