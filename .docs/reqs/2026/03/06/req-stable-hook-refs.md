# REQ: Stabilize Electron Renderer Hook Callback References

## Problem

The Electron renderer `App.tsx` passes inline arrow functions and mutable callbacks into custom hooks whose `useEffect` dependency arrays include those callbacks. When React re-renders `App`, every inline arrow gets a new identity, which cascades through `useCallback` dependency chains and eventually triggers `useEffect` cleanup+setup cycles in `useChatEventSubscriptions`. Each cycle tears down the active SSE subscription (removeListener, unsubscribeChatEvents, streaming cleanup, resetActivityRuntimeState), destroying accumulated messages. The result:

1. User sends a message → `setMessages(...)` → React re-renders App.
2. Inline callback identities change → dependent `useCallback` outputs invalidate.
3. `useChatEventSubscriptions` effect sees changed deps → full teardown + rebuild.
4. Messages captured by the previous subscription are lost.
5. Welcome card flickers; user/assistant messages never appear.

## Scope

Electron renderer hooks only (`electron/renderer/src/`). No changes to `core/`, `server/`, `web/`, or `cli/`.

## Requirements

### R1: Stabilize inline arrow callbacks in App.tsx

Three inline arrow functions passed to `useWorldManagement` must have stable identities across renders:
- `setSessions` proxy
- `setSelectedSessionId` proxy
- `getSelectedSessionId` ref reader

### R2: Use refs for callback-type dependencies in useChatEventSubscriptions

The subscription lifecycle effect in `useChatEventSubscriptions` must not re-run when only callback identities change. Callbacks that do not affect subscription identity (`onSessionSystemEvent`, `refreshSessions`, `resetActivityRuntimeState`, `onMainLogEvent`, `setHitlPromptQueue`) should be read from refs inside the effect rather than listed in the dependency array.

### R3: Keep subscription effect deps minimal and data-driven

After R2, the subscription effect dependency array should contain only values whose change requires a genuine re-subscription:
- `api` (IPC bridge — stable singleton)
- `loadedWorldId` (world switch)
- `selectedSessionId` (chat switch)
- `setMessages` (React state setter — stable)
- `streamingStateRef` (React ref — stable)

### R4: Preserve existing behavior

- Global log listener remains independent of chat subscription.
- HITL prompt batching continues to work.
- Subscription teardown still runs streaming cleanup and activity reset.
- No regressions in world/session switching, message streaming, or HITL flows.

## Out of Scope

- Refactoring hook splitting (e.g., extracting HITL batching into its own hook).
- Changes to the web AppRun frontend.
- Changes to core event publishers or server SSE handler.
