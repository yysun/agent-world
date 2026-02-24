# Plan: Agent Working Status — Centralized Global State (Electron)

**Date:** 2026-02-22  
**Req:** `.docs/reqs/2026-02-22/req-agent-working-status.md`  
**Strategy:** Delete all existing status tracking and display logic first, then build the new system on a clean foundation.

> **AR Notes (resolved):**
> - Agent is identified by `agentName` field on SSE events (not `source`). Tool events use `agentName` in the core, but `serializeRealtimeToolEvent` currently outputs `agentId: null` (bug). Step 6.0 fixes this by adding `agentName` to the serialized tool payload.
> - `worldId` and `chatId` are reliably available in the event handler context.
> - Chat-switch replay insertion point: `App.tsx` `useEffect` on `[loadedWorld?.id, selectedSessionId]`.
>
> **AR Round 2 — CRUD lifecycle gaps addressed:**
> - No new IPC events needed. The renderer already calls explicit refresh functions (`refreshWorldDetails`, `refreshSessions`) after all CRUD operations, which update `loadedWorld` and `sessions` state.
> - Registry sync is driven by a `useEffect` on `[loadedWorld, sessions]` — a single sync point that reacts to all CRUD changes without introducing any new events or hooks.
> - `syncWorldRoster` is a non-destructive merge: adds new agents/chats as `idle`, removes stale ones, leaves currently `working`/`complete` agents untouched.
> - `WorkingStatusBar` receives: `chatStatus`, per-agent status map merged with display names from `loadedWorld.agents`. See Phase 7 for display contract.

---

## Architecture Overview

```mermaid
graph TD
    subgraph "Core Events (existing)"
        E1[sse:start / sse:end / sse:error]
        E2[tool-start / tool-result / tool-error]
        E3[hitl-option-request / hitl-option-response]
    end

    subgraph "New: Status Module (electron/renderer/src/domain/)"
        SM[status-types.ts\nWorkingStatus enum\nRegistry types]
        SR[status-registry.ts\nStatusRegistry factory\nAgent / Chat / World rollup]
        SU[status-updater.ts\napplyEventToRegistry()\nper-agent in-flight counter]
    end

    subgraph "New: Status Hook (electron/renderer/src/hooks/)"
        SH[useWorkingStatus.ts\nReact state bridge\nsubscribes to registry changes]
    end

    subgraph "New: Status Display (electron/renderer/src/components/)"
        SD[WorkingStatusBar.tsx\nreads from hook only\nno event logic]
    end

    subgraph "Existing (kept)"
        AH[chat-event-handlers.ts\nroutes events → updater]
        APP[App.tsx\nwires hook → display]
    end

    E1 --> AH
    E2 --> AH
    E3 --> AH
    AH --> SU
    SU --> SR
    SR --> SH
    SH --> SD
    APP --> SD
```

### Key Principles

- **`status-registry.ts`** is a pure-function factory (no React, no side effects). Testable in isolation.
- **`status-updater.ts`** is a pure reducer: `(registry, event) → registry`. No side effects.
- **`useWorkingStatus.ts`** is the only React boundary: subscribes to registry mutations and returns computed status values.
- Display components receive plain values; they contain zero event or status logic.

---

## Phases

---

### Phase 1 — Delete Existing Status Logic (Clean Slate)

- [x] **1.1** Delete `electron/renderer/src/domain/status-bar.ts` entirely.
- [x] **1.2** Delete `electron/renderer/src/components/StatusActivityBar.tsx` entirely.
- [x] **1.3** Delete `tests/electron/renderer/status-bar-domain.test.ts` entirely.
- [x] **1.4** Remove from `app-helpers.ts`: `getAgentWorkPhaseText()`, `buildInlineAgentStatusSummary()`, `getProcessedAgentsStatusText()`.
- [x] **1.5** Remove from `chat-event-handlers.ts`: `buildLogStatusText()`, all `publishStatusBarStatus` calls, `setStatusText` parameter from `createGlobalLogEventHandler`.
- [x] **1.6** Remove from `useStreamingActivity.ts`: `isBusy`, `elapsedMs`, `activeTools`, `activeStreamCount`, `sessionActivity` state and all their setters/returns. Keep `streamingStateRef`, `activityStateRef`, `resetActivityRuntimeState`.
- [x] **1.7** Remove from `useChatEventSubscriptions.ts`: `onSessionResponseStateChange` implementation and its usages; remove `setPendingResponseSessionIds` parameter.
- [x] **1.8** Remove from `App.tsx`: all imports/uses of deleted functions and the `status` state, its subscription `useEffect`, and `statusActivityBarProps`. Remove `StatusActivityBar` render.
- [x] **1.9** Remove from `tests/electron/renderer/chat-event-handlers-domain.test.ts`: `setStatusText` callback usages and related assertions.
- [x] **1.10** Remove from `tests/electron/renderer/app-utils-extraction.test.ts`: all test suites covering the three deleted helper functions.
- [x] **1.11** Run `npm test` — expect compile errors only in new-code areas, not in untouched tests.

---

### Phase 2 — Status Types and Registry

- [x] **2.1** Create `electron/renderer/src/domain/status-types.ts`:
  ```ts
  export type WorkingStatus = 'idle' | 'working' | 'complete';

  export interface AgentStatusEntry {
    agentId: string;
    status: WorkingStatus;
    inFlightSse: number;   // count of open sse:start without matching end
    inFlightTools: number; // count of open tool-start without matching result/error
  }

  export interface ChatStatusEntry {
    chatId: string;
    agents: Map<string, AgentStatusEntry>;
  }

  export interface WorldStatusEntry {
    worldId: string;
    chats: Map<string, ChatStatusEntry>;
  }

  export interface StatusRegistry {
    worlds: Map<string, WorldStatusEntry>;
  }
  ```

- [x] **2.2** Create `electron/renderer/src/domain/status-registry.ts`:
  - `createStatusRegistry(): StatusRegistry` — factory returning empty registry.
  - `getAgentStatus(registry, worldId, chatId, agentId): WorkingStatus`
  - `getChatStatus(registry, worldId, chatId): WorkingStatus` — derived from agents per rollup rules.
  - `getWorldStatus(registry, worldId): WorkingStatus` — derived from chats per rollup rules.
  - `clearChatAgents(registry, worldId, chatId): StatusRegistry` — clears all agent entries for a chat (for chat switch replay).
  - `syncWorldRoster(registry, worldId, chatIds: string[], agentIds: string[]): StatusRegistry` — non-destructive merge:
    - Adds any chat or agent not yet in the registry as `idle`.
    - Removes any chat or agent no longer in the provided lists.
    - Leaves `working` or `complete` agents untouched (preserves in-flight status).
    - Replaces all previous `seedWorldAgents`, `addAgentToWorld`, `removeAgentFromWorld`, `addChatToWorld`, `removeChatFromWorld`, `removeWorld` helpers — `syncWorldRoster` is the single CRUD sync point.
  - Rollup logic:
    - Any child `working` → parent `working`.
    - All children `complete`, none `working` → `complete`.
    - All children `idle` (or no children) → `idle`.
  - All functions are pure (return new registry, no mutation).

---

### Phase 3 — Status Updater

- [x] **3.1** Create `electron/renderer/src/domain/status-updater.ts`:
  - `applyEventToRegistry(registry, worldId, chatId, agentId, eventType, eventSubtype): StatusRegistry`
  - Pure reducer: given current registry + one event → returns updated registry.
  - Implements the event→transition table from the requirement:

  | `eventType` | `eventSubtype` | Effect on agent |
  |---|---|---|
  | `sse` | `start` | `inFlightSse++`, status → `working` |
  | `sse` | `end` | `inFlightSse--`, if both counters 0 → `complete` |
  | `sse` | `error` | `inFlightSse--`, if both counters 0 → `complete` |
  | `tool` | `start` | `inFlightTools++`, status → `working` |
  | `tool` | `result` | `inFlightTools--`, if both counters 0 → `complete` |
  | `tool` | `error` | `inFlightTools--`, if both counters 0 → `complete` |
  | `system` | `hitl-option-request` | status → `complete` (reset counters) |
  | `reset` | `*` | status → `idle` (reset counters) |

  > **Note — no `hitl-option-response` event:** No broadcast event exists for HITL response submission. The user submits via `HITL_RESPOND` IPC invoke; the resumed agent emits `sse:start`, which drives `* → working` naturally. No explicit transition row needed.

  - "if both counters 0" check: `inFlightSse <= 0 && inFlightTools <= 0`.
  - Counters never go below 0 (guard with `Math.max(0, counter - 1)`).

---

### Phase 4 — Tests for Status Logic

- [x] **4.1** Create `tests/electron/renderer/status-registry.test.ts`:
  - Test `getAgentStatus` default → `idle`.
  - Test `getChatStatus` rollup: all idle, any working, all complete.
  - Test `getWorldStatus` rollup: all idle, any working, all complete.
  - Test `clearChatAgents` removes agents only for that chat, not sibling chats.
  - Test `syncWorldRoster`:
    - New agents/chats are added as `idle`.
    - Removed agents/chats are purged.
    - `working` agents survive the sync (not reset to `idle`).
    - `complete` agents survive the sync (not reset to `idle`).
    - World rollup recomputes after sync.

- [x] **4.2** Create `tests/electron/renderer/status-updater.test.ts`:
  - Test each event type produces correct agent status transition.
  - Test multi-hop: `sse:start → tool-start → sse:end → sse:start → sse:end` stays `working` until counters drain.
  - Test HITL full cycle: `working → complete (hitl-request) → working (hitl-response) → complete (sse:end)`.
  - Test counter guard: double `sse:end` without matching `sse:start` doesn't go below 0.
  - Test chat switch: `clearChatAgents` then replay produces same result as live processing.

- [x] **4.3** Run new tests: `npm test -- --reporter=verbose tests/electron/renderer/status-registry.test.ts tests/electron/renderer/status-updater.test.ts`

---

### Phase 5 — React Integration Hook

- [x] **5.1** Create `electron/renderer/src/hooks/useWorkingStatus.ts`:
  - Takes `worldId: string`, `chatId: string`.
  - Subscribes to registry changes (pub/sub via a lightweight emitter in `status-registry.ts`).
  - Returns `{ agentStatuses: Map<string, WorkingStatus>, chatStatus: WorkingStatus, worldStatus: WorkingStatus }`.
  - On unmount, unsubscribes.

- [x] **5.2** Extend `status-registry.ts` with a singleton mutable store + simple subscriber pattern:
  - `updateRegistry(fn: (r: StatusRegistry) => StatusRegistry): void` — applies update and notifies subscribers.
  - `subscribeToRegistry(listener: () => void): () => void` — returns unsubscribe function.
  - `getRegistry(): StatusRegistry` — read current snapshot.
  - The pure functions from Phase 2 remain pure; the store wraps them.

---

### Phase 6 — Wire Events + CRUD Lifecycle to Registry

#### 6A. Live Event Routing

- [x] **6.0a** Fix `serializeRealtimeToolEvent` in `electron/main-process/message-serialization.ts`:
  - Add `agentName: event?.agentName || null` to the returned `tool` payload object (alongside the existing `agentId` field, which is always null for tool events because the core emits `agentName`, not `agentId`).
  - Without this fix, the status updater cannot identify which agent triggered a tool event from the live IPC payload.

- [x] **6.0b** Thread `agentName` through the HITL option request so `hitl-option-request` events identify the requesting agent:
  - **`core/hitl.ts`** — `HitlOptionRequest`: add `agentName?: string`. In `requestWorldOption`, add `agentName: request.agentName || null` to `event.content`.
  - **`core/hitl-tool.ts`** — `HitlRequestToolContext`: add `agentName?: string`. Thread `context?.agentName` into `requestPrimaryResolution` (both calls) → `requestWorldOption`.
  - **`core/create-agent-tool.ts`** and **`core/load-skill-tool.ts`** — pass `agentName` from their tool context wherever the field is available (optional; no breaking change if omitted).
  - **`electron/main-process/message-serialization.ts`** — `serializeRealtimeSystemEvent`: extract `content.agentName` and include it in the serialized `system` payload alongside the existing fields.

- [x] **6.1** In `chat-event-handlers.ts`, `createChatSubscriptionEventHandler`: after routing each event to its existing handler, also call `updateRegistry(r => applyEventToRegistry(r, worldId, chatId, agentId, eventType, subtype))`.
  - Map the existing event type strings to the table in Phase 3.
  - **agentId extraction:**
    - SSE events: `streamPayload.agentName` (always present).
    - Tool events: `payload.tool.agentName` (added in step 6.0a); falls back to `payload.tool.agentId` for compatibility (currently always null).
    - System events (`hitl-option-request`): `systemPayload.agentName` (added in step 6.0b); if null, skip per-agent update and let the chat roll up from existing agent states.

#### 6B. Chat Switch / Event Replay — requires new IPC channel

- [x] **6.2a** Add `CHAT_GET_EVENTS: 'chat:getEvents'` IPC infrastructure:
  - Add `CHAT_GET_EVENTS: 'chat:getEvents'` to `DESKTOP_INVOKE_CHANNELS` in `electron/shared/ipc-contracts.ts`.
  - Add a route in `electron/main-process/ipc-routes.ts` calling `handlers.getEventsByWorldAndChat(worldId, chatId)`.
  - Add a handler in `electron/main-process/ipc-handlers.ts` that calls `eventStorage.getEventsByWorldAndChat(worldId, chatId)` (the storage method already exists).
  - Expose `getChatEvents(worldId, chatId)` in `electron/preload/bridge.ts`.

- [x] **6.2b** In the `useEffect` on `[loadedWorld?.id, selectedSessionId]` in `App.tsx`: on chat selection change, call `clearChatAgents(worldId, chatId)` then replay stored events for that chat via `applyEventToRegistry` for each event in insertion order.
  - Stored events are loaded via the new `api.getChatEvents(worldId, chatId)` call.
  - Persisted event format: `{ type: 'sse'|'tool', payload: { agentName, type: 'start'|'end'|'tool-start'|..., ... } }`. Map `storedEvent.type` + `storedEvent.payload.type` to `(eventType, subtype)` for `applyEventToRegistry`.
  - Only replay types relevant to status (`type === 'sse'` or `type === 'tool'`); skip `'message'`, `'log'`, `'world'` (activity), `'crud'`.

#### 6C. World Roster Sync — Single Reactive Point (replaces 6C–6F)

- [x] **6.3** In `App.tsx`, add a `useEffect` on `[loadedWorld, sessions]`:
  ```
  useEffect(() => {
    if (!loadedWorld) return;
    const chatIds = sessions.map(s => s.id);
    const agentIds = loadedWorld.agents.map(a => a.id);
    updateRegistry(r => syncWorldRoster(r, loadedWorld.id, chatIds, agentIds));
  }, [loadedWorld, sessions]);
  ```
  - This single effect reacts to every CRUD operation automatically: the existing code already calls `refreshWorldDetails` or `refreshSessions` after all agent/chat/world mutations, which updates `loadedWorld` and `sessions` state, which fires this effect.
  - No new IPC events, no new hooks, no per-operation callbacks needed.
  - `syncWorldRoster` is non-destructive: `working`/`complete` agents are not reset during the sync.
  - When the world is unloaded (`loadedWorld` becomes null), no sync runs — stale entries from a previous world do not matter since they are scoped by `worldId`.
  - This single effect reacts to every CRUD operation automatically: the existing code already calls `refreshWorldDetails` or `refreshSessions` after all agent/chat/world mutations, which updates `loadedWorld` and `sessions` state, which fires this effect.
  - No new IPC events, no new hooks, no per-operation callbacks needed.
  - `syncWorldRoster` is non-destructive: `working`/`complete` agents are not reset during the sync.
  - When the world is unloaded (`loadedWorld` becomes null), no sync runs — stale entries from a previous world do not matter since they are scoped by `worldId`.

---

### Phase 7 — New Status Display Component

- [x] **7.1** Create `electron/renderer/src/components/WorkingStatusBar.tsx`.

  **Props contract:**
  ```ts
  interface WorkingStatusBarProps {
    chatStatus: WorkingStatus;               // 'idle' | 'working' | 'complete'
    agentStatuses: { id: string; name: string; status: WorkingStatus }[];
    // ^ merged from registry agentStatuses + loadedWorld.agents for display names
  }
  ```

  **Display rules (purely presentational):**

  | `chatStatus` | What to show |
  |---|---|
  | `idle` | Nothing (or faint idle placeholder) |
  | `working` | `ActivityPulse` (animated) + comma-list of agents whose status is `working`, each showing name + `ThinkingIndicator` |
  | `complete` | Static checkmark + "Done" text (brief, then fades or clears on next interaction) |

  - Names come from `loadedWorld.agents` — the `id→name` mapping is done by the `useWorkingStatus` hook or by `App.tsx` before passing props; the component receives pre-merged data.
  - No event handling. No status calculation. Pure display.
  - Reuses `ActivityPulse` and `ThinkingIndicator` from existing components.

- [x] **7.2** Update `useWorkingStatus.ts` to return merged agent list:
  - Accept `agents: { id: string; name: string }[]` (from `loadedWorld.agents`) as a parameter.
  - Return `agentStatuses: { id: string; name: string; status: WorkingStatus }[]` — the merge of registry data and display names.
  - Agents in `loadedWorld.agents` with no registry entry default to `idle`.

- [x] **7.3** Wire into `App.tsx`:
  - Import `useWorkingStatus`, `WorkingStatusBar`.
  - Call `useWorkingStatus(worldId, selectedSessionId, loadedWorld?.agents ?? [])`.
  - Replace removed `StatusActivityBar` render with `<WorkingStatusBar chatStatus={chatStatus} agentStatuses={agentStatuses} />`.

---

### Phase 8 — Final Cleanup and Full Test Run

- [ ] **8.1** Run `npm test` — all tests must pass.
- [ ] **8.2** Fix any remaining type errors or test failures.
- [ ] **8.3** Remove any dead imports (`eslint` / `tsc` will surface them).
- [ ] **8.4** Verify `ActivityPulse.tsx` and `ThinkingIndicator.tsx` are still reachable (not orphaned).

---

## File Inventory

### Files to Delete
| File | Reason |
|------|--------|
| `electron/renderer/src/domain/status-bar.ts` | Replaced by status-registry |
| `electron/renderer/src/components/StatusActivityBar.tsx` | Replaced by WorkingStatusBar |
| `tests/electron/renderer/status-bar-domain.test.ts` | Tests deleted module |

### New Files
| File | Purpose |
|------|---------|
| `electron/renderer/src/domain/status-types.ts` | Enums + registry types |
| `electron/renderer/src/domain/status-registry.ts` | Pure registry + singleton store |
| `electron/renderer/src/domain/status-updater.ts` | Pure event→status reducer |
| `electron/renderer/src/hooks/useWorkingStatus.ts` | React bridge to registry |
| `electron/renderer/src/components/WorkingStatusBar.tsx` | New display component |
| `tests/electron/renderer/status-registry.test.ts` | Registry unit tests |
| `tests/electron/renderer/status-updater.test.ts` | Updater unit tests |

### Files Modified
| File | Changes |
|------|---------|
| `electron/renderer/src/domain/chat-event-handlers.ts` | Remove status publishing; add registry update calls |
| `electron/renderer/src/utils/app-helpers.ts` | Remove 3 deleted status helpers |
| `electron/renderer/src/hooks/useStreamingActivity.ts` | Remove status state; keep runtime refs |
| `electron/renderer/src/hooks/useChatEventSubscriptions.ts` | Remove `onSessionResponseStateChange`; add replay on chat switch |
| `electron/renderer/src/App.tsx` | Remove old status wiring; add `useWorkingStatus` + `WorkingStatusBar` |
| `tests/electron/renderer/chat-event-handlers-domain.test.ts` | Remove `setStatusText` usages |
| `tests/electron/renderer/app-utils-extraction.test.ts` | Remove deleted helper test suites |
| `electron/main-process/message-serialization.ts` | Add `agentName` to `serializeRealtimeToolEvent` and `serializeRealtimeSystemEvent` output |
| `core/hitl.ts` | Add `agentName` to `HitlOptionRequest` and `event.content` |
| `core/hitl-tool.ts` | Add `agentName` to `HitlRequestToolContext`; thread through `requestPrimaryResolution` |
| `core/create-agent-tool.ts` | Pass `agentName` to `requestWorldOption` where available |
| `core/load-skill-tool.ts` | Pass `agentName` to `requestWorldOption` where available |
| `electron/shared/ipc-contracts.ts` | Add `CHAT_GET_EVENTS` channel |
| `electron/main-process/ipc-routes.ts` | Add route for `CHAT_GET_EVENTS` |
| `electron/main-process/ipc-handlers.ts` | Add `getEventsByWorldAndChat` handler |
| `electron/preload/bridge.ts` | Expose `getChatEvents` to renderer |

---

## Approval Gate

Stop here. Do not begin implementation until the user approves this plan.
