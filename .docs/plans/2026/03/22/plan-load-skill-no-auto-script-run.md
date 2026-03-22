# Architecture Plan: Load Skill Must Not Auto-Run Referenced Scripts

**Date**: 2026-03-22
**Type**: Behavior Change
**Status**: Completed
**Related Requirement**: [req-load-skill-no-auto-script-run.md](../../reqs/2026/03/22/req-load-skill-no-auto-script-run.md)

## Overview

Change `load_skill` so it only loads/injects skill instructions and static skill metadata. It must stop executing referenced scripts during load and must leave task execution to a later explicit tool call from the LLM.

## Current-State Findings

1. `load_skill` currently executes referenced scripts during load via `executeSkillScripts(...)`.
2. The resulting `load_skill` transcript/output path previously included `Script outputs:` blocks derived from that automatic execution.
3. This can create misleading transcript state where a skill appears to have executed the user task during load, even though no explicit task-execution tool call occurred.
4. Skills like `music-to-svg` that require runtime arguments expose the flaw immediately: the script is auto-run without those arguments.

## Architecture Decisions

### AD-1: `load_skill` Becomes a Pure Load Step

- `load_skill` returns instructions and static skill context only.
- It does not perform task execution.

### AD-2: Script References Remain Informational

- `skill_root` and execution guidance still appear in the injected skill context so the LLM can request a later explicit tool call.
- Automatic `Script outputs:` resource gathering is removed.

### AD-3: Transcript Honesty and Ownership

- `load_skill` tool rows must report skill-load success only.
- `load_skill` must not emit preview/display content that could produce a synthetic assistant result row.
- Task execution success/failure belongs only to the later execution tool call.

## Phased Plan

### Phase 1: Remove Automatic Script Execution from `load_skill`

- [x] Remove or bypass `executeSkillScripts(...)` from the successful `load_skill` path.
- [x] Ensure skill-load success results no longer depend on referenced-script execution.

### Phase 2: Preserve Useful Static Skill Context

- [x] Keep `skill_root` and execution guidance in the result/execution directive.
- [x] Remove dynamic `Script outputs:` and richer `<active_resources>` metadata that depended on automatic script execution.

### Phase 3: Align Transcript Output

- [x] Ensure `load_skill` emits no synthetic assistant display content.
- [x] Ensure immediate post-`load_skill` assistant text does not imply task execution success unless a later execution tool call actually ran.

### Phase 4: Testing

- [x] Add targeted unit coverage proving `load_skill` no longer auto-executes referenced scripts.
- [x] Add coverage proving `load_skill` still returns instruction/script-path guidance for later explicit execution.
- [x] Add regression coverage proving `load_skill` emits no preview/display content and no automatic script output blocks.

## Risks and Mitigations

1. **Risk:** Removing script execution strips too much useful context from `load_skill`.
   **Mitigation:** Preserve `skill_root` and execution directive text while removing only dynamic execution output.

2. **Risk:** Assistant UX regresses because users no longer see execution-like output immediately after `load_skill`.
   **Mitigation:** Keep transcript semantics honest; actual execution output should come from the later explicit execution tool call.

3. **Risk:** Existing tests assume automatic script execution.
   **Mitigation:** Replace those expectations with no-auto-run assertions and explicit later-tool-call guidance checks.

## Exit Criteria

- `load_skill` no longer auto-runs referenced scripts.
- `load_skill` still injects skill instructions and static execution guidance.
- `load_skill` transcript output no longer includes automatic script execution results or synthetic assistant display payloads.
- Targeted unit tests pass.
