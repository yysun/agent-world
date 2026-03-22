# REQ: Shell Tool Result Contract Refinement

**Date:** 2026-03-22
**Status:** Draft
**Related:**
- `.docs/reqs/2026/03/21/req-machine-execution-envelopes.md`
- `.docs/reqs/2026/03/21/req-synthetic-assistant-tool-result-display.md`
- `docs/Tool Results Contract.md`

## Summary

Refine the `shell_cmd` tool-result envelope contract so the persisted shell result remains easy for humans to review after restore, stays compact and stable for LLM continuation, and supports explicit directly renderable `markdown`, `html`, and `svg` outputs without creating duplicate assistant-display artifacts for ordinary text results.

## Problem Statement

The current `shell_cmd` envelope contract mixes two different concerns:

- durable human-readable shell output preview for transcript and restore surfaces
- bounded continuation payload for the next LLM step

The runtime already keeps these concerns partially separated through `preview`, `display_content`, and `result`, but the contract is still too coarse in the following ways:

- the human preview and the LLM continuation preview are still tightly coupled by output truncation strategy
- directly renderable shell outputs are supported only for a narrow set of image-style markdown cases rather than an explicit allow-list of supported display types
- widening display behavior without guardrails would create too many display-only synthetic assistant rows

## Requirements

### 1. Minimal continuation result remains the production contract for `shell_cmd`

For all production `shell_cmd` execution paths, including direct tool calls and skill-script shell executions:

- the canonical `result` payload must remain a minimal bounded continuation payload
- the continuation payload must remain suitable for automatic LLM follow-up without replaying full transcript bodies
- verbose shell result payloads may remain available for tests, diagnostics, or explicitly non-production contexts only

### 2. The persisted shell `preview` must remain a human-readable durable summary

The shell envelope `preview` must continue to give users enough bounded information to understand what happened after reload, restore, export, or cross-client viewing.

The preview must:

- remain durable in the persisted tool envelope
- preserve command, status, and duration summary information
- preserve bounded stdout and stderr snippets for ordinary text shell output
- remain distinct from the minimal continuation `result`

### 3. Human preview sizing must be independently tunable from LLM continuation sizing

The shell preview shown to humans and the bounded shell preview returned to the next LLM step must not rely on one shared effective output cap.

The contract must allow:

- separate tuning of human preview length
- separate tuning of continuation preview length
- future adjustments to transcript readability without implicitly increasing continuation token cost

### 4. `display_content` may expand only to explicit directly renderable shell output types

The shell envelope `display_content` should support an explicit allow-list of directly renderable shell output forms:

- `markdown`
- `html`
- `svg`

This expansion must:

- allow `display_content` for `markdown`, `html`, and `svg` output only when the shell stdout is suitable for direct display
- keep `display_content` empty for JSON output
- keep `display_content` empty for ordinary plain text stdout or stderr
- avoid redefining `display_content` as the general fallback container for arbitrary non-JSON output

### 5. Synthetic assistant display rows must remain selective

Expanding `display_content` must not cause ordinary shell command outputs to create duplicate display-only synthetic assistant rows.

The runtime must preserve these guarantees:

- directly renderable adopted shell results of type `markdown`, `html`, or `svg` may still create a synthetic assistant display row when appropriate
- ordinary text or diagnostic shell output must not create a duplicate assistant display artifact merely because it is present in the envelope
- synthetic assistant rows must remain filtered out of future LLM history preparation

### 6. Direct tool calls and skill-script shell executions must keep the same envelope contract

The `shell_cmd` envelope contract must remain identical for:

- direct shell tool calls
- shell executions that resolve commands or arguments through active skill context

Skill-aware command resolution may change the final resolved executable path, but it must not create a second shell result contract.

### 7. Restore and transcript behavior must remain stable

These refinements must not regress:

- restored tool result readability
- transcript rendering consistency across Web and Electron
- canonical tool lifecycle authority on the tool result row
- filtering of display-only synthetic assistant rows from LLM continuation input

### 8. Renderable `html` and `svg` display content must preserve safe rendering behavior

If `display_content` is allowed for `html` or `svg`, the runtime and clients must preserve existing safe rendering guarantees.

This means:

- no raw unsafe transcript injection of arbitrary HTML content
- no bypass of existing sanitization or safe viewer boundaries already used by the product
- the refinement may widen eligibility for directly renderable content, but it must not widen trust of raw shell output

### 9. Documentation and validation must be updated together

The project must keep the runtime contract, targeted tests, and docs aligned.

At minimum, the change set must:

- update the contract documentation in `docs/Tool Results Contract.md`
- add or update focused unit coverage for direct and skill-script shell envelope behavior
- add or update focused coverage for synthetic assistant adoption boundaries if `display_content` eligibility changes

## Non-Goals

- Redesign the shared `tool_execution_envelope` schema for all tools
- Change the `load_skill` or `web_fetch` envelope contract unless needed for compatibility
- Replace canonical `role='tool'` persistence with assistant-owned tool lifecycle authority
- Reintroduce full stdout/stderr replay as the default continuation contract

## Acceptance Criteria

The work is acceptable when all of the following are true:

1. Production `shell_cmd` continuations always use the minimal result contract.
2. Persisted shell previews still show bounded human-readable stdout/stderr snippets.
3. Human preview length can change without changing continuation preview length.
4. `display_content` supports explicit `markdown`, `html`, and `svg` outputs while remaining empty for JSON and ordinary text.
5. Ordinary text shell results do not start generating duplicate synthetic assistant rows.
6. Direct and skill-script `shell_cmd` executions continue to share one envelope contract.
7. `html` and `svg` display content preserve safe rendering behavior.
8. Documentation and focused regression tests reflect the delivered behavior.