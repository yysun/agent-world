# Requirement: Electron App Stream Display

## ✅ Implementation Status: COMPLETE

**Implemented:** 2025-06-10  
**Plan:** [plan-electron-stream-display.md](../../../.docs/plans/2026-02-10/plan-electron-stream-display.md)  
**Tests:** 53 unit tests passing

## Overview

The Electron desktop application must support real-time streaming display of LLM responses, providing users with immediate visual feedback as tokens are generated. This requirement defines the behavior for displaying streaming content in the chat interface.

## Goals

- Provide real-time, low-latency display of LLM response tokens
- Maintain consistent user experience across streaming, completion, and error states
- Support multi-agent scenarios with proper message attribution
- Ensure clean state management between streaming and final messages

## Functional Requirements

### Connection & Transport (IPC-Based)

The Electron app uses **IPC (Inter-Process Communication)** between the main process and renderer process — there is no HTTP server.

- REQ-1: The main process shall run core logic directly (imports from `core/` module)
- REQ-2: The renderer shall communicate with main process via `ipcRenderer.invoke()` for requests
- REQ-3: The main process shall push events to renderer via `mainWindow.webContents.send(CHAT_EVENT_CHANNEL, payload)`
- REQ-4: The renderer shall listen for events via `ipcRenderer.on(CHAT_EVENT_CHANNEL, callback)`

### Event Types & Routing

- REQ-5: The main process shall emit these event types to renderer:
  - `sse` — streaming events (start/chunk/end/error)
  - `message` — final complete messages

- REQ-6: The `sse` event payload shall contain:
  - `eventType` — one of: `start`, `chunk`, `end`, `error`
  - `messageId` — unique identifier for the stream
  - `agentName` — responding agent identity
  - `content` — text delta for chunk events
  - `error` — error message for error events

- REQ-7: The main process shall subscribe to `world.eventEmitter.on('sse', handler)` and forward events to renderer
- REQ-8: The main process shall subscribe to `world.eventEmitter.on('message', handler)` and forward final messages

### Content Accumulation

- REQ-9: The renderer shall maintain a content accumulator (Map keyed by `messageId`) for active streams
- REQ-10: On `start` event, the renderer shall create an accumulator entry with empty content
- REQ-11: On `chunk` event, the renderer shall append `content` to existing accumulated content
- REQ-12: On `end` event, the renderer shall remove the accumulator entry
- REQ-13: On `error` event, the renderer shall remove the accumulator entry and preserve error state

### UI State Management

- REQ-14: On `start` event, the renderer shall add a placeholder message to the UI with `isStreaming: true`
- REQ-15: On each `chunk` event, the renderer shall update the placeholder message text with accumulated content
- REQ-16: On `end` event, the renderer shall remove the streaming placeholder (not convert it)
- REQ-17: On `message` event, the renderer shall add the final authoritative message to the UI
- REQ-18: The renderer shall deduplicate messages using `messageId`

### User Message Handling

- REQ-19: On user send, the renderer shall create an optimistic message with `userEntered: true` flag
- REQ-20: On receiving the `message` event, the renderer shall match and update the optimistic message by text content
- REQ-21: The renderer shall set `isSending: true` during message submission and clear on completion

### Rendering

- REQ-22: The renderer shall render markdown content using GFM (GitHub Flavored Markdown) with line breaks enabled
- REQ-23: The renderer shall sanitize HTML output to prevent XSS attacks
- REQ-24: The renderer shall debounce chunk updates at 16ms intervals to maintain 60fps rendering
- REQ-25: The renderer shall escape HTML on markdown parse errors as fallback

### Visual Indicators

- REQ-26: The renderer shall display a streaming indicator when `message.isStreaming === true`
- REQ-27: The renderer shall display a waiting spinner based on `pendingOperations > 0` from world activity events (NOT stream events)
- REQ-28: The streaming indicator shall show the responding agent's identity

### Scroll Behavior

- REQ-29: The renderer shall auto-scroll to bottom on new content arrival
- REQ-30: Scroll shall use `requestAnimationFrame` for smooth updates
- REQ-31: The renderer shall track scroll need with a flag that resets after scrolling

### Debouncing

- REQ-32: The renderer shall debounce UI updates at 16ms minimum interval (60fps cap)
- REQ-33: Accumulated content shall be rendered on the next debounce frame, not dropped
- REQ-34: The `end` event shall flush any pending debounced content immediately

### Error Handling

- REQ-35: On IPC error, the renderer shall log error and display error state
- REQ-36: On `error` streaming event, the renderer shall mark the message with `hasError: true` and `errorMessage`
- REQ-37: Main process shall cleanup event listeners when renderer disconnects or window closes

### Subscription Management

- REQ-38: The renderer shall call `chat:subscribeEvents` IPC to start receiving events for a world/chat
- REQ-39: The renderer shall call `chat:unsubscribeEvents` IPC when leaving a chat or world
- REQ-40: Main process shall track subscriptions by `subscriptionId` to support multiple concurrent subscriptions
- REQ-41: Main process shall cleanup subscriptions on window close via `clearChatEventSubscriptions()`

### Interactivity Indicators

#### Thinking Placeholder
- REQ-42: After `sendMessage` returns, the renderer shall immediately show a "thinking" placeholder message with animated dots

#### Tool Execution Display
- REQ-43: On `tool-start` event, the renderer shall display the tool name with a spinner inline in the agent's message
- REQ-44: On `tool-result` event, the renderer shall show a brief success indicator
- REQ-45: On `tool-error` event, the renderer shall show an error state for the tool
- REQ-46: On `tool-progress` event, the renderer shall show a progress bar if progress data is available

#### Global Activity Indicator
- REQ-47: The renderer shall show a pulsing activity dot in the header when any agent operation is pending

#### Multi-Agent Queue
- REQ-48: When multiple agents are responding, the renderer shall display "N agents responding..."

#### Elapsed Time Display
- REQ-49: After 3 seconds of waiting, the renderer shall display elapsed time that updates every second

## Non-Functional Requirements

- NFR-1: Chunk-to-display latency shall be < 32ms (16ms IPC + 16ms render frame)
- NFR-2: Memory usage shall not grow unboundedly during long streams
- NFR-3: UI shall remain responsive during streaming (no blocking)
- NFR-4: Markdown rendering shall handle malformed input gracefully
- NFR-5: IPC message serialization shall be efficient (JSON stringify/parse)

## Constraints

- No HTTP server — all communication via Electron IPC
- Core logic runs in main process, UI runs in renderer process
- Must support multiple concurrent streams (multi-agent scenarios)
- Context isolation enabled — renderer cannot access Node.js APIs directly

## Architecture

```
┌─────────────────────────────────────────┐
│              Renderer Process           │
│  ┌─────────────┐    ┌────────────────┐  │
│  │  preload    │    │  AppRun State  │  │
│  │  bridge     │───▶│    + View      │  │
│  └─────────────┘    └────────────────┘  │
│         │                    │          │
│   ipcRenderer           DOM updates     │
└─────────────────────────────────────────┘
         │ IPC
         ▼
┌─────────────────────────────────────────┐
│              Main Process               │
│  ┌─────────────────────────────────┐    │
│  │  Core Logic (direct import)     │    │
│  │  - world.eventEmitter           │    │
│  │  - publishMessage()             │    │
│  │  - subscribeWorld()             │    │
│  └─────────────────────────────────┘    │
│         │                               │
│  world.eventEmitter.on('sse')           │
│  world.eventEmitter.on('message')       │
│         │                               │
│  mainWindow.webContents.send()          │
└─────────────────────────────────────────┘
```

### Event Flow

```
Core (world.eventEmitter)
    │
    │ raw events: 'sse', 'message'
    ▼
Main Process (lightweight)
    │ - wrap with context (worldId, chatId, subscriptionId)
    │ - serialize timestamps to ISO strings
    │ - forward via webContents.send()
    ▼
Renderer (heavy lifting)
    │ - accumulate content in Map
    │ - manage UI state (start → chunk → end)
    │ - deduplicate by messageId
    │ - 16ms debounce
    │ - render markdown
    ▼
DOM
```

### Responsibility Division

| Layer | Responsibilities |
|-------|------------------|
| **Core** | Emit raw `sse` and `message` events via `world.eventEmitter` |
| **Main Process** | Subscribe to events, wrap with context (`worldId`, `chatId`, `subscriptionId`), serialize timestamps, forward via IPC — NO content accumulation or transformation |
| **Renderer** | Content accumulation (Map by `messageId`), UI state management (placeholder → streaming → final), deduplication, 16ms debounce, markdown rendering, scroll behavior |

**Key components:**
- **Main Process**: Runs core logic directly, subscribes to world events, lightweight forwarding to renderer via IPC
- **Preload Bridge**: Exposes safe IPC methods to renderer (`window.electronAPI`)
- **Renderer Process**: Receives raw events, performs all accumulation and UI logic

---

## Architecture Review

### Review Date: 2026-02-10

### Completeness ✅
- All streaming event types covered (start/chunk/end/error)
- IPC-based communication fully specified
- UI state transitions clearly defined
- Subscription lifecycle documented

### Feasibility ✅
- Architecture matches existing `electron/main.js` implementation
- IPC overhead is acceptable with 16ms debouncing
- No new infrastructure required

### Scalability ✅
- Multi-agent streaming supported via messageId keying
- Subscription tracking by subscriptionId supports multiple concurrent streams
- Accumulator pattern prevents memory leaks (cleanup on end/error)

### Maintainability ✅
- Clear separation: core in main process, UI in renderer
- Preload bridge provides clean API boundary
- Event-driven architecture is testable

### Performance Considerations

| Concern | Mitigation |
|---------|------------|
| **IPC overhead** | 16ms debounce batches rapid chunks into single render frames |
| **Serialization cost** | JSON is fast; payloads are small (messageId + content delta) |
| **Memory pressure** | Accumulator cleanup on end/error prevents leaks |

### Verdict

**APPROVED** — Requirements accurately reflect the IPC-based Electron architecture with appropriate debouncing for performance.

---

## Acceptance Criteria

- [ ] User sees tokens appear in real-time as LLM generates them
- [ ] Streaming placeholder is replaced by final message on completion
- [ ] Multiple agents can stream simultaneously without message corruption
- [ ] User messages appear immediately (optimistic update)
- [ ] Markdown renders correctly during streaming (code blocks, lists, etc.)
- [ ] Scroll follows new content automatically
- [ ] Streaming indicator shows which agent is responding
- [ ] Waiting spinner reflects actual pending operations
- [ ] Errors during streaming display meaningful error state
- [ ] IPC failures are handled gracefully with cleanup
- [ ] Long streams complete without memory leaks
- [ ] "Thinking..." placeholder appears immediately after sending message
- [ ] Tool execution shows inline with tool name and spinner
- [ ] Tool completion/error states display correctly
- [ ] Header shows pulsing activity dot when agents are working
- [ ] Multi-agent count shows "N agents responding" when applicable
- [ ] Elapsed time appears after 3 seconds of waiting
