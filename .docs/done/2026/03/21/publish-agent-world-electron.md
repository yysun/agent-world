# Publish Agent World Electron

**Date**: 2026-03-21  
**Status**: Completed With Deferred Follow-Ups  
**Type**: CR + DD

## Scope Completed

- Established the desktop release contract and authoritative version alignment between the root package and `electron/package.json`.
- Added Electron packaging configuration for installer-grade macOS and Windows outputs, plus runtime staging so packaged apps include the required built core assets.
- Added runtime dependency sync/check automation so packaged Electron builds carry the core runtime dependencies required by `dist/core`.
- Validated packaging outputs and updater metadata for the currently supported local-host targets:
  - macOS arm64: DMG + ZIP + `latest-mac.yml`
  - Windows x64: NSIS EXE + blockmap + `latest.yml`
- Added GitHub release automation for tagged desktop publishes, including stable vs prerelease channel handling and manual `workflow_dispatch` release-tag input.
- Centralized release tag/version/channel resolution in `scripts/release-metadata.js` so tagged and manual releases follow the same contract.
- Updated the README header with macOS and Windows download badges pointing to the latest GitHub release.

## Code Review Outcome

- Completed CR over the uncommitted release automation, packaging, contract-test, and README changes.
- Found and fixed one high-priority cross-platform issue in `scripts/release-metadata.js`: the direct-execution guard built a `file://...` URL from `process.argv[1]`, which is not reliable for Windows drive-letter paths.
- Added regression coverage for Windows-style path normalization and direct-execution detection.
- After the fix, no remaining blocking correctness issues were identified in the reviewed scope.

## Validation

- Focused release-contract coverage passed:
  - `npx vitest run tests/release-metadata.test.ts tests/electron/package-contract.test.ts`
  - Result: 8 tests passed.
- Release preparation guardrails passed:
  - `npm run release:prepare`
  - Result: version alignment and Electron runtime dependency alignment both passed.

## Deferred Follow-Ups

- Phase 4 remains open: in-app update lifecycle, renderer update UI, manual update checks, release notes UI, and graceful failure handling are not implemented yet.
- Phase 5 remains open: installed-app upgrade-path verification and data-preservation validation still need dedicated coverage.
- Phase 6 remains partially open: maintainer runbook, troubleshooting guide, and post-release checklist still need to be documented.
- Remaining host-specific installer validation is still needed for macOS x64 and Windows arm64.

## Files Delivered

- `.github/workflows/electron-release.yml`
- `scripts/release-metadata.js`
- `scripts/sync-electron-runtime-deps.js`
- `tests/release-metadata.test.ts`
- `tests/electron/package-contract.test.ts`
- `electron/package.json`
- `electron/package-lock.json`
- `package.json`
- `README.md`
- `.docs/plans/2026/03/21/plan-publish-agent-world-electron.md`

## Related Docs

- `.docs/reqs/2026/03/21/req-publish-agent-world-electron.md`
- `.docs/plans/2026/03/21/plan-publish-agent-world-electron.md`