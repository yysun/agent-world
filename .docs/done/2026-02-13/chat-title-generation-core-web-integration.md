# Done: Chat Title Generation Core Ownership and Web Integration

**Date**: 2026-02-13  
**Type**: Feature Enhancement  
**Related Requirement**: `/.docs/reqs/2026-02-13/req-chat-title-generation.md`  
**Related Plan**: `/.docs/plans/2026-02-13/plan-chat-title-generation.md`

## Overview

Completed the chat-title reliability track by centralizing edit/title-regeneration behavior in core and aligning both Electron and Web clients to consume that behavior consistently.

## Delivered

- Moved title-reset-on-edit logic into core message edit flow so clients do not implement title policy independently.
- Standardized title update event payload to structured `system` content:
  - `eventType: 'chat-title-updated'`
  - `title`
  - `source`
- Added Electron IPC edit path that delegates to core `editUserMessage(...)`.
- Updated Electron renderer edit flow to use core-owned message edit API.
- Added server REST edit endpoint `PUT /worlds/:worldName/messages/:messageId`:
  - Core-managed remove + resubmit behavior.
  - Supports SSE streaming by default (`stream: true`) for live web updates.
  - Supports non-streaming JSON mode (`stream: false`) for compatibility callers.
- Updated web edit flow to use SSE-based core edit streaming.
- Updated web system-event handling to parse structured `chat-title-updated` payloads and refresh active chat state.
- Documented event-channel semantics and system-payload convention in:
  - `/.docs/done/2026-02-13/memo-event-channel-rules.md`

## User-Visible Outcomes

- Editing a user message now triggers title-regeneration behavior from core in both desktop and web clients.
- Chat title updates are propagated through structured system events instead of brittle string matching.
- Web edit now streams follow-up assistant/tool activity after edit resubmission, matching normal send behavior.

## Validation

- Passed: `npm run check`
  - Root TypeScript no-emit
  - `core` TypeScript no-emit
  - `web` TypeScript no-emit
- Passed: `npm test -- tests/core/message-edit.test.ts`
  - Confirms edit flow behavior including auto-title reset semantics.

## Files Touched (Primary)

- Core:
  - `core/managers.ts`
  - `core/events/subscribers.ts`
  - `core/chat-constants.ts`
- Electron:
  - `electron/main-process/ipc-handlers.ts`
  - `electron/main-process/ipc-routes.ts`
  - `electron/shared/ipc-contracts.ts`
  - `electron/preload/bridge.ts`
  - `electron/renderer/src/App.jsx`
  - `electron/renderer/src/domain/chat-event-handlers.js`
- Server/Web:
  - `server/api.ts`
  - `web/src/utils/sse-client.ts`
  - `web/src/pages/World.update.ts`
  - `web/src/api.ts`
- Tests:
  - `tests/core/message-edit.test.ts`
  - `tests/core/events/post-stream-title.test.ts`
  - `tests/electron/main/main-ipc-handlers.test.ts`
  - `tests/electron/main/main-ipc-routes.test.ts`
  - `tests/electron/main/main-realtime-events.test.ts`
  - `tests/electron/preload/preload-bridge.test.ts`
  - `tests/electron/renderer/chat-event-handlers-domain.test.ts`
