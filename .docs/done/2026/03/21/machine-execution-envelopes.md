# Machine-Executed Tool Envelopes

**Date**: 2026-03-21  
**Status**: Completed With Deferred Follow-Ups

## Scope Completed

- Reused the existing `tool_execution_envelope` contract for machine-executed runtime results without changing ordinary assistant-response storage.
- Extended shared envelope artifact helpers to recognize richer artifact categories, including HTML, PDF, and PPTX outputs.
- Refactored `load_skill` script execution so per-script outcomes retain structured status, bounded result text, derived previews, and artifact references before assembly into the outer `load_skill` result.
- Added artifact-aware `load_skill` preview/result handling for Markdown, HTML bundles with JS/CSS companions, PDF outputs, media/image artifacts, and non-inline file references.
- Adopted the durable envelope model for persisted `web_fetch` executions while preserving existing approval and failure behavior.
- Enabled `web_fetch` durable envelope persistence in both the main orchestration path and tool-call continuation/recovery paths.

## Code Review Outcome

- Completed CR over the uncommitted implementation and test diff.
- No high-priority correctness, architecture, performance, maintainability, or security issues were found that required follow-up code changes.
- The remaining gaps are test/documentation completeness items rather than release-blocking defects in the current implementation.

## Validation

- Focused unit coverage passed:
  - `npm test -- tests/core/load-skill-tool.test.ts tests/core/web-fetch-tool.test.ts tests/core/message-prep.test.ts`
  - Result: 64 tests passed.
- Runtime/integration coverage passed:
  - `npm run integration`
  - Result: 24 tests passed across 3 integration files.
- Language-service validation on modified runtime and test files reported no errors after the final patch set.

## Deferred Follow-Ups

- Add frontend-domain regression coverage proving durable preview data renders correctly after reload.
- Add stronger replay/linkage regression coverage for durable tool-result identity and completion matching beyond the current continuation-path assertions.
- Optionally consolidate more shared envelope/outcome normalization helpers if additional machine-executed tools adopt the protocol.

## Files Delivered

- `core/tool-execution-envelope.ts`
- `core/load-skill-tool.ts`
- `core/web-fetch-tool.ts`
- `core/events/orchestrator.ts`
- `core/events/memory-manager.ts`
- `tests/core/load-skill-tool.test.ts`
- `tests/core/web-fetch-tool.test.ts`
- `.docs/plans/2026/03/21/plan-machine-execution-envelopes.md`

## Related Docs

- `.docs/reqs/2026/03/21/req-machine-execution-envelopes.md`
- `.docs/plans/2026/03/21/plan-machine-execution-envelopes.md`