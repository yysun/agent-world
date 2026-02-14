# Progressive Skill Loading

**Date**: 2026-02-14  
**Type**: Feature  
**Status**: Completed

## Overview

Implemented progressive skill loading for agent runtime:
- Inject skill summaries (`id`, `description`) into system prompts.
- Added `load_skill` built-in tool to fetch full `SKILL.md` instructions by `skill_id`.
- Kept base prompts compact and moved full skill instructions to on-demand tool usage.

## Implementation

- Prompt injection:
  - Updated `core/utils.ts` to append the required `## Agent Skills` section and `<available_skills>` block during `prepareMessagesForLLM`.
  - Uses registry-backed skills and deterministic ordering.

- Runtime tooling:
  - Added `core/load-skill-tool.ts` with `createLoadSkillToolDefinition()`.
  - Tool behavior:
    - Looks up skill by `skill_id` in registry.
    - Reads full source `SKILL.md`.
    - Returns required `<skill_context>` envelope with `<instructions>` and `<execution_directive>`.
    - Returns structured not-found/read-error responses.

- Registry support:
  - Extended `core/skill-registry.ts` to track and expose source paths via `getSkillSourcePath(skillId)`.
  - Preserves project-skill override precedence over user skills.

- Tool registration:
  - Updated `core/mcp-server-registry.ts` to include built-in `load_skill` alongside `shell_cmd`.

## Testing and Validation

- Added/updated tests:
  - `tests/core/load-skill-tool.test.ts`
  - `tests/core/prepare-messages-for-llm.test.ts`
  - `tests/core/skill-registry.test.ts`
  - `tests/core/shell-cmd-integration.test.ts`

- Validation commands:
  - `npm test -- tests/core/load-skill-tool.test.ts tests/core/shell-cmd-integration.test.ts tests/core/prepare-messages-for-llm.test.ts tests/core/skill-registry.test.ts`
  - `npm run check`
  - `npm run build:core`

All passed.

## Related Work

- Requirement: `.docs/reqs/2026-02-14/req-skill-progressive-loading.md`
- Plan: `.docs/plans/2026-02-14/plan-skill-progressive-loading.md`
