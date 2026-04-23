# Done: llm-runtime HITL Alias and Web Search

**Date:** 2026-04-23

## Summary

Completed a focused llm-runtime integration update to:
- always expose the preferred `ask_user_input` HITL alias alongside the legacy `human_intervention_request` name,
- stop relying on host-side `webSearch` forwarding in the current `llm-runtime` host integration,
- consolidate duplicated HITL tool-name alias checks into a shared helper,
- and fix a follow-up regression where `getWorldTurnLimit()` was accidentally removed while still being used by the orchestrator.

## Changes Made

### 1. llm-runtime host tool wiring

Updated `core/llm-runtime.ts` to:
- register both `human_intervention_request` and `ask_user_input` using the same HITL tool definition,
- keep the existing host-owned tool wrapping behavior,
- stop forwarding `webSearch` from the host boundary and rely on `web_fetch` or MCP search/browser tools for web research.

### 2. HITL alias consolidation

Added shared helper module:
- `core/hitl-tool-names.ts`

This module now owns:
- `isHitlToolName(toolName)`
- `resolvePreferredHitlToolName(toolNames)`

Updated existing core call sites to use the shared helper instead of repeating alias checks:
- `core/agent-turn.ts`
- `core/tool-utils.ts`
- `core/hitl.ts`
- `core/utils.ts`

### 3. Prompt and replay behavior alignment

Aligned runtime behavior so the preferred alias works consistently across:
- turn classification (`hitl_request` action mapping),
- HITL prompt reconstruction from persisted assistant tool calls,
- HITL argument alias normalization,
- tool-usage system-prompt guidance.

### 4. Follow-up regression fix

During code review, identified and fixed an unrelated regression introduced while editing `core/utils.ts`:
- restored exported `getWorldTurnLimit(world)`
- added regression coverage because `core/events/orchestrator.ts` still imports and calls the helper.

## Tests Added or Updated

Added/updated targeted coverage in:
- `tests/core/llm-runtime-queue.test.ts`
- `tests/core/tool-usage-prompt-section.test.ts`
- `tests/core/hitl.test.ts`
- `tests/core/events/orchestrator-chatid-isolation.test.ts`
- `tests/core/tool-utils.test.ts`
- `tests/core/world-env-utils.test.ts`
- `tests/core/hitl-tool-names.test.ts`

## Verification Executed

Validation completed in stages:

1. Focused HITL / runtime alias suites
- `runTests` on targeted core suites
- Result: **51 tests passed**

2. Focused utility regression suites
- `runTests` on utility-focused suites
- Result: **13 tests passed**

3. Integration suite
- `npm run integration`
- Result: **24 tests passed**

## Files Changed

Core/runtime changes:
- `core/llm-runtime.ts`
- `core/agent-turn.ts`
- `core/tool-utils.ts`
- `core/hitl.ts`
- `core/utils.ts`
- `core/hitl-tool-names.ts`

Test changes:
- `tests/core/llm-runtime-queue.test.ts`
- `tests/core/tool-usage-prompt-section.test.ts`
- `tests/core/hitl.test.ts`
- `tests/core/events/orchestrator-chatid-isolation.test.ts`
- `tests/core/tool-utils.test.ts`
- `tests/core/world-env-utils.test.ts`
- `tests/core/hitl-tool-names.test.ts`

## Outcome

This work leaves the runtime in a more consistent state:
- the preferred public HITL tool name is available in the host integration,
- legacy HITL alias behavior remains compatible,
- prompt guidance and persisted replay logic follow the same alias rules,
- web research flows are expected to use `web_fetch` or MCP tools rather than host-forwarded provider web search,
- and the reviewed regression on `getWorldTurnLimit()` is fixed and protected by test coverage.
