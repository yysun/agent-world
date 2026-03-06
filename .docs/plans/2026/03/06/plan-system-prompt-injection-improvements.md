# Architecture Plan: System Prompt Injection Improvements

**Date:** 2026-03-06
**Req:** `.docs/reqs/2026/03/06/req-system-prompt-injection-improvements.md`
**Status:** Draft

---

## Overview

Three targeted changes to the system prompt assembly pipeline:

1. **FR-1** — Move shell scope rule to `llm-manager.ts`, gated on `shell_cmd` tool presence.
2. **FR-2** — Suppress empty `## Agent Skills` block when no skills are registered.
3. **FR-4** — Add `\n\n---\n` structural separator between authored prompt and runtime injections.

FR-3 (conditional mention rules) is deferred — the storage overhead of a third read per LLM call outweighs the benefit of omitting 3 lines.

---

## Architecture

### Current call flow

```
orchestrator.ts
  └─▶ prepareMessagesForLLM()           [utils.ts]
        builds: authored prompt
              + shell scope rule (unconditional)
              + ## Agent Skills (unconditional)
              + mention format rules (unconditional)
        returns: AgentMessage[]
  └─▶ executeStreamAgentResponse()      [llm-manager.ts]
        ├─ getMCPToolsForWorld()
        └─ appendToolRulesToSystemMessage()
              adds: tool usage guidance (tool-aware)
```

### Target call flow

```
orchestrator.ts
  └─▶ prepareMessagesForLLM()           [utils.ts]
        builds: authored prompt
              [separator if authored prompt non-empty]
              + ## Agent Skills (only if non-empty)
              + mention format rules
        returns: AgentMessage[]
  └─▶ executeStreamAgentResponse()      [llm-manager.ts]
        ├─ getMCPToolsForWorld()
        └─ appendToolRulesToSystemMessage(messages, toolNames, { workingDirectory })
              adds: shell scope rule (only if shell_cmd present)
                  + tool usage guidance (tool-aware, existing)
```

---

## Phased Implementation

### Phase 1: FR-2 — Suppress empty skills section

- [x] In `buildAgentSkillsPromptSection()` (`core/utils.ts`): return `''` early when `filteredAvailableSkills.length === 0`, before building the `lines` array.
- [x] In `prepareMessagesForLLM()`: only append skills section when it is non-empty (change unconditional concat to conditional).

### Phase 2: FR-4 — Structural separator

- [x] In `prepareMessagesForLLM()`, refactor the prompt assembly to collect runtime sections into an array: `[agentSkillsPromptSection (if non-empty), mentionFormatRule]`.
- [x] Join collected sections with `\n\n`.
- [x] If the authored `interpolatedPrompt` is non-empty AND collected sections are non-empty, join with `\n\n---\n` as the separator.
- [x] If the authored prompt is empty, join with `\n\n` (no separator needed).
- [x] Remove the existing chained `promptWithShellExecutionRule → promptWithSkills → promptWithMentionRule` variables; replace with the new assembly.

### Phase 3: FR-1 — Move shell scope rule to llm-manager.ts

- [x] In `appendToolRulesToSystemMessage()` (`core/llm-manager.ts`): add optional third param `options?: { workingDirectory?: string }`.
- [x] Inside the function, after building `toolRules`, if `normalizedToolNames.has('shell_cmd')` and `options?.workingDirectory` is a non-empty string, prepend the shell scope rule:
  ```
  When using `shell_cmd`, execute commands only within this trusted working directory scope: <path>
  ```
- [x] In `executeStreamAgentResponse()` and its non-streaming counterpart in `llm-manager.ts`: extract `workingDirectory` from `world.variables` using `getEnvValueFromText` + `getDefaultWorkingDirectory` (already imported from `utils.ts`), then pass as `options.workingDirectory` to `appendToolRulesToSystemMessage`.
- [x] In `prepareMessagesForLLM()` (`core/utils.ts`): remove the `shellExecutionRule` / `promptWithShellExecutionRule` logic entirely.
- [x] Import `getEnvValueFromText` and `getDefaultWorkingDirectory` in `llm-manager.ts` if not already present.

### Phase 4: Tests

- [x] **`tests/core/prepare-messages-for-llm.test.ts`**:
  - Remove assertions on `working directory scope:` (shell rule no longer injected here).
  - Add test: skills section is absent from system prompt when `getSkillsForSystemPrompt` returns `[]`.
  - Add test: structural separator `---` appears between authored content and first injected section when authored prompt is non-empty.
  - Add test: no separator when authored prompt is empty (separator-less join).
  - Update existing tests that expected shell scope in system message.
- [x] **`tests/core/llm-manager.test.ts`** (or new `tests/core/append-tool-rules.test.ts`):
  - Add test: shell scope rule injected when `shell_cmd` is in tool list and `workingDirectory` is provided.
  - Add test: shell scope rule absent when `shell_cmd` is NOT in tool list.
  - Add test: shell scope rule absent when `workingDirectory` is omitted (options not passed).

---

## Signature Changes

### `appendToolRulesToSystemMessage` (llm-manager.ts)

```ts
// Before
function appendToolRulesToSystemMessage(
  messages: AgentMessage[],
  toolNames: string[]
): AgentMessage[]

// After
function appendToolRulesToSystemMessage(
  messages: AgentMessage[],
  toolNames: string[],
  options?: { workingDirectory?: string }
): AgentMessage[]
```

### `buildAgentSkillsPromptSection` (utils.ts, private)

No signature change. Return type stays `Promise<string>`. Just adds early-return path.

### `prepareMessagesForLLM` (utils.ts, public)

No signature change. Internal assembly refactored.

---

## Risk Notes

- The shell scope rule moves to a later pipeline stage (`llm-manager.ts`). The working directory value must be re-derived there. It is derived the same way: `getEnvValueFromText(world.variables, 'working_directory') || getDefaultWorkingDirectory()`. This is safe — `world` is always available in `executeStreamAgentResponse`.
- Two call sites in `llm-manager.ts` call `appendToolRulesToSystemMessage` (streaming and non-streaming). Both must be updated consistently.
- Existing tests that assert `working directory scope:` presence in `prepareMessagesForLLM` output will need to be updated (removal of that assertion, not replacement — the rule still runs, just in a different layer tested separately).
