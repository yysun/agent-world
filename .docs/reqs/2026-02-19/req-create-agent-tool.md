# Requirement: Approval-Gated `create_agent` Tool

**Date**: 2026-02-19  
**Type**: Feature Addition  
**Component**: Core built-in tools / agent creation flow

## Overview

Add a new built-in tool named `create_agent` that allows an agent/runtime to create another agent only after explicit user approval.

The tool must accept a required `name` parameter and optional `auto-reply`, `role`, and `next agent` parameters, and it must generate a system prompt in a strict template format.

## Goals

- Enable in-conversation creation of agents through a first-class tool.
- Enforce a mandatory approval gate before any new agent is persisted.
- Keep agent creation output deterministic and aligned with required prompt structure.

## Functional Requirements

### REQ-1: Tool Availability

- The world toolset **MUST** include a built-in tool named `create_agent`.
- `create_agent` **MUST** be discoverable the same way as other built-in tools in worlds with and without MCP config.

### REQ-2: Tool Input Contract

- `create_agent` **MUST** require `name`.
- `create_agent` **MUST** support these optional inputs:
  - `auto-reply`
  - `role`
  - `next agent`
- The system **MUST** normalize optional parameter aliases into the canonical agent fields used at persistence/runtime boundaries.
- Missing required input or invalid input types **MUST** return clear validation errors and **MUST NOT** create an agent.

### REQ-3: Mandatory Approval Gate

- Every `create_agent` execution attempt **MUST** require explicit user approval before creation.
- If approval is denied or times out, the tool **MUST NOT** create an agent and **MUST** return a denial result.
- Approval behavior **MUST** use the existing project approval interaction model and auditing expectations.

### REQ-4: Agent Creation Behavior

- After approval, the tool **MUST** create exactly one agent using provided inputs.
- The created agent **MUST** persist with standard agent lifecycle fields expected by existing world/agent flows.
- The created agent **MUST** use the world's configured LLM provider/model (`chatLLMProvider`, `chatLLMModel`) as its provider/model when those world values are set.
- If world-level provider/model values are missing, the tool **MUST** apply deterministic existing defaults for provider/model.
- Conflicts (for example, duplicate derived ID) **MUST** return a clear error and **MUST NOT** partially persist data.

### REQ-5: Required System Prompt Format

The created agent system prompt **MUST** follow this exact structure:

```text
You are agent <name>. <Your role is ...>

Always respond in exactly this structure:
@<next agent>
{Your response}
```

- `name` **MUST** be the provided agent name.
- If `role` is provided, the role phrase **MUST** be populated accordingly.
- If `next agent` is provided, the mention target **MUST** use that value.
- If `next agent` is not provided, the system **MUST** apply a deterministic default mention target and document that default in tool behavior.

### REQ-6: Tool Result Contract

- Successful execution **MUST** return a structured result that identifies the newly created agent.
- Result payload **SHOULD** include created agent identifiers and effective settings (`name`, `auto-reply`, `role`, `next agent`/resolved default).

## Non-Functional Requirements

- Creation flow **MUST** be deterministic and idempotent per single approved call execution.
- Error messages **MUST** be user-actionable and non-ambiguous.
- Existing agent creation paths (API/UI/CLI) **MUST** remain backward compatible.

## Constraints

- Scope is limited to adding and integrating `create_agent` behavior; no unrelated refactors.
- Requirement defines behavior; implementation details remain out of scope for REQ.

## Acceptance Criteria

- [ ] `create_agent` appears in built-in tools for a world with no MCP config.
- [ ] `create_agent` requires `name` and rejects calls without it.
- [ ] `create_agent` accepts optional `auto-reply`, `role`, and `next agent`.
- [ ] Approval is always required before creation.
- [ ] Denied approval prevents creation and returns a denial result.
- [ ] Approved calls create exactly one agent with expected persisted fields.
- [ ] Approved calls use world-level provider/model settings for the new agent when configured.
- [ ] System prompt matches the required template structure.
- [ ] Optional `role` and `next agent` correctly populate the template.
- [ ] Missing `next agent` uses a deterministic documented default.
- [ ] Duplicate/conflicting creation attempts fail safely without partial writes.

## Architecture Review Notes (AR)

### Decision

- Keep `create_agent` as a built-in tool aligned with existing tool wrapping/validation and approval patterns.

### Tradeoffs

- **Strict template enforcement (selected)**:
  - Pros: predictable multi-agent routing format.
  - Cons: lower flexibility for custom prompt phrasing.
- **Flexible prompt generation (rejected)**:
  - Pros: more expressive prompts.
  - Cons: inconsistent behavior and routing structure.
