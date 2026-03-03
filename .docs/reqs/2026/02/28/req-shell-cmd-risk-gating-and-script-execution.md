# Requirement: `shell_cmd` Risk Gating and Script Execution Support

**Date**: 2026-02-28  
**Type**: Security and UX Policy Clarification  
**Component**: Core built-in `shell_cmd` tool

## Overview

Define explicit policy boundaries for `shell_cmd` validation outcomes, including when to hard-reject versus require HITL approval, and clarify first-class support expectations for script execution requests (`bash`, `python`, `node`, `npx`).

## Goals

- Preserve strict trust-boundary safety for working-directory scope controls.
- Add clear, user-visible handling for dangerous but potentially legitimate operations.
- Clarify what script execution request forms are supported versus unsupported.
- Keep behavior deterministic across Web, Electron, CLI, and API runtimes.

## Functional Requirements

### REQ-1: Trust-Boundary Violations Must Hard-Reject

- Requests that resolve outside trusted `working_directory` scope **MUST** be hard-rejected.
- Out-of-scope path targets in command arguments/options **MUST** be hard-rejected.
- These trust-boundary rejections **MUST NOT** be overridable through HITL in the same call.

### REQ-2: Shell-Control-Syntax Policy

- Shell control syntax outside single-command contract (for example chaining, piping, redirection, command substitution, backgrounding) **MUST** remain blocked by default.
- If any exception mode is introduced, it **MUST** be explicitly opt-in and HITL-gated per call.
- Session-wide blanket approval for shell-control syntax **MUST NOT** be allowed.
- This requirement set **MUST NOT** introduce exception-mode support by default in the same delivery scope.

### REQ-3: Dangerous Operation Risk Tiering

- Runtime **MUST** classify command requests into risk tiers at minimum: `allow`, `hitl_required`, and `block`.
- Clearly catastrophic operations (for example destructive root/system targeting) **MUST** be blocked.
- Destructive operations that may be legitimate inside trusted scope (for example recursive delete of project artifacts) **MUST** require HITL approval.
- Read-only and low-risk commands **SHOULD** proceed without HITL under existing tool policy.

### REQ-4: Dangerous Operation Detection Coverage

- Detection **MUST** inspect normalized executable plus argument tokens (not only raw substring matching).
- Detection **MUST** consider target path context (inside/outside trusted scope) and destructive flags.
- Detection **MUST** include common high-risk families at minimum:
  - deletion/destruction (`rm`, destructive clean/prune patterns)
  - permission/ownership mass changes
  - disk/device destructive operations
  - remote-download-to-execute patterns

### REQ-5: Script Execution Support Contract

- `shell_cmd` **MUST** support direct executable/script invocation forms when they satisfy existing scope and syntax policy, including:
  - `bash <script-file>`
  - `python <script-file>`
  - `node <script-file>`
  - `npx <package-or-binary> [args...]`
- Inline interpreter eval forms (for example `bash -c`, `python -c`, `node -e`) **MUST** remain unsupported by default.
- Unsupported forms **MUST** return actionable error messages that explain accepted alternatives.

### REQ-6: User-Facing Outcome Semantics

- Validation outcomes **MUST** be explicit and distinguish:
  - hard reject (policy denied)
  - HITL required (await human approval)
  - blocked catastrophic operation
- Error/approval messages **SHOULD** provide enough context for user correction (requested command, risk category, trusted scope hint).

### REQ-7: Policy Evaluation Order

- Runtime policy evaluation **MUST** execute in this order:
  1. trust-boundary and single-command contract checks
  2. dangerous-operation risk classification
  3. HITL gating for `hitl_required` outcomes
- Requests failing step 1 **MUST** be rejected immediately and **MUST NOT** enter HITL.

### REQ-8: HITL Message-Based Handling

- For `hitl_required` outcomes, approval decisions **MUST** use the shared helper `requestToolApproval`.
- This delivery scope **MUST NOT** add timeout-control settings/knobs to `shell_cmd` approval flow.
- Non-approval outcomes **MUST** produce a non-executed terminal result.
- Non-approval outcomes **MUST** be user-visible and auditable with reason semantics.

## Non-Functional Requirements

### Security

- Prompt-injection resistance **MUST** be preserved by keeping trust-boundary checks non-overridable in-call.
- Risk detection behavior **MUST** be deterministic for identical normalized inputs.

### Compatibility

- Existing safe command flows **MUST** remain backward compatible.
- Existing SSE/tool-result contracts **MUST NOT** regress.

### Observability

- Risk decisions (`allow`/`hitl_required`/`block`) **SHOULD** be emitted in tool execution metadata for auditability.

## Scope

### In Scope

- Policy definition for reject vs HITL behavior.
- Dangerous operation classification requirements.
- Script execution support boundary definition for shell interpreters/runners.

### Out of Scope

- Redesign of stream transport behavior.
- Broader sandbox/containerization changes.
- New package-manager policy beyond command risk classification.

## Acceptance Criteria

- [ ] Out-of-scope directory/path requests are hard-rejected and not overridable by same-call HITL.
- [ ] Shell-control syntax remains blocked by default.
- [ ] Dangerous operation tiering yields deterministic `allow`/`hitl_required`/`block` outcomes.
- [ ] At least one destructive-but-legitimate in-scope operation path triggers HITL (not immediate block).
- [ ] Catastrophic destructive patterns are blocked.
- [ ] `bash|python|node` direct script-file execution requests are supported when in scope.
- [ ] `npx` command requests are supported when they satisfy policy constraints.
- [ ] Inline eval forms (`-c`, `-e`, similar) remain unsupported by default with actionable guidance.
- [ ] Policy evaluation order is enforced and boundary violations never enter HITL.
- [ ] `hitl_required` approvals use `requestToolApproval` with message-option flow.
- [ ] No timeout-control setting is introduced for `shell_cmd` approvals in this scope.
- [ ] HITL non-approval for risky operations returns non-executed terminal outcomes with explicit reasons.

## Architecture Review Notes (AR)

### Decision

- Keep trust-boundary checks as hard rejects.
- Add dangerous-op risk tiering with HITL for high-risk but potentially legitimate operations.
- Keep direct script-file execution supported; keep inline eval blocked by default.
- Keep shell-control exception-mode as future-only; do not add it in this scope.

### Tradeoffs

- Hard-rejecting boundary escapes reduces flexibility but protects against approval-coercion and prompt-injection.
- HITL for destructive in-scope operations improves safety with manageable user friction.
- Blocking inline eval reduces expressiveness but prevents common bypass vectors.
