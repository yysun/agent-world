# Done: Web Tool Permission E2E Stabilization

**Date:** 2026-03-24
**Status:** Completed
**Related:** [REQ](../../../reqs/2026/03/11/req-tool-permissions.md), [Plan](../../../plans/2026/03/12/plan-tool-permissions.md), [Prior Done](../../03/12/tool-permissions.md)

## Summary

Completed the follow-up stabilization work for the web tool-permission Playwright suite so the permission matrix now runs deterministically in both focused reruns and the full browser suite.

The remaining flaky paths were the real-model `shell_cmd` and `create_agent` approval branches. They were drifting across unrelated prompt branches during long runs, causing the UI to stall on assistant streaming instead of surfacing the expected HITL prompt. The fix narrowed those scenarios to tool-specific seeded prompts, forced exact branch matching, and ran each permission level in a fresh chat.

## Delivered

1. **Narrow prompt builders for the remaining flaky permission families**
   - Added `buildShellPermissionPrompt()` for `SHELL_READ`, `SHELL_ASK`, `SHELL_AUTO`, and `SHELL_RISKY_AUTO`.
   - Added `buildCreateAgentPermissionPrompt()` for `CREATE_AGENT_READ`, `CREATE_AGENT_APPROVAL`, and `CREATE_AGENT_AUTO`.
   - Both builders explicitly forbid plain-text hesitation before the tool call and forbid drifting into other tool families.

2. **Permission E2E spec now uses isolated fresh-chat flows consistently**
   - Updated the `shell_cmd` matrix test to use a fresh chat per permission level and direct agent routing via `@e2e-google`.
   - Updated the `create_agent` read/ask/auto coverage to use the narrow prompt and the same fresh-chat setup.
   - Preserved the full approval lifecycle assertions for `create_agent`, including approval prompt completion and backend agent-list verification.

3. **Prompt-builder regression coverage added**
   - Extended the unit-only prompt helper test coverage to lock in the new shell and create-agent branch wording.
   - This protects against future prompt edits that would reintroduce cross-branch reuse or manual approval hesitation.

4. **Create-agent refresh ordering fix remained in place**
   - The earlier `create_agent` runtime fix that delays world refresh publication until the post-create prompt finishes remained part of the stabilized end-to-end path.

## Files Delivered

- `tests/web-e2e/support/web-harness.ts`
- `tests/web-e2e/tool-permissions.spec.ts`
- `tests/web-domain/web-harness-seeded-agent.test.ts`
- `core/create-agent-tool.ts`
- `tests/core/create-agent-tool.test.ts`

## Validation Executed

- `npx vitest run tests/web-domain/web-harness-seeded-agent.test.ts`
- `npm run test:web:e2e:run -- tests/web-e2e/tool-permissions.spec.ts -g "shell_cmd follows the read/ask/auto matrix"`
- `npm run test:web:e2e:run -- tests/web-e2e/tool-permissions.spec.ts -g "create_agent asks for approval and creates the agent at ask"`
- `npm run test:web:e2e:run -- tests/web-e2e/tool-permissions.spec.ts -g "create_agent keeps the approval flow at auto"`
- `npm run test:web:e2e:run`

## Final Result

- Full web Playwright suite result: **56 passed, 5 skipped**
- The previously failing permission-related web E2E cases now pass:
  - `shell_cmd follows the read/ask/auto matrix`
  - `create_agent asks for approval and creates the agent at ask`
  - `create_agent keeps the approval flow at auto`

## Notes

- This done note documents the stabilization follow-up only. The original permission-matrix feature delivery remains documented in `.docs/done/2026/03/12/tool-permissions.md`.
- The workspace still contains unrelated pre-existing modifications outside this fix area; they were not part of this stabilization task.
