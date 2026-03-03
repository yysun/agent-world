# REQ: Event Subscription Consolidation (One Agent One Subscription)

**Date:** 2026-03-03  
**Status:** Draft

---

## Problem

The app emits a `MaxListenersExceededWarning`:

```
MaxListenersExceededWarning: Possible EventEmitter memory leak detected.
11 system listeners added to [EventEmitter]. MaxListeners is 10.
```

### Root Cause

Every world has a single `EventEmitter` instance. Listeners are registered on it from multiple independent concerns, each adding its own handler per event channel:

| Concern | Event channels | Listeners added |
|---|---|---|
| `setupEventPersistence` | `message`, `sse`, `world`, `system` | 4 |
| `setupWorldActivityListener` | `world` | 1 |
| `subscribeWorldToMessages` (title scheduling) | `message` | 1 |
| `subscribeAgentToMessages` (per agent) | `message` | 1 per agent |
| `setupWorldEventListeners` (per client connection) | `message`, `sse`, `world`, `system` | 4 per client |

With N agents and K clients connected to a single world the `message` channel receives  
`N + 2 + K` listeners and the `system` channel receives `1 + K` listeners.  
With the default limit of 10, a world with 8+ agents (1 client) already triggers the warning on the `message` channel.  
With 5 agents and the warning appearing on `system`, the likely cause is multiple client connections (refreshes/reconnects) accumulating forwarding listeners that are not cleaned up before the next subscription is created.

---

## Design Goals

1. **One agent, one subscription** — each agent registers exactly **one** listener on the `message` channel.  
2. **One combined world-level handler per event channel** — all world-level infrastructure concerns (persistence + activity + title-scheduling) must share listeners rather than each owning separate ones.  
3. **The invariant holds for any number of agents** — adding/removing agents must not change the count of world-level listeners; only the per-agent `message` listeners grow with the number of agents.

---

## What Must Change

### 1. Merge `message` world-level listeners

Currently two separate `message` listeners exist at the world level:

- **Persistence** (`messageHandler` inside `setupEventPersistence`) — persists every message event.
- **Title-scheduling** (`subscribeWorldToMessages`) — schedules chat-title generation on idle human messages.

**Requirement:** Replace them with a **single** combined `message` listener on the world. This listener runs both the persistence logic and the title-scheduling logic sequentially within one handler attachment.

### 2. Merge `world` channel listeners

Currently two separate `world` listeners exist:

- **Persistence** (`toolHandler` inside `setupEventPersistence`) — persists tool and activity events.
- **Activity listener** (`setupWorldActivityListener`) — triggers idle title generation.

**Requirement:** Replace them with a **single** combined `world` listener that runs both persistence and activity-based title generation within one handler.

### 3. Keep `sse` and `system` listeners unchanged

These channels already have exactly one world-level listener each (persistence only). They do not need to change.

### 4. `setupWorldEventListeners` (client-forwarding) is excluded from this consolidation

The forwarding listeners in `setupWorldEventListeners` are runtime/transport concerns, not infrastructure concerns. The growth of forwarding listeners (K per channel) must be controlled separately by ensuring subscriptions are cleaned up on client disconnect/reconnect. That is out of scope for this REQ; the problem described here is the world-level infrastructure listener accumulation.

---

## Desired Listener Count After This Change

For a world with N agents and **1** connected client:

| Event channel | Before | After |
|---|---|---|
| `message` | N + 2 + 1 | N + 1 + 1 |
| `world` | 2 + 1 | 1 + 1 |
| `sse` | 1 + 1 | 1 + 1 (unchanged) |
| `system` | 1 + 1 | 1 + 1 (unchanged) |

The world-level infrastructure footprint on `message` drops from 2 to 1, and on `world` from 2 to 1. Each agent still has exactly one listener on `message`. No listener counts grow with the number of agents except the per-agent `message` subscriptions.

---

## Constraints

- No change to the public API surface of `setupEventPersistence`, `setupWorldActivityListener`, or `subscribeWorldToMessages`. Callers in `managers.ts` and `subscription.ts` must not need to be updated unless cleanup handling changes.
- Cleanup (`removeListener`) must remain complete — removing the combined listeners must remove all the merged responsibilities.
- Tests in `tests/core/events/` must continue to pass.

---

## Out of Scope

- Reducing the per-agent listener count (each agent keeps its one `message` listener).
- Fixing the growth from repeated `setupWorldEventListeners` calls (client reconnect leak) — separate issue.
- Changing `subscribeToMessages` in `publishers.ts`.
