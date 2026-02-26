# DD: Web Edit Save Error Handling and Payload Hardening

**Date:** 2026-02-26  
**Type:** DF + DD

## Scope Completed

- Fixed `Edit World` save failures caused by oversized PATCH payloads.
- Added meaningful API error responses for global server failures (instead of generic `INTERNAL_ERROR` in common cases).
- Hardened `Edit Agent` PATCH payloads to avoid sending large/non-patchable fields.
- Normalized `mainAgent` world field before save so values like `@Madame Pedagogue` persist as canonical agent tokens.

## Root Cause

- `web/src/components/world-edit.tsx` called `api.updateWorld(state.world.name, state.world)`.
- `api.updateWorld` previously serialized and sent the full world object, including `agents` and large `memory` arrays.
- Express JSON parsing failed before route logic for large requests, producing a global 500 response.

## Changes Implemented

### Web API Payload Filtering

- `web/src/api.ts`
  - Added `buildWorldPatchPayload(...)` and updated `updateWorld(...)` to send only patchable world fields.
  - Added `buildAgentPatchPayload(...)` and updated `updateAgent(...)` to send only patchable agent fields.
  - Added normalization for world `mainAgent`:
    - trim
    - remove leading `@`
    - kebab-case
    - empty string to `null`
  - Preserved backend error `code` on thrown API errors for better UI handling.

### Server Error Mapping

- `server/error-response.ts` (new)
  - Centralized global error-to-response mapping:
    - `entity.too.large` -> `413 PAYLOAD_TOO_LARGE`
    - `entity.parse.failed`/JSON parse -> `400 INVALID_JSON_BODY`
    - `SQLITE_READONLY` -> `503 DATABASE_READONLY`
    - fallback -> `500 INTERNAL_ERROR`
- `server/index.ts`
  - Updated global Express error middleware to use `getErrorResponse(...)`.

## Tests Added

- `tests/web-domain/world-update-api-payload.test.ts`
  - world PATCH payload filtering
  - backend error code propagation
  - `mainAgent` normalization behavior
- `tests/web-domain/agent-update-api-payload.test.ts`
  - agent PATCH payload filtering
  - omitting non-patchable/large fields
- `tests/api/server-error-response.test.ts`
  - global server error mapping behavior

## Validation Run

- `npx vitest run tests/web-domain/world-update-api-payload.test.ts tests/web-domain/agent-update-api-payload.test.ts tests/api/server-error-response.test.ts` ✅
- `npm run check --workspace=web` ✅
- `npx tsc --noEmit --project tsconfig.build.json` ✅

## Behavior After Fix

- World edit no longer sends large payloads and no longer trips parser-size failures in normal save flows.
- Agent edit now uses minimal safe payloads.
- If payload-size errors occur again, API returns a clear message/code (`PAYLOAD_TOO_LARGE`) instead of opaque `INTERNAL_ERROR`.
- Main agent entries entered as mention/display text now persist consistently as canonical agent identifiers.
