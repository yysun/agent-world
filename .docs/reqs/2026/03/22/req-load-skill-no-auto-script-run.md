# Requirement: Load Skill Must Not Auto-Run Referenced Scripts

**Date**: 2026-03-22
**Type**: Behavior Change
**Status**: Requirements Reviewed (AR Completed)
**Related Requirements**:
- [req-synthetic-assistant-tool-result-display.md](../03/21/req-synthetic-assistant-tool-result-display.md)
- [req-tool-execution-envelope.md](../03/06/req-tool-execution-envelope.md)

## Overview

`load_skill` should stop executing instruction-referenced `scripts/...` automatically during skill load.

Instead, `load_skill` must only load and inject the skill protocol from `SKILL.md` plus static skill metadata needed for the model to continue. If the user task requires a script to be run, the LLM must request an explicit follow-up tool call such as `shell_cmd` with the required arguments.

This change removes automatic script preflight/resource gathering from the `load_skill` path and restores the intended separation of concerns:

- `load_skill`: load skill instructions/context
- later tool call: perform task-specific execution

## Goals

- Stop `load_skill` from auto-running referenced scripts.
- Keep `load_skill` focused on injecting skill instructions and static context only.
- Ensure task-specific script execution happens only through explicit later tool calls requested by the LLM.
- Prevent misleading `load_skill` success/failure output that implies a task script already ran.

## Functional Requirements

- **REQ-1**: `load_skill` must not execute instruction-referenced `scripts/...` automatically during skill load.

- **REQ-2**: A successful `load_skill` result must still inject the skill instructions from `SKILL.md` into the model-visible result so the LLM can continue under the skill protocol.

- **REQ-3**: If a skill requires a script to accomplish the user task, that script must be executed only through a later explicit tool call requested by the LLM, not implicitly by `load_skill`.

- **REQ-4**: `load_skill` result content must not report script execution outputs gathered from automatic script execution. Persisted `load_skill` envelopes must not expose assistant-displayable preview/display payloads.

- **REQ-5**: `load_skill` must continue to expose static skill metadata that is useful for later execution, including `skill_root` and any guidance needed for constructing the later explicit tool call.

- **REQ-6**: Existing approval behavior for loading a skill must remain intact; removing auto-script execution must not weaken skill-load approval semantics.

- **REQ-7**: Frontend transcript behavior must stay coherent after this change:
  - the compact `load_skill` tool row remains
  - no synthetic assistant display row should be derived from `load_skill`

- **REQ-8**: `load_skill` must not synthesize or imply task completion merely because the skill loaded successfully.

- **REQ-9**: A later explicit task-execution tool call, if requested by the LLM, remains the canonical source of execution status, artifacts, and synthetic assistant full-result display.

## Non-Functional Requirements

- **NFR-1 (Determinism)**: `load_skill` results must no longer vary based on whether referenced scripts happen to execute successfully during load.
- **NFR-2 (Clarity)**: Tool results and assistant follow-up text must not claim task execution success unless an explicit execution tool call actually ran.
- **NFR-3 (Separation of Concerns)**: Skill loading and task execution must remain distinct runtime steps.
- **NFR-4 (Safety)**: Removing automatic script execution must reduce unintended side effects during skill load.

## Constraints

- Must preserve current `load_skill` instruction-injection semantics.
- Must preserve tool lifecycle ordering and history-isolation guarantees already in the system.
- Must not introduce web/Electron-specific divergence; this is a core behavior change.
- Must keep tests deterministic and avoid real external execution in unit coverage.

## Out of Scope

- Redesigning the `music-to-svg` skill content itself.
- General changes to `shell_cmd` behavior.
- Reworking unrelated synthetic assistant display rules for non-`load_skill` tools.

## Acceptance Criteria

- [ ] Loading a skill with referenced scripts no longer runs those scripts automatically.
- [ ] `load_skill` still returns the skill instructions and execution directive needed for the LLM to continue.
- [ ] `load_skill` no longer emits preview/display content or automatic script output blocks.
- [ ] A later explicit execution tool call is required before any task script output can appear in transcript/tool history.
- [ ] Assistant text no longer implies task execution success immediately after `load_skill` unless a later execution tool call actually succeeded.
- [ ] Existing `load_skill` approval behavior remains intact.
- [ ] Targeted unit tests cover the new no-auto-execution behavior.

## Assumptions

- Skills may still reference scripts in their instructions, but those references are guidance for later execution rather than commands to run during load.
- The LLM can read the injected skill instructions and decide whether to request a later execution tool call with the proper arguments.

## Architecture Review (AR)

**Review Date**: 2026-03-22
**Reviewer**: AI Assistant
**Result**: Approved

### Review Summary

The current automatic script execution inside `load_skill` violates the intended contract boundary. It mixes skill acquisition with task execution, produces misleading transcript output, and can fail for reasons unrelated to the actual user request, as seen when a referenced script expects required arguments that `load_skill` never had.

The correct boundary is:

- `load_skill` loads instructions and static skill context only
- a later explicit execution tool call performs the task

This preserves tool authority, keeps transcript semantics honest, and avoids accidental execution during load.

### Review Decisions

- Remove automatic referenced-script execution from `load_skill`.
- Keep `skill_root` and execution guidance in the returned skill context.
- Ensure transcript/tool output after `load_skill` reflects only skill-load success, not task-execution success.
- Leave task execution status, artifacts, and synthetic assistant full-result display to the later explicit execution tool call, typically `shell_cmd`.

### Review Outcome

- Proceed to implementation planning with `load_skill` treated as a pure skill-load step.
