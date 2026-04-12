# Done: LLM Action Execution Hardening

**Date**: 2026-04-12
**Status**: Completed
**Related Requirement**: [req-llm-action-execution-hardening.md](../../../reqs/2026/04/12/req-llm-action-execution-hardening.md)
**Related Plan**: [plan-llm-action-execution-hardening.md](../../../plans/2026/04/12/plan-llm-action-execution-hardening.md)

## Summary

Implemented the runtime hardening that prevents weak tool-using models from completing a turn by narrating future work instead of executing it.

This DD also includes the CR follow-up fixes:

1. Planning-only prompts are no longer blocked by the intent-only narration guard.
2. Validation self-correction budget now resets after non-validation continuation progress, so a later unrelated tool action still gets its own bounded correction chance.

## Implemented Changes

### Runtime Guarding

- Added shared guard helpers in `core/events/assistant-response-guards.ts`.
- Direct turns now reject intent-only narration only when the triggering user turn is execution-oriented.
- Continuation turns now reject intent-only narration only when the underlying turn is execution-oriented, using the latest persisted user message rather than the transient retry instruction.
- Planning/explanation prompts such as "what would you do" or "give me a plan" are allowed to return future-tense text without being downgraded to a warning.

### Validation Failure Recovery

- Validation failures still persist as durable tool errors and still allow one bounded corrective retry.
- The validation retry budget is no longer carried through normal continuation progress.
- After a non-validation step succeeds, later tool validation failures get their own bounded retry opportunity.
- Repeated validation failures in the same correction chain still terminate with the existing warning path instead of looping indefinitely.

### Prompt Guidance

- The tool-usage prompt remains tightened so models are told to emit the tool call now or return verified results.
- Runtime enforcement remains authoritative; prompt guidance is only supporting mitigation.

## Test Coverage Added or Updated

- `tests/core/events/orchestrator-chatid-isolation.test.ts`
  - direct intent-only narration still retries once and then stops
  - planning-only prompts are not blocked by the direct guard
- `tests/core/events/memory-manager-behavior.test.ts`
  - continuation intent-only narration still retries once and then stops
  - planning-only continuation replies are not blocked
  - validation retry budget resets after non-validation continuation progress

## Verification

Executed:

- `npx vitest run tests/core/events/orchestrator-chatid-isolation.test.ts tests/core/events/memory-manager-behavior.test.ts tests/core/tool-usage-prompt-section.test.ts`
- `npx vitest run tests/core/tool-utils.test.ts`
- `npm run integration`

All passed on 2026-04-12.

## Residual Risk

- The intent-only classifier remains heuristic by design. It is now intentionally conservative to avoid blocking planning/explanation replies, which means some weak-model narration outside the covered execution-oriented patterns may still pass through as ordinary text.
