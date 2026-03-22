# Done: Load Skill No Auto Script Run

**Date:** 2026-03-22
**Status:** Completed
**Related:** [REQ](../../reqs/2026/03/22/req-load-skill-no-auto-script-run.md), [Plan](../../plans/2026/03/22/plan-load-skill-no-auto-script-run.md)

## Summary

Completed the `load_skill` contract change so skill loading no longer auto-executes instruction-referenced scripts.

`load_skill` is now a pure load step:

- reads and injects `SKILL.md` instructions
- preserves static referenced-script guidance for later explicit execution
- keeps approval semantics for loading/applying the skill
- leaves task execution authority to later explicit tool calls such as `shell_cmd`

This removes misleading transcript states where a skill appeared to have already performed the user task during load.

## Scope Completed

1. **Removed automatic script execution from the successful `load_skill` path**
   - The `load_skill` success flow no longer calls the referenced-script execution branch.
   - Successful `load_skill` results no longer depend on script exit codes, stdout, or stderr.

2. **Kept static skill guidance intact**
   - `skill_root` still appears in success result content.
   - Execution guidance remains in the execution directive for later explicit tool calls.
   - The later explicit execution tool call remains responsible for task output and display content.

3. **Removed dynamic execution output from `load_skill` transcript payloads**
   - `<active_resources>` is reduced to `<skill_root>` only.
   - No `Script outputs:` summary is emitted from `load_skill` result content.
   - Persisted `load_skill` envelopes now use `preview: null` and omit `display_content`.
   - No synthetic assistant tool-result row is emitted for `load_skill`.
   - `load_skill` no longer injects failed script-output text for scripts that require arguments.

4. **Adjusted approval wording**
   - Approval messaging now describes loading/applying the skill rather than immediately executing scripts.
   - Referenced scripts are described as inputs for later execution.

5. **Updated historical docs**
   - Added supersession notes to older February/March docs that established or assumed the obsolete auto-run contract.
   - Preserved those docs as historical records while clearly marking the new 2026-03-22 behavior as authoritative.

## Code Review Outcome

- Completed CR over the uncommitted runtime/test/doc diff.
- No high-priority correctness, architecture, performance, maintainability, or security findings remain for this change set.

## Verification

- `npm test -- --run tests/core/load-skill-tool.test.ts`
- `npm test -- --run tests/core/synthetic-assistant-tool-result.test.ts tests/core/shell-cmd-integration.test.ts`
- `npm run integration`

## Files Delivered

- `core/load-skill-tool.ts`
- `core/synthetic-assistant-tool-result.ts`
- `tests/core/load-skill-tool.test.ts`
- `tests/core/synthetic-assistant-tool-result.test.ts`
- `tests/core/shell-cmd-integration.test.ts`
- `.docs/reqs/2026/03/22/req-load-skill-no-auto-script-run.md`
- `.docs/plans/2026/03/22/plan-load-skill-no-auto-script-run.md`
- `.docs/done/2026/03/22/load-skill-no-auto-script-run.md`
- `.docs/reqs/2026/02/14/req-safe-skill-script-execution.md`
- `.docs/done/2026/02/14/safe-skill-script-execution-hitl.md`
- `.docs/reqs/2026/02/24/req-skill-script-execution-context.md`
- `.docs/done/2026/02/24/skill-script-execution-context.md`
- `.docs/reqs/2026/03/01/req-load-skill-feedback.md`
