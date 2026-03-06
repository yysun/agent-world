# REQ: System Prompt Injection Improvements

**Date:** 2026-03-06
**Status:** Draft

---

## Summary

Improve the runtime system prompt injection in `core/utils.ts` (`prepareMessagesForLLM`) and `core/llm-manager.ts` to eliminate unnecessary token waste, prevent misleading instructions for toolless agents, and add a structural separator between agent-authored prompts and runtime-injected sections.

---

## Problem

`prepareMessagesForLLM` unconditionally appends three injected sections to every agent system prompt regardless of the agent's actual toolset or world context:

1. **Shell scope rule** — injected even when `shell_cmd` is not available to the agent.
2. **`## Agent Skills` section** — injected even when no skills are registered, producing an empty `<available_skills>` block.
3. **Mention format rules** — injected even for single-agent worlds where no other agents exist to mention.

Additionally, all injected sections are concatenated directly onto the free-text system prompt with only `\n` separators. There is no structural delimiter between the agent's authored prompt and runtime-injected scaffolding, making the composite prompt harder to reason about and debug.

---

## Goals

1. Remove hollow injections that waste tokens and mislead agents.
2. Gate injections on runtime conditions they actually depend on.
3. Add a clear structural delimiter between authored and injected content.

---

## Functional Requirements

### FR-1: Conditional Shell Scope Rule

- The shell execution scope rule MUST only be injected when `shell_cmd` is present in the agent's active tool list.
- When `shell_cmd` is absent, no shell-related instruction must appear in the system prompt.

### FR-2: Empty Skills Section Suppression

- `buildAgentSkillsPromptSection()` MUST return an empty string when `filteredAvailableSkills` is empty after filtering.
- When the skills section is suppressed, no `## Agent Skills` heading, no guidance text, and no `<available_skills>` block must appear in the system prompt.

### FR-3: Conditional Mention Format Rules

- The mention format rule MUST only be injected when the world contains more than one agent.
- For single-agent worlds or when agent count cannot be determined, the mention rule MUST be omitted.

### FR-4: Structural Separator Between Authored and Injected Content

- When any runtime injection is appended to a non-empty agent system prompt, a structural delimiter MUST be inserted between the authored prompt and the injected sections.
- The delimiter MUST visually separate authored content from runtime scaffolding.
- The injected sections MUST be grouped together after the delimiter, not interleaved with authored content.
- Suggested delimiter: `\n\n---\n` (horizontal rule).

---

## Non-Requirements

- Do not change the content or wording of existing injections, only their conditionality and structure.
- Do not change how tool usage guidance is injected in `llm-manager.ts` — it already gates correctly per tool presence.
- Do not change skill registry loading, filtering, or env-flag behavior.
- Do not restructure `prepareMessagesForLLM` beyond the minimal changes needed for these requirements.

---

## Affected Files

- `core/utils.ts` — `prepareMessagesForLLM`, `buildAgentSkillsPromptSection`, mention rule injection
- `tests/core/prepare-messages-for-llm.test.ts` — update/add regression tests for conditional injection behavior
