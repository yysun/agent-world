# Done: Windows Test Portability Hardening

**Date:** 2026-03-23
**Status:** Completed

## Summary

Completed a Windows portability hardening pass for the Vitest suite and related tooling config so the repository test run succeeds cleanly on Windows without relying on POSIX shell behavior or fragile global module mocks.

## Delivered

1. **Fixed web Vite root resolution on Windows**
   - `web/vite.config.js` now resolves its root from `import.meta.url` via `fileURLToPath(...)` instead of depending on a POSIX-style path string.
   - Added a targeted regression in `tests/web-domain/vite-config.test.ts`.

2. **Repaired the shared Vitest filesystem harness**
   - `tests/vitest-setup.ts` now keeps real `path` behavior intact while exposing mockable `fs` and `fs/promises` functions backed by the real implementations.
   - Restored safe `process.cwd()` handling for suites that depend on repository-relative resolution.

3. **Removed POSIX-only assumptions from shell and Electron tests**
   - Shell command suites now use portable `node` helper scripts instead of `sh`, `ls`, `cat`, and `/tmp`-style assumptions.
   - The Electron export-world test now uses a temporary export directory rather than ESM-unsafe `fs` spying.

4. **Normalized Windows path behavior across storage, file, skill, and API tests**
   - Updated assertions and virtual filesystem helpers to tolerate drive prefixes, backslashes, and cwd-resolved absolute paths.
   - Relaxed path-sensitive HTML preview expectations where Windows URL encoding legitimately differs from POSIX output.

5. **Removed a release-script parser hazard**
   - Dropped the shebang from `scripts/release-metadata.js` because the repo already invokes it with `node`, and the shebang was causing Vitest parse issues in this environment.

## Code Review Outcome

- Completed CR over the final diff for correctness, portability, and unintended artifact inclusion.
- No blocking findings remain in the delivered change set.

## Validation Executed

- `npx vitest run tests/web-domain/vite-config.test.ts`
- `npx vitest run tests/core/shell-cmd-quoting.test.ts tests/core/shell-process-management.test.ts tests/core/shell-cmd-tool.test.ts tests/core/shell-cmd-integration.test.ts`
- `npx vitest run tests/electron/main/main-ipc-handlers.test.ts tests/electron/e2e/electron-harness-workspace-pruning.test.ts`
- `npx vitest run tests/core/storage/agent-storage.test.ts tests/core/storage/file-event-storage.test.ts tests/core/storage/storage-factory.test.ts tests/core/storage/world-storage.test.ts`
- `npx vitest run tests/core/skill-registry.test.ts tests/core/file-tools.test.ts`
- `npx vitest run tests/api/tool-artifact-route.test.ts`
- `npm test`

## Files Delivered

- `web/vite.config.js`
- `tests/web-domain/vite-config.test.ts`
- `tests/vitest-setup.ts`
- `tests/core/shell-cmd-quoting.test.ts`
- `tests/core/shell-process-management.test.ts`
- `tests/core/shell-cmd-tool.test.ts`
- `tests/core/shell-cmd-integration.test.ts`
- `tests/electron/main/main-ipc-handlers.test.ts`
- `tests/electron/e2e/electron-harness-workspace-pruning.test.ts`
- `tests/core/storage/agent-storage.test.ts`
- `tests/core/storage/file-event-storage.test.ts`
- `tests/core/storage/storage-factory.test.ts`
- `tests/core/storage/world-storage.test.ts`
- `tests/core/skill-registry.test.ts`
- `tests/core/file-tools.test.ts`
- `tests/api/tool-artifact-route.test.ts`
- `scripts/release-metadata.js`
- `.docs/done/2026/03/23/windows-test-portability-hardening.md`