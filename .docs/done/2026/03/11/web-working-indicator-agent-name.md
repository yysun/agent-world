# Done: Web Working Indicator Agent Name

**Date:** 2026-03-11  
**Req:** `.docs/reqs/2026/03/11/req-web-working-indicator-agent-name.md`  
**Plan:** `.docs/plans/2026/03/11/plan-web-working-indicator-agent-name.md`

## What Changed

- Updated `web/src/pages/World.update.ts` so `handleWorldActivity` derives `activeAgent` from chat-scoped activity payload data (`activeAgentNames`, with `source` fallback on `response-start`) and updates it even when the waiting state remains active.
- Updated `web/src/components/world-chat.tsx` so the waiting indicator no longer falls back to the first world agent when no single active agent is known.
- Added targeted regression coverage in `tests/web-domain/world-update-working-agent.test.ts`.

## Verification

- `npx vitest run tests/web-domain/world-update-working-agent.test.ts tests/web-domain/world-chat-waiting-ui.test.ts`

## Notes

- `npx tsc -p web/src/tsconfig.json --noEmit` still fails because of pre-existing unrelated errors in `web/src/api.ts`, `web/src/components/world-chat-history.tsx`, and `web/src/domain/tool-execution-envelope.ts`.
