# DD: Built-in `write_file` Tool with Trusted-Scope Security

**Date:** 2026-02-28  
**Status:** Complete  
**Related REQ:** `.docs/reqs/2026/02/28/req-write-file-tool.md`  
**Related AP:** `.docs/plans/2026/02/28/plan-write-file-tool.md`

## Summary

Completed implementation of a new built-in `write_file` tool that supports deterministic text writes inside trusted scope with explicit mode behavior (`create` or `overwrite`), structured success payloads, and clear error outcomes.

The final delivery includes:
- core tool definition and registration,
- targeted and regression tests,
- code-review-driven hardening for create-mode race safety,
- AP checklist completion.

## Completed Scope

### 1) New built-in tool: `write_file`

Added `createWriteFileToolDefinition()` in `core/file-tools.ts` with:
- input contract:
  - `filePath` (or alias `path`)
  - `content` (required string)
  - `mode` (`create` | `overwrite`, default `overwrite`)
- trusted working-directory resolution using existing helper,
- path scope validation using existing trusted-directory checks,
- directory-target rejection,
- deterministic JSON result payload:
  - `ok`, `status`, `filePath`, `mode`, `operation`, `created`, `updated`, `bytesWritten`.

### 2) Built-in registry wiring

Updated `core/mcp-server-registry.ts` to:
- import `createWriteFileToolDefinition`,
- instantiate `writeFileTool` in `getBuiltInTools()`,
- register `write_file` through `wrapToolWithValidation(...)`.

### 3) Unit and registry tests

Added `tests/core/file-tools.test.ts` with deterministic mocked FS/scope behavior and coverage for:
- in-scope successful write with metadata,
- `create` conflict when file exists,
- out-of-scope path rejection,
- missing content validation rejection,
- directory-target rejection.

Updated `tests/core/mcp-server-registry.test.ts` to:
- mock `createWriteFileToolDefinition`,
- assert built-in inventory includes `write_file`.

## CR Findings and Fixes

### Finding fixed

- **Create-mode race (TOCTOU) risk:** `create` writes could race between pre-check and write.

### Fix applied

- Hardened write path in `core/file-tools.ts` by using atomic file creation in `create` mode:
  - `flag: 'wx'` for create-only writes,
  - `EEXIST` handling mapped to deterministic `file already exists` error.

### Added regression test

- Added `fails create mode when file appears between stat and write (EEXIST race)` case in `tests/core/file-tools.test.ts`.

## Requirement Coverage

1. **REQ-1 Tool availability:** `write_file` registered in built-in tools.
2. **REQ-2 Input contract:** required content and path validation enforced.
3. **REQ-3 Trusted scope:** path resolution + trusted-directory enforcement applied.
4. **REQ-4 Write modes:** explicit `create`/`overwrite` semantics implemented.
5. **REQ-5 Directory/file handling:** directory targets rejected; parent dirs created deterministically.
6. **REQ-6 Output contract:** structured success payload returned.
7. **REQ-7 Error handling:** clear, deterministic error strings for validation/scope/mode conflicts.

## Verification

### Commands executed during SS

1. `npm test -- tests/core/file-tools.test.ts tests/core/mcp-server-registry.test.ts`
2. `npm run check --workspace=core`
3. `npm run integration`
4. `npm test`

Results at SS completion:
- targeted suites passed,
- core typecheck passed,
- integration suite passed,
- full unit suite passed.

### Commands executed during CR hardening

1. `npm test -- tests/core/file-tools.test.ts`
2. `npm test -- tests/core/file-tools.test.ts tests/core/mcp-server-registry.test.ts`

Results:
- race-condition fix and updated tests passed.

## Key Files

- `core/file-tools.ts`
- `core/mcp-server-registry.ts`
- `tests/core/file-tools.test.ts`
- `tests/core/mcp-server-registry.test.ts`
- `.docs/reqs/2026/02/28/req-write-file-tool.md`
- `.docs/plans/2026/02/28/plan-write-file-tool.md`
