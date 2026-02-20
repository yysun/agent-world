# HITL Tool: Options-Only + Inline UI + Approval Route Separation

**Completed:** 2026-02-20  
**Requirement:** [req-hitl-tool.md](../../reqs/2026-02-20/req-hitl-tool.md)  
**Plan:** [plan-hitl-tool.md](../../plans/2026-02-20/plan-hitl-tool.md)

## Summary

Completed the LLM-callable HITL tool rollout with strict options-only behavior across core/server/clients, inline prompt rendering in chat flow, and composer send-lock while HITL prompts are pending.

Also finalized architecture alignment:
- system-enforced approvals and LLM-initiated HITL requests remain separate routes,
- both routes share common HITL runtime/UI plumbing for consistency.

Additionally, stabilized renderer stream lifecycle handling so lingering `streaming response...` indicators clear when final assistant messages arrive without a matching SSE end event.

## Delivered Behavior

- Built-in tool `hitl_request` is available for LLM use (with alias `human_intervention_request`).
- Tool contract is options-only globally:
  - requires at least one option,
  - rejects unsupported free-text/input fields.
- Confirmation flow is explicit (`confirm`/`cancel`) when requested.
- Web and Electron render HITL prompts inline in message flow (not popup modal).
- While HITL queue is non-empty, new user sends are blocked in Web/Electron.
- Existing system approvals (`create_agent`, `load_skill`) remain behaviorally separate from LLM-initiated HITL requests.

## Key Implementation Areas

### Core/Server

- Added/registered LLM-callable HITL built-in tool and alias.
- Enforced options-only validation in tool/runtime/api pathways.
- Kept HITL response handling scoped to pending request identity and context.
- Added system-prompt tool guidance so LLM is instructed to call HITL for clarifications/options/confirmation.

### Web/CLI/Electron

- Removed free-text HITL request/response pathways from parsing, state, and handlers.
- Kept/extended option-request parsing (`hitl-option-request`) and option-submit flow.
- Shifted client UX to inline message-flow interaction with send-lock while pending.

### CR Fixes Applied

- Removed lingering free-text aliases/references and pathways across core/web/cli paths.
- Fixed CLI type mismatch where removed free-text field (`answer`) was still submitted.
- Removed web update handlers and UI branches that still exposed input-mode HITL flows.

### Post-CR Stabilization Fix

- Renderer chat event handler now force-finalizes matching active assistant stream on final assistant message arrival, preventing stale `streaming response...` timer displays when SSE end is missing/out-of-order.

## Verification

- `npm run check --silent` passed.
- `npx vitest run tests/electron/renderer/chat-event-handlers-domain.test.ts` passed.
- Added coverage for stream-finalization fallback:
  - `tests/electron/renderer/chat-event-handlers-domain.test.ts`

## Notes

- HITL usage in model output remains guidance-driven; if provider/tool-attachment settings disable tools (for example Ollama without `ENABLE_OLLAMA_TOOLS`), plain-text questions may still appear.
- Approval mechanism behavior is preserved; shared UI/runtime does not merge approval and HITL routes.
