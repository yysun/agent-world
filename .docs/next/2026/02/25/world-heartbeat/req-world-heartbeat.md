# REQ: World Heartbeat

**Date:** 2026-02-22
**Status:** Updated

---

## Overview

Add a configurable heartbeat mechanism to worlds. When enabled, the world periodically sends a user-defined prompt message (with `sender='world'`) into the world's current active chat on a cron-style schedule.

Core provides heartbeat scheduling functions (`startHeartbeat`, `stopHeartbeat`, `isValidCronExpression`). The **Electron main process** is the only caller — it manages the job registry, multi-world subscriptions, and runtime controls. The **API/web app** does not invoke heartbeat scheduling.

---

## New World Configuration Fields

Three new optional fields are added to the world configuration:

| Field | Type | Default | Description |
|---|---|---|---|
| `heartbeatEnabled` | `boolean` | `false` | Whether heartbeat is configured for this world |
| `heartbeatInterval` | `string` | `""` | Cron expression defining the firing schedule (e.g. `"*/5 * * * *"`) |
| `heartbeatPrompt` | `string` | `""` | The message text sent on each heartbeat tick |

These fields are persisted by core storage and returned with world data. Core provides the heartbeat scheduling functions but does not invoke them itself — callers decide when to start/stop.

---

## Heartbeat Behavior

### When Heartbeat is Disabled
- No messages are sent. No scheduler runs for this world.

### When Heartbeat is Enabled
- A cron scheduler fires according to `heartbeatInterval` (standard 5-field cron format).
- On each tick, the Electron main process publishes `heartbeatPrompt` as a message with `sender='world'` into the world's current active chat (`currentChatId`).
- If `currentChatId` is null, the tick is skipped silently.
- If the world is currently processing (`isProcessing === true`), the tick is skipped silently (no queuing).
- The heartbeat message is persisted and visible in chat history like any other world message.

### Validation
- `heartbeatInterval` must be a valid 5-field cron expression when `heartbeatEnabled` is `true`.
- `heartbeatPrompt` must be non-empty when `heartbeatEnabled` is `true`.
- Both fields are preserved when `heartbeatEnabled` is `false`, so values are not lost on toggle.

---

## Electron App — Multi-World Subscriptions

The Electron main process currently subscribes to worlds on-demand (when the renderer opens a chat). This is extended so that the main process **subscribes to all heartbeat-enabled worlds at workspace load**, independent of which world the user is currently viewing.

This allows heartbeat messages to fire and be persisted for any world, even when the user is viewing a different world or chat.

---

## Electron App — Heartbeat Job Manager

The Electron main process manages a registry of heartbeat cron jobs, one per world that has `heartbeatEnabled=true`. The job manager is responsible for:

- **Starting** a job when a heartbeat-enabled world is loaded at workspace open.
- **Restarting** a job when the world's heartbeat config is updated (interval or prompt changed).
- **Stopping** a job when the world is deleted, the workspace is closed, or the job is manually stopped via UI.
- **Pausing / Resuming** a job at runtime without modifying persisted config.

Job status values: `running`, `paused`, `stopped`.

---

## Electron App — World Edit Form

The world edit panel (`panelMode === 'edit-world'`) gains a new **Heartbeat** section below the existing **Main Agent** field:

1. **Enable Heartbeat** — toggle switch.
2. **Heartbeat Interval** — text input, visible only when enabled. Placeholder: `"Cron schedule (e.g. */5 * * * *)"`. Helper text: `"Standard 5-field cron format"`.
3. **Heartbeat Prompt** — textarea, visible only when enabled. Placeholder: `"Message to send on each heartbeat"`.

Interval and prompt fields are hidden (not just disabled) when `heartbeatEnabled` is false.

Validation on submit: if `heartbeatEnabled` is true, rejects empty prompt or invalid cron expression with an inline error.

---

## Electron App — Settings Panel: Heartbeat Jobs

The system settings panel gains a new **Heartbeat Jobs** section that shows the runtime status of all heartbeat cron jobs across all worlds.

Each job entry displays:
- World name
- Cron interval
- Current status (`running` / `paused` / `stopped`)
- Action buttons: **Run**, **Pause**, **Stop**

Actions affect runtime job state only. To permanently disable heartbeat, the user edits the world config.

If no worlds have heartbeat configured, the section shows an empty-state message.

---

## Affected Areas (WHAT, not HOW)

| Area | Change |
|---|---|
| `core/types.ts` | `World`, `CreateWorldParams`, `UpdateWorldParams` gain 3 heartbeat fields |
| Core storage | 3 new fields persisted and loaded with world data |
| `core/heartbeat.ts` | New — `startHeartbeat`, `stopHeartbeat`, `isValidCronExpression` (callable, not auto-invoked) |
| `electron/main-process` | New heartbeat job manager: calls core functions, manages per-world job registry |
| `electron/main-process` | Multi-world subscriptions: subscribe all heartbeat worlds at workspace load |
| `electron/main-process` | New IPC channels for heartbeat job list + run/pause/stop |
| `electron/renderer` world edit form | Heartbeat section: toggle, interval, prompt |
| `electron/renderer` form state & validation | Heartbeat fields in form helpers + cron validation |
| `electron/renderer` settings panel | New Heartbeat Jobs section with runtime controls |

---

## Out of Scope

- Web UI (`web/src`) heartbeat changes (separate effort).
- Per-chat heartbeat targeting (always targets `currentChatId`).
- Heartbeat history / audit log beyond normal message persistence.
- Timezone-aware cron (UTC only).
- Heartbeat fields on the create-world form (configure via edit after creation).
- Queueing skipped ticks (dropped, not retried).

---

## Open Questions (Resolved)

| Question | Decision |
|---|---|
| Where does scheduler run? | Core provides the functions; Electron main process invokes them. API app does not. |
| Which chats receive heartbeat? | `currentChatId` only. |
| Heartbeat while world is processing? | Skip tick silently. |
| Cron format | 5-field standard (minute, hour, dom, month, dow). |
| Create-world form | Heartbeat omitted; configure via edit after creation. |
| Skipped ticks | Dropped, not retried or queued. |
| Runtime stop vs permanent disable | Runtime controls (run/pause/stop) don't write to world config. Permanent disable via world edit form. |
