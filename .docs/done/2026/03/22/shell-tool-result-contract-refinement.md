# Done: Shell Tool Result Contract Refinement

**Date:** 2026-03-22
**Status:** Completed
**Related:** [REQ](../../reqs/2026/03/22/req-shell-tool-result-contract-refinement.md), [Plan](../../plans/2026/03/22/plan-shell-tool-result-contract-refinement.md), [Tool Results Contract](../../../../docs/Tool%20Results%20Contract.md)

## Summary

Completed the `shell_cmd` tool-result contract refinement so persisted shell results cleanly separate human transcript preview from LLM continuation payload, selectively support directly displayable shell output, and avoid duplicate transcript artifacts across persisted memory and the Electron merged tool-card UI.

## Delivered

1. **Separated human preview sizing from LLM continuation sizing**
   - Persisted shell `preview` remains a durable human-readable summary with bounded stdout/stderr snippets.
   - Production `result` remains the minimal continuation payload used for the next LLM step.

2. **Expanded direct-display eligibility conservatively**
   - `display_content` now uses an explicit allow-list for `markdown`, `html`, and `svg` shell stdout.
   - Ordinary text and top-level JSON stdout remain regular shell output rather than becoming display-first content.

3. **Narrowed synthetic assistant adoption**
   - Synthetic assistant rows are created only from explicit assistant-renderable `display_content`.
   - Generic textual preview fallback no longer creates duplicate assistant display artifacts.

4. **Fixed top-level JSON misclassification**
   - Valid top-level JSON stdout now short-circuits before markdown/html heuristics run.
   - Structured shell results with nested markdown-like strings no longer populate `display_content` accidentally.

5. **Fixed Electron merged tool-card duplication**
   - Combined Electron tool cards now drop superseded live `-stdout` shell stream rows once the terminal tool result exists for the same tool call.
   - The final completed shell card keeps the terminal persisted envelope as the canonical display.

6. **Updated contract documentation**
   - `docs/Tool Results Contract.md` now documents the explicit display allow-list, JSON guardrail, and the distinction between transient streaming rows and the terminal persisted envelope.

## Code Review Outcome

- Completed CR over the current runtime, renderer, test, and doc diff.
- No blocking correctness, architecture, security, or maintainability findings remain in the delivered change set.

## Validation Executed

- `npx vitest run tests/core/shell-cmd-tool.test.ts`
- `npx vitest run tests/core/synthetic-assistant-tool-result.test.ts tests/core/shell-cmd-integration.test.ts`
- `npm run integration`
- `npx vitest run tests/electron/renderer/message-list-plan-visibility.test.ts tests/electron/renderer/message-content-status-label.test.ts`

## Files Delivered

- `core/shell-cmd-tool.ts`
- `core/tool-execution-envelope.ts`
- `core/synthetic-assistant-tool-result.ts`
- `electron/renderer/src/components/MessageListPanel.tsx`
- `tests/core/shell-cmd-tool.test.ts`
- `tests/core/shell-cmd-integration.test.ts`
- `tests/core/synthetic-assistant-tool-result.test.ts`
- `tests/electron/renderer/message-list-plan-visibility.test.ts`
- `docs/Tool Results Contract.md`
- `.docs/reqs/2026/03/22/req-shell-tool-result-contract-refinement.md`
- `.docs/plans/2026/03/22/plan-shell-tool-result-contract-refinement.md`
- `.docs/done/2026/03/22/shell-tool-result-contract-refinement.md`