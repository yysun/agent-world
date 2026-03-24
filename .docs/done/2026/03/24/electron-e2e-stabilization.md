# Done: Electron E2E Stabilization

**Date:** 2026-03-24
**Status:** Completed
**Related:** [Prior Done](../../03/10/electron-playwright-e2e-harness.md), [Prior Done](../../03/11/web-playwright-e2e-stability.md)

## Summary

Completed a stabilization pass on the real Electron Playwright suite so the full desktop end-to-end run is green again.

The failures were a mix of real-model prompt drift and harness/bootstrap instability. The permission-matrix agent would sometimes ignore seeded branches and ask for missing inputs like file paths, URLs, shell commands, agent names, or `skill_id`s. Some HITL flows also branched into chained approvals that were not handled consistently, and one intermittent bootstrap failure came from SQLite WAL-mode PRAGMA errors surfacing asynchronously during workspace initialization.

The fixes tightened the seeded Electron prompt family, made the permission messages literal instead of “preconfigured,” taught the harness to distinguish assistant completion from follow-up HITL prompts, and hardened SQLite PRAGMA setup so bootstrap no longer crashes on transient WAL-mode failures.

## Delivered

1. **Deterministic Electron permission prompt routing**
   - Hardened `WRITE_FILE_*`, `WEB_FETCH_*`, `SHELL_*`, `CREATE_AGENT_*`, and `LOAD_SKILL_*` prompt branches.
   - Added explicit “never ask for …” and “never reply with …” guardrails for the exact clarification fallbacks observed in failing runs.
   - Updated permission-spec user messages to include literal file paths, URL, shell commands, agent config, and `skill_id`.

2. **HITL chain handling for Electron E2E**
   - Added a harness helper that can wait for either a resumed assistant token or a follow-up HITL prompt.
   - Updated `load_skill` ask coverage to handle both valid outcomes after the first approval instead of assuming a second prompt always appears.
   - Tightened the chat-flow shell HITL prompt so the model uses `shell_cmd` directly instead of inventing `human_intervention_request`.

3. **Electron bootstrap and teardown stability improvements**
   - Added bounded Electron-app shutdown with process-kill fallback.
   - Switched assistant-token detection to persisted non-user messages in the active chat.
   - Hardened SQLite PRAGMA setup so async WAL-mode errors are ignored instead of crashing bootstrap.

4. **Regression coverage**
   - Extended seeded-agent prompt helper tests to lock in the new deterministic wording.
   - Added sqlite-schema regression coverage for async PRAGMA callback failures.

## Files Delivered

- `tests/electron-e2e/support/seeded-agent.ts`
- `tests/electron-e2e/support/electron-harness.ts`
- `tests/electron-e2e/support/fixtures.ts`
- `tests/electron-e2e/tool-permissions.spec.ts`
- `tests/electron-e2e/chat-flow-matrix.spec.ts`
- `tests/electron/e2e/electron-harness-seeded-agent.test.ts`
- `core/events/orchestrator.ts`
- `tests/core/events/orchestrator-chatid-isolation.test.ts`
- `core/storage/sqlite-schema.ts`
- `tests/core/storage/sqlite-schema.test.ts`

## Validation Executed

- `npx vitest run tests/core/events/orchestrator-chatid-isolation.test.ts`
- `npx vitest run tests/electron/e2e/electron-harness-seeded-agent.test.ts`
- `npx vitest run tests/core/storage/sqlite-schema.test.ts`
- Focused Electron reruns for:
  - `shell_cmd requires HITL at ask`
  - `create_agent blocks at read`
  - `create new chat and send HITL`
  - `write_file blocks at read`
  - `load_skill asks for approval and runs scripts at ask`
  - `web_fetch follows the read/ask/auto matrix`
  - `shell_cmd auto-approves low-risk at auto`
- `npm run test:electron:e2e:run -- tests/electron-e2e/tool-permissions.spec.ts`
- `npm run test:electron:e2e:run`

## Final Result

- Full Electron Playwright suite result: **62 passed**
- The previously unstable permission and HITL Electron E2E flows now pass in the final full run.

## Notes

- This done note records the stabilization follow-up rather than the original Electron E2E harness delivery.
- The workspace contained unrelated pre-existing modifications outside this stabilization scope; they were not part of this task.
