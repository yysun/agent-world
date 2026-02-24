# create_agent Post-Create HITL Confirmation + Refresh-on-Dismiss

**Completed:** 2026-02-20  
**Requirement:** [req-create-agent-hitl-created-notice-refresh.md](../../reqs/2026-02-20/req-create-agent-hitl-created-notice-refresh.md)  
**Plan:** [plan-create-agent-hitl-created-notice-refresh.md](../../plans/2026-02-20/plan-create-agent-hitl-created-notice-refresh.md)

## Summary

Implemented post-create HITL informational confirmation for successful `create_agent` runs with deterministic refresh intent metadata.

After agent creation succeeds, users now see an informational confirmation containing:
- `Agent <name> has been created`
- effective create details
- metadata flag `refreshAfterDismiss: true`

When the confirmation is dismissed, Electron and Web now refresh world/session state when that metadata flag is true.

## Architecture Decisions

- Reused the existing option-based HITL runtime (`hitl-option-request`) instead of introducing a new event type.
- Kept refresh as a client-side action triggered on dismissal, driven by server/tool metadata.
- Extended HITL submit response to include request metadata so clients can apply post-dismiss actions without extra lookup state.

## Key Changes

### Core

- `core/create-agent-tool.ts`
  - Added post-create info confirmation request with dismiss option.
  - Included deterministic metadata:
    - `kind: create_agent_created`
    - `refreshAfterDismiss: true`
    - created agent details.
- `core/hitl.ts`
  - Persisted request metadata in pending HITL requests.
  - Returned metadata from `submitWorldOptionResponse(...)`.

### Electron

- `electron/renderer/src/hooks/useChatEventSubscriptions.ts`
  - Captures HITL metadata into prompt queue entries.
- `electron/renderer/src/App.tsx`
  - On HITL response submission, refreshes world/session state when `prompt.metadata.refreshAfterDismiss === true`.
  - Uses prompt kind to emit appropriate status text for post-create dismiss flow.

### Web

- `web/src/types/index.ts`
  - Extended `HitlPromptRequest` with optional metadata.
- `web/src/domain/hitl.ts`
  - Parses metadata (`kind`, `refreshAfterDismiss`) from HITL payloads.
- `web/src/pages/World.update.ts`
  - After HITL dismissal, refreshes world context when `prompt.metadata.refreshAfterDismiss` is true.

## Tests and Verification

### Focused tests executed

- `npx vitest run tests/core/create-agent-tool.test.ts tests/core/hitl.test.ts tests/web-domain/hitl.test.ts`
- Result: all passing.

### Full suite executed

- `npm test`
- Result: 89 files passed, 885 tests passed, 0 failed.

## Notes

- Existing approval/denial/timeout behavior remains unchanged.
- Post-create info prompt failure is non-fatal; successful create still returns success.
- Refresh behavior is metadata-driven and only triggers on dismissal when flag is true.
