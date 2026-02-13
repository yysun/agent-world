# Memo: Event Channel Rules

Date: 2026-02-13
Status: Adopted

## Purpose
Define consistent channel semantics for realtime events emitted from `world.eventEmitter` and consumed by CLI/API/Electron subscribers.

## Channel Rules
1. `message`
- Use for chat timeline messages (human/assistant/tool-role messages that represent conversation content).

2. `sse`
- Use for streaming transport lifecycle (`start`, `chunk`, `end`, `error`, `tool-stream`) and related stream metadata.

3. `world`
- Use for runtime activity/tool telemetry only.
- Allowed activity types: `response-start`, `response-end`, `idle`.
- Allowed tool types: `tool-start`, `tool-result`, `tool-error`, `tool-progress`.

4. `system`
- Use for world-scoped internal notifications/metadata updates that are not message content and not activity/tool telemetry.
- `system` events may include `chatId` when session-scoped.

## Clarification
- `system` is not “outside world.”
- All channels above are world-scoped because they originate from a world instance’s `eventEmitter`.
- Truly app-level events (window/workspace-only UI concerns) should use separate app-level channels, not `system`.

## Structured Payload Convention
For `system` events, prefer object payloads with explicit `eventType` instead of raw strings.

Example:
```ts
{
  eventType: 'chat-title-updated',
  title: 'Scoped Chat Title',
  source: 'idle'
}
```

## Current Production `system` emitters
- `chat-title-updated` when a default chat title is replaced.
- Error notification for tool-continuation failure.
