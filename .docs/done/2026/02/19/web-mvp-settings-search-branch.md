# Done: Web MVP Settings/Search/Branch + UI Follow-Ups

**Date**: 2026-02-19  
**Related Requirement**: `/Users/esun/Documents/Projects/agent-world/.docs/reqs/2026-02-19/req-web-mvp-settings-search-branch.md`  
**Related Plan**: `/Users/esun/Documents/Projects/agent-world/.docs/plans/2026-02-19/plan-web-mvp-settings-search-branch.md`

## Summary

Completed web MVP parity items requested as `1 + 2 + 3`:
- enabled Settings route,
- added chat-history search,
- added branch-from-message flow.

Also completed follow-up UI adjustments and CR hardening requested during implementation.

## Completed Scope

### MVP 1: Settings route
- Enabled `'/Settings'` in web route registration.
- Reused existing page component without routing architecture changes.

### MVP 2: Chat-history search
- Added chat search input to right panel chat-history controls.
- Added case-insensitive in-memory filtering.
- Kept existing chat actions intact (`new`, `load`, `delete`).

### MVP 3: Branch chat from message
- Added web branch action event and handler.
- Added web API client branch method.
- Added server endpoint to branch from source chat/message using core branch manager.
- Success path routes into the new branch chat; failure path preserves current chat and reports error.

### Follow-up UI requests
- Replaced edit/delete/branch emoji action buttons with SVG icons.
- Changed right-panel new-chat button to icon-only and placed it to the right of the search input.
- Adjusted spacing around chat-history controls.
- Updated World page container width to `90vw`.
- Implemented 75% visual scale behavior with layout-safe adjustments to avoid right-panel overflow and bottom-page scroll issues.

### CR follow-up hardening
- Updated branch endpoint status mapping:
  - `404` for not-found cases,
  - `400` for client validation/eligibility errors,
  - `500` for unexpected internal failures.
- Preserved raw error message response text as requested.

## Key Files Updated

- `/Users/esun/Documents/Projects/agent-world/web/src/main.tsx`
- `/Users/esun/Documents/Projects/agent-world/web/src/components/world-chat-history.tsx`
- `/Users/esun/Documents/Projects/agent-world/web/src/components/world-chat.tsx`
- `/Users/esun/Documents/Projects/agent-world/web/src/pages/World.tsx`
- `/Users/esun/Documents/Projects/agent-world/web/src/pages/World.update.ts`
- `/Users/esun/Documents/Projects/agent-world/web/src/types/events.ts`
- `/Users/esun/Documents/Projects/agent-world/web/src/types/index.ts`
- `/Users/esun/Documents/Projects/agent-world/web/src/api.ts`
- `/Users/esun/Documents/Projects/agent-world/web/src/styles.css`
- `/Users/esun/Documents/Projects/agent-world/server/api.ts`
- `/Users/esun/Documents/Projects/agent-world/tests/web-domain/world-chat-history-search.test.ts`
- `/Users/esun/Documents/Projects/agent-world/tests/web-domain/world-chat-branch-eligibility.test.ts`
- `/Users/esun/Documents/Projects/agent-world/tests/web-domain/world-update-branch-chat.test.ts`

## Validation Performed

- `npx vitest run tests/web-domain/world-chat-history-search.test.ts tests/web-domain/world-chat-branch-eligibility.test.ts tests/web-domain/world-update-branch-chat.test.ts tests/web-domain/world-chat-composer-action.test.ts` → passed
- `npx vitest run tests/web-domain/world-chat-history-search.test.ts` (after right-panel layout change) → passed
- `npx vitest run tests/web-domain/world-chat-branch-eligibility.test.ts tests/web-domain/world-chat-composer-action.test.ts` (after SVG action change) → passed
- `npm run check` (root/core/web/electron TypeScript checks/build) → passed

## Outcome

Web now supports the requested MVP parity features and the subsequent UI refinements, with verified build/test status and improved branch endpoint error-status handling.
