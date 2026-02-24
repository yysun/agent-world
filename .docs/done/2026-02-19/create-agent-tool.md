# Done: create-agent-tool

## Date
2026-02-19

## Scope Completed
Implemented end-to-end support for the new built-in `create_agent` flow with approval, world defaults, and realtime client refresh behavior.

## Delivered

1. Added built-in `create_agent` tool
- Mandatory param: `name`
- Optional params: `autoReply` (with alias support for `auto-reply`), `role`, `nextAgent` (with alias support for `next agent`)
- Requires approval through generic HITL option flow
- Creates agent after approval and returns structured result payload

2. Enforced system prompt template
- Generated prompt format:
  - `You are agent <name>. <Your role is ...>`
  - `Always respond in exactly this structure:`
  - `@<next agent>`
  - `{Your response}`

3. World provider/model inheritance
- `create_agent` now uses world-level chat provider/model defaults when agent provider/model are not explicitly set.

4. Approval flow parity (web + CLI + Electron)
- Continued using generic HITL option request/response path
- No client-specific approval protocol fork required

5. Runtime safety fix
- Fixed processing-time creation conflict by allowing tool-triggered `createAgent` while world processing is active where appropriate.

6. Realtime refresh for newly created agents
- Added CRUD event propagation to web and Electron realtime paths
- Frontends now refresh world/agent state automatically after background agent CRUD events

7. Chat-title channel normalization
- Moved chat title update notifications from `system` to chat `crud` update events
- Updated downstream web/electron refresh handlers accordingly
- Updated edit-resubmission title-reset logic to read persisted chat title from CRUD events

## Key Files Updated

- Core
  - `core/create-agent-tool.ts`
  - `core/mcp-server-registry.ts`
  - `core/tool-utils.ts`
  - `core/managers.ts`
  - `core/events/publishers.ts`
  - `core/events/subscribers.ts`

- Server
  - `server/sse-handler.ts`

- Web
  - `web/src/utils/sse-client.ts`
  - `web/src/types/events.ts`
  - `web/src/pages/World.update.ts`

- Electron
  - `electron/main-process/message-serialization.ts`
  - `electron/main-process/realtime-events.ts`
  - `electron/renderer/src/domain/chat-event-handlers.ts`
  - `electron/renderer/src/hooks/useChatEventSubscriptions.ts`
  - `electron/renderer/src/App.tsx`

- Tests
  - `tests/core/create-agent-tool.test.ts`
  - `tests/core/tool-utils.test.ts`
  - `tests/core/shell-cmd-integration.test.ts`
  - `tests/web-domain/world-crud-refresh.test.ts`
  - `tests/electron/main/main-realtime-events.test.ts`
  - `tests/electron/main/message-serialization.test.ts`
  - `tests/electron/renderer/chat-event-handlers-domain.test.ts`
  - `tests/core/events/post-stream-title.test.ts`
  - `tests/core/message-edit.test.ts`

## Verification Run

Executed and passed targeted suites:

- `npx vitest run tests/core/create-agent-tool.test.ts tests/core/tool-utils.test.ts tests/core/shell-cmd-integration.test.ts`
- `npx vitest run tests/web-domain/world-crud-refresh.test.ts tests/web-domain/world-update-message-filter.test.ts tests/web-domain/hitl.test.ts tests/web-domain/hitl-api.test.ts tests/core/create-agent-tool.test.ts`
- `npx vitest run tests/electron/main/main-realtime-events.test.ts tests/electron/main/message-serialization.test.ts tests/electron/renderer/chat-event-handlers-domain.test.ts`
- `npx vitest run tests/core/events/post-stream-title.test.ts tests/core/message-edit.test.ts tests/web-domain/world-crud-refresh.test.ts`

## Review Note

A compatibility risk remains for pre-migration persisted `system` chat-title events when running edit-title reset logic after migrating to CRUD-only title events. A backward-compatible fallback (read legacy `system` event shape when no matching CRUD title event exists) is recommended if historical data support is required.
