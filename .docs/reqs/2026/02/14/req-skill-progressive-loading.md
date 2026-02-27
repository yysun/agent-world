# Requirement: Progressive Skill Loading in Prompt + Tooling

**Date**: 2026-02-14  
**Type**: Feature  
**Status**: ✅ Requirements Reviewed (AR Completed)

## Architecture Review (AR)

**Review Date**: 2026-02-14  
**Reviewer**: AI Assistant  
**Result**: ✅ APPROVED

### Review Summary

The requirement is coherent and aligns with the existing skill-registry direction: keep base prompts compact, expose discoverability via summaries, and fetch full instructions lazily through a dedicated tool.

### Validated Assumptions

- Registry-backed `skill_id` and `description` are sufficient for prompt-time discovery.
- Full skill markdown should remain on-demand to control prompt size and reduce token cost.
- Tool-based retrieval is the right boundary for injecting specialized protocols.
- Existing orchestration/tool-result channel can carry structured XML-like payloads.

### Options Considered

- **Option A (Recommended)**: Prompt lists summaries + `load_skill` returns full markdown on demand.
  - Pros: low prompt bloat, explicit model action, reusable across flows.
  - Cons: requires one extra tool turn when a skill is needed.
- **Option B**: Inline full skill markdown in base prompt.
  - Pros: no extra tool call.
  - Cons: large prompts, wasted tokens when skills are irrelevant, weaker scalability.
- **Option C**: Preload only a subset of skills heuristically.
  - Pros: smaller than full preload.
  - Cons: brittle selection logic, hidden misses, added complexity.

### AR Decision

- Proceed with Option A.
- Keep `load_skill` keyed strictly by `skill_id`.
- Treat not-found/read-failure as structured tool results (no runtime hard-fail).

## Overview

Enable progressive skill usage by:
1. Injecting a compact list of available skills (`id` + `description`) into the system prompt.
2. Adding a `load_skill` tool that fetches full `SKILL.md` instructions on demand by `skill_id`.

This keeps base prompts lightweight while allowing full protocol details to be loaded only when needed.

## Goals

- Expose available skills to the model at prompt-build time.
- Provide a deterministic way to load full skill instructions by ID.
- Preserve skill source-of-truth in the core skill registry.

## Functional Requirements

- **REQ-1**: System prompt construction must include an `Agent Skills` section containing available skills from the skill registry.
- **REQ-2**: The injected section must provide each skill as:
  - `id` (skill registry ID)
  - `description` (skill registry description)
- **REQ-3**: The system prompt skill section must follow this contract:

```text
## Agent Skills
You have access to a library of agent skills. Find skill by:
1. Review the <available_skills> list below.
2. If the user's request matches a skill's purpose, use the load_skill with skill id tool 
   to fetch the full instructions.

<available_skills>
  <skill>
    <id>...</id>
    <description>...</description>
  </skill>
</available_skills>
```

- **REQ-4**: A new tool named `load_skill` must be available to the agent runtime.
- **REQ-5**: `load_skill` input must accept a `skill_id`.
- **REQ-6**: `load_skill` must resolve skills from the skill registry by `skill_id`.
- **REQ-7**: If the skill exists, `load_skill` must read the full `SKILL.md` content and return:

```xml
<skill_context id="{{skill_id}}">
  <instructions>
    {{full_skill_markdown_content}}
  </instructions>

  <execution_directive>
    You are now operating under the specialized {{skill_name}} protocol. 
    1. Prioritize the logic in <instructions> over generic behavior.
    2. Use the data in <active_resources> to complete the user's specific request.
    3. If the workflow is multi-step, explicitly state your plan before executing.
  </execution_directive>
</skill_context>
```

- **REQ-8**: If the skill is not found, `load_skill` must return a structured not-found result that clearly indicates the requested `skill_id` is unavailable.
- **REQ-9**: The tool must not return partial/ambiguous skill content; it must either return the full resolved skill markdown or a clear not-found/error result.

## Non-Functional Requirements

- **NFR-1 (Reliability)**: Skill listing and tool lookup must be based on current registry state (post-sync behavior already defined in core registry requirements).
- **NFR-2 (Determinism)**: Given the same registry state and skill files, prompt injection output and `load_skill` output must be stable.
- **NFR-3 (Maintainability)**: Prompt injection and tool behavior must rely on registry APIs instead of duplicating folder-scanning logic.

## Constraints

- Must integrate with existing prompt-building flow and tool execution architecture.
- Must not inline full skill markdown into the base system prompt; full content is loaded only through `load_skill`.
- Must use `skill_id` as the tool lookup key.

## Out of Scope

- Changes to the registry synchronization algorithm itself.
- New UI for browsing/loading skills manually.
- Remote skill source fetching.

## Acceptance Criteria

- [x] System prompt includes `Agent Skills` section populated from registry `id` + `description`.
- [x] `load_skill` tool exists and is invokable by `skill_id`.
- [x] `load_skill` returns full `SKILL.md` content wrapped in the required `<skill_context>` envelope.
- [x] `load_skill` returns clear structured not-found output for unknown IDs.
- [x] Base prompt remains compact (no full skill markdown embedded directly).
