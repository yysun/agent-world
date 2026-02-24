# Requirement: Safe Skill Script Execution via `load_skill` + HITL Approval

**Date**: 2026-02-14  
**Type**: Feature  
**Status**: ✅ Implemented

## Architecture Review (AR)

**Review Date**: 2026-02-14  
**Reviewer**: AI Assistant  
**Result**: ✅ APPROVED

### Review Summary

The direction is valid and aligns with the Agent Skills progressive-loading model: skills live on filesystem, SKILL.md is loaded first, and scripts/resources are loaded on demand with bash-backed execution.  
Primary architecture risk was ambiguous script selection policy (which scripts should run). This review resolves that ambiguity.

### Validated Assumptions

- Skill metadata (`name`, `description`) and skill root path from registry are sufficient to resolve a skill package.
- Script execution should produce output-focused context, not inline script source in prompt content.
- Existing shell safety controls are the correct enforcement layer for script execution.
- Reference files should be loaded on demand and emitted deterministically.

### Options Considered

- **Option A (Rejected)**: Execute all scripts found under `scripts/`.
  - Pros: simple implementation.
  - Cons: unsafe by default, high latency, unnecessary side effects.
- **Option B (Accepted)**: Execute only scripts explicitly referenced by skill instructions (and optionally explicitly requested by tool input).
  - Pros: matches progressive-loading model, minimizes attack surface, deterministic.
  - Cons: requires reference extraction logic and validation.
- **Option C (Deferred)**: Require explicit script list in every `load_skill` call.
  - Pros: strongest control.
  - Cons: weaker out-of-box automation when instructions clearly declare defaults.

### AR Decision

- Proceed with **Option B**.
- Default behavior: execute only scripts referenced by SKILL.md instructions.
- Optional tool input may narrow execution to a subset of referenced scripts.
- Never execute unreferenced/unapproved scripts by directory scan alone.

## Overview

Extend the existing `load_skill` capability so it can safely execute skill-bundled scripts and return their outputs as active resources, aligned with the Agent Skills progressive-loading model.

Add a generic world-level HITL list-option process and require `load_skill` to use it for script-execution approval.

The behavior must preserve existing safety controls and produce a structured result payload that includes:
- full skill instructions (`SKILL.md`)
- script execution outputs
- bundled references/assets context

## Goals

- Enable runtime script execution from skill packages through `load_skill`.
- Reuse existing shell safety protections instead of introducing parallel execution logic.
- Add a generic option-based HITL request/response process for world workflows.
- Require explicit user approval before `load_skill` executes referenced scripts.
- Return script outputs and references in a structured `<active_resources>` block.
- Keep compatibility with progressive disclosure (load only what is needed).

## Functional Requirements

- **REQ-1**: `load_skill` must support executing scripts that belong to the resolved skill package.
- **REQ-2**: Script execution must follow the Agent Skills filesystem model (skill-local files and on-demand loading).
- **REQ-3**: Script execution invoked by `load_skill` must use the existing shell command safety guardrails (same safety policy and scope protections used by current shell tooling).
- **REQ-4**: `load_skill` must prevent execution of scripts outside the resolved skill directory scope.
- **REQ-4a**: By default, `load_skill` must execute only scripts explicitly referenced in `SKILL.md` (including referenced local markdown/resources that in turn declare script commands, if supported).
- **REQ-4b**: In this scope, script selection is instruction-referenced only; additional caller-provided script filtering is deferred.
- **REQ-4c**: `load_skill` must not execute scripts discovered only by directory enumeration without instruction-level reference.
- **REQ-5**: `load_skill` must return results using this envelope contract:

```xml
<skill_context id="{{skill_id}}">
  <instructions>
    {{full_skill_markdown_content}}
  </instructions>

  <active_resources>
    <script_output source="{{script_name}}">
      {{script_execution_result}}
    </script_output>
    
    <reference_files>
      {{bundled_asset_list_or_content}}
    </reference_files>
  </active_resources>

  <execution_directive>
    You are now operating under the specialized {{skill_name}} protocol. 
    1. Prioritize the logic in <instructions> over generic behavior.
    2. Use the data in <active_resources> to complete the user's specific request.
    3. If the workflow is multi-step, explicitly state your plan before executing.
  </execution_directive>
</skill_context>
```

- **REQ-6**: `<script_output>` must include the script identifier in `source` and the script execution result payload in the body.
- **REQ-7**: `<reference_files>` must include bundled references relevant to the current skill execution context (at minimum as a deterministic list; optionally with content when required).
- **REQ-8**: If script execution fails, `load_skill` must return a structured result indicating script failure without causing runtime crash.
- **REQ-9**: If requested skill/script cannot be resolved, `load_skill` must return a structured not-found/error result.
- **REQ-10**: Multiple script/reference outputs (if present) must be returned in deterministic order.
- **REQ-11**: Script execution context must use skill-root-safe relative paths with canonical path validation.
- **REQ-12**: The system must provide a generic HITL option request/response process at world scope so any runtime flow can present a list of options and await a user selection.
- **REQ-13**: `load_skill` must request HITL approval before executing referenced scripts unless previously approved for the active session scope.
- **REQ-14**: The `load_skill` approval prompt must include exactly these options:
  - `yes_once` ("Yes once")
  - `yes_in_session` ("Yes in this session")
  - `no` ("No")
- **REQ-15**: Selecting `yes_once` approves script execution only for the current `load_skill` invocation.
- **REQ-16**: Selecting `yes_in_session` approves script execution for subsequent invocations of the same skill within the active session scope.
- **REQ-17**: Selecting `no` must skip script execution and return structured output indicating user decline.
- **REQ-18**: If HITL approval channel is unavailable at runtime, `load_skill` must not execute scripts and must return structured output indicating approval was unavailable.
- **REQ-19**: HITL option response submission must be available in all primary clients (Electron, web app, and CLI) so pending approval requests can be resolved without waiting for timeout.

## Non-Functional Requirements

- **NFR-1 (Security)**: Script execution must inherit existing shell safety policy and not weaken current protections.
- **NFR-2 (Reliability)**: Failures in one script execution path must be isolated and surfaced as structured output.
- **NFR-3 (Determinism)**: Given the same skill files and inputs, output structure and ordering must be stable.
- **NFR-4 (Maintainability)**: Must reuse existing shell safety and registry primitives rather than duplicate execution/safety logic.
- **NFR-5 (Observability)**: Script execution outcomes must remain inspectable through existing tool execution result flows.
- **NFR-6 (Human Control)**: Script execution must remain human-gated through explicit HITL selection unless an in-session approval has already been granted.

## Constraints

- Must build on the current `load_skill` and skill registry design.
- Must leverage existing shell command safeguards (no bypass path).
- Must preserve progressive loading principles (do not preload all bundled file contents by default).
- Must keep the existing `execution_directive` semantics.
- Must not auto-run arbitrary scripts solely because they are present in the `scripts/` directory.

## Out of Scope

- Redesign of the skill registry synchronization mechanism.
- New UI workflows for manually browsing or executing skill scripts.
- Arbitrary command execution unrelated to skill-packaged scripts.

## Acceptance Criteria

- [x] `load_skill` can execute skill-packaged scripts safely.
- [x] Script execution reuses existing shell safety controls.
- [x] Tool result contains `<active_resources>` with `<script_output>` and `<reference_files>`.
- [x] Script failures return structured output without crashing orchestration.
- [x] Skill/script not-found conditions return structured error output.
- [x] Output ordering is deterministic for repeated runs with same inputs.
- [x] Only instruction-referenced scripts are executable by default.
- [x] Generic HITL option process exists at world scope for option-list approvals.
- [x] `load_skill` prompts user with `Yes once`, `Yes in this session`, and `No` before running scripts.
- [x] `No` and unavailable approval-channel paths skip execution and return structured status in tool output.
- [x] Electron, web, and CLI clients can submit HITL option responses for pending requests.

## References

- [Agent Skills Overview](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview)
- [Skill Authoring Best Practices](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices)
