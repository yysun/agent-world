# Explicit ChatId Event Contract

## Summary

Tightened the Electron and core event/log contract so chat-scoped realtime data must carry an explicit `chatId`. The system no longer rebinds unscoped events to `selectedSessionId` or `world.currentChatId`.

## Changes

- Electron main realtime forwarding now drops unscoped `sse`, `tool`, `activity`, and `system` events instead of rebinding them during serialization.
- Electron renderer chat-event handlers and HITL/system-status helpers now ignore unscoped payloads instead of falling back to the selected chat.
- Core agent/orchestration error logs now include `worldId` and `chatId`.
- Core event publishers now require explicit `chatId` for `publishEvent`, `publishMessage`, `publishMessageWithId`, `publishSSE`, and `publishToolEvent`.
- Core event persistence now rejects unscoped message/SSE/tool/activity/system events instead of persisting them under `world.currentChatId` or `null`.
- Core agent processing/memory continuation paths now require explicit chat scope and throw early when it is missing.

## Tests

- `npx vitest run tests/electron/main/main-realtime-events.test.ts tests/electron/renderer/chat-event-handlers-domain.test.ts tests/electron/renderer/chat-event-subscriptions-hitl.test.ts tests/electron/renderer/chat-event-subscriptions-system-status.test.ts tests/electron/renderer/panel-log-scope.test.ts tests/electron/main/message-serialization.test.ts tests/core/events/message-id-pregeneration.test.ts tests/core/events/concurrent-chat-isolation.test.ts tests/core/event-persistence.test.ts tests/core/event-persistence-enhanced.test.ts tests/core/event-chatid-defaults.test.ts`
- `npm run check`
- `npm run integration`

## Notes

- Integration still prints the existing `node-cron` sourcemap warning; it is unrelated to this change.
- Electron requires a full restart for the main-process realtime contract changes to take effect.
