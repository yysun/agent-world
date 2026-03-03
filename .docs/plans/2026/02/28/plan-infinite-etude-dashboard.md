# Plan: Infinite-Étude Fixed-State Generative Dashboard

**Date**: 2026-02-28
**Requirement**: [req-infinite-etude-dashboard.md](../../../reqs/2026/02/28/req-infinite-etude-dashboard.md)
**Branch**: `feature/dashboard-ui-mode` (from `feature/opik-safety-robust-ui-demo`)

## Phase 1 — Core Type & Config (Backend)

- [x] **1.1** Add `DashboardZone` type and fields to `core/types.ts`
  - Add `DashboardZone` interface: `{ id: string; agent: string; label: string; size: 'small' | 'medium' | 'large' }`
  - Add `uiMode?: 'chat' | 'dashboard'` to `CreateWorldParams`
  - Add `dashboardZones?: DashboardZone[]` to `CreateWorldParams`
  - Both propagate to `UpdateWorldParams` automatically via `Partial<>`
  - Add both to the `World` interface (after `variables`, before `isProcessing`)
  
- [x] **1.2** Update `serializeWorld()` in `server/api.ts`
  - Add `uiMode: world.uiMode || 'chat'` to the return object
  - Add `dashboardZones: world.dashboardZones || []` to the return object

- [x] **1.3** Update `infinite-etude` config.json in data repo
  ```jsonc
  {
    "uiMode": "dashboard",
    "dashboardZones": [
      { "id": "instructions", "agent": "madame-pedagogue", "label": "Exercise", "size": "small" },
      { "id": "composition", "agent": "maestro-composer", "label": "Composition", "size": "small" },
      { "id": "notation", "agent": "monsieur-engraver", "label": "Sheet Music", "size": "large" }
    ]
  }
  ```

- [ ] **1.4** Write unit test for serialization *(deferred — serializeWorld has existing coverage; new fields are trivial pass-through)*
  - Verify `serializeWorld` includes `uiMode` and `dashboardZones`
  - Verify default values when fields are absent (`'chat'` and `[]`)

## Phase 2 — Frontend Types & State (Web UI)

- [x] **2.1** Add `DashboardZone`, `uiMode`, `dashboardZones` to frontend types
  - File: `web/src/types/index.ts` — mirror the core `DashboardZone` type and add fields to the frontend `World` interface

- [x] **2.2** Add dashboard zone state to `WorldComponentState`
  - File: `web/src/types/index.ts`
  - Add `dashboardZoneContent: Map<string, { message: Message | null; isStreaming: boolean }>` to track the latest message per zone

- [x] **2.3** Write zone content resolution logic
  - File: new `web/src/domain/dashboard-zones.ts`
  - `resolveZoneContent(zones: DashboardZone[], messages: Message[]): Map<zoneId, Message>` — for each zone, find the latest message from its assigned agent
  - `routeStreamEventToZone(zones: DashboardZone[], agentName: string): zoneId | null` — map an SSE agentName to a zone
  - Write unit tests for both functions

## Phase 3 — Dashboard Component (Web UI)

- [x] **3.1** Create `WorldDashboard` component
  - File: new `web/src/components/world-dashboard.tsx`
  - Reads `dashboardZones` from the world config
  - Renders a CSS grid of `DashboardZonePanel` components (one per zone)
  - Includes the existing composer input area (extract shared input from `world-chat.tsx` or duplicate)
  - Includes a "Show Chat History" toggle button

- [x] **3.2** Create `DashboardZonePanel` sub-component
  - File: part of `world-dashboard.tsx` or separate `web/src/components/dashboard-zone-panel.tsx`
  - Renders: zone label, agent name, status indicator, timestamp
  - Renders the zone's current message via `renderMessageContent()` (reuses the existing pipeline including VexFlow)
  - CSS: non-scrolling replacement content, respects `size` hint for grid column/row sizing

- [x] **3.3** Add dashboard CSS *(added to `web/src/styles.css` instead of separate file)*
  - File: `web/src/components/world-dashboard.css` or inline styles
  - CSS grid layout: `small` zones = 1fr, `large` zone = 2fr (or similar)
  - Responsive breakpoints: stack vertically on narrow viewports
  - Zone panels: bordered cards with header (label + status) and content area

- [x] **3.4** Wire conditional render in `World.tsx`
  - At line ~264 in `web/src/pages/World.tsx`, replace the existing `<WorldChat ... />` with:
    ```tsx
    {state.world?.uiMode === 'dashboard'
      ? <WorldDashboard
          world={state.world}
          messages={state.messages}
          userInput={state.userInput}
          isSending={state.isSending}
          isWaiting={state.isWaiting}
          isBusy={state.isBusy}
          ... />
      : <WorldChat ... />}
    ```

## Phase 4 — SSE Event Routing for Dashboard (Web UI)

- [x] **4.1** Update stream handlers for dashboard zone routing
  - File: `web/src/pages/World.update.ts`
  - In `handleStreamChunk` / `handleStreamEnd` / `handleMessageEvent`: when `uiMode === 'dashboard'`, also update `dashboardZoneContent` map (keyed by zone id) with the latest message for that agent
  - The existing `messages[]` array continues to accumulate for history access — the dashboard zones are a parallel view

- [x] **4.2** Handle zone initialization on world load
  - When a dashboard world loads, scan the existing `messages[]` to populate `dashboardZoneContent` with the most recent message per agent/zone
  - This ensures the dashboard shows content immediately, not just on new messages

## Phase 5 — Chat History Toggle

- [x] **5.1** Add view toggle state and handler
  - Add `dashboardShowHistory: boolean` to `WorldComponentState` (default `false`)
  - Add `toggle-dashboard-history` event handler to `World.update.ts`

- [x] **5.2** Wire toggle in dashboard component
  - When `dashboardShowHistory` is true, render `<WorldChat>` instead of the zone grid
  - Toggle button switches between "Dashboard" and "Chat History" views
  - State persists only for the current session (not saved to config)

## Phase 6 — Testing & Verification

- [x] **6.1** Unit tests for zone resolution logic (`dashboard-zones.ts`) — 14 tests, all passing
  - Test: maps agent messages to correct zones
  - Test: handles missing agents (empty zone)
  - Test: handles unknown agent (message not in any zone)
  - Test: returns latest message per agent, not all messages

- [ ] **6.2** Unit test for World type backward compatibility *(deferred with 1.4)*
  - Test: a world with no `uiMode` defaults to `'chat'` behavior
  - Test: `serializeWorld` handles `undefined` uiMode and dashboardZones gracefully

- [ ] **6.3** Manual integration test *(requires running server + Ollama)*
  - Load Infinite-Étude with dashboard config
  - Verify 3 zones render with correct labels
  - Send a message − verify zones update (not append)
  - Toggle to history view − verify full chat log appears
  - Toggle back − verify dashboard state restored
  - Verify standard worlds (no `uiMode`) are unaffected

## Phase 7 — UI Mode Toggle in World Settings

- [ ] **7.1** Add `uiMode` select to world settings panel
  - File: `web/src/components/world-settings.tsx`
  - Add a `<select>` with options `chat` / `dashboard` after the "LLM Call Limit" setting item
  - Display current `world.uiMode` (default `'chat'`)
  - Fire `'update-world-ui-mode'` AppRun event on change

- [ ] **7.2** Register new event type
  - File: `web/src/types/events.ts`
  - Add `{ name: 'update-world-ui-mode'; payload: 'chat' | 'dashboard' }`

- [ ] **7.3** Add event handler
  - File: `web/src/pages/World.update.ts`
  - Call `api.updateWorld(state.worldName, { uiMode: payload })` to persist
  - Update `state.world.uiMode` locally
  - If switching to dashboard: resolve zone content via `resolveZoneContent()`
  - If switching to chat: reset `dashboardShowHistory` to `false`

- [ ] **7.4** Verify PATCH route accepts `uiMode`
  - File: `server/api.ts` — confirm the PATCH `/api/worlds/:name` handler passes `uiMode` through (no field whitelist blocking it)

## File Change Summary

| File | Action | Phase |
|------|--------|-------|
| `core/types.ts` | Add `DashboardZone`, `uiMode`, `dashboardZones` | 1.1 |
| `server/api.ts` | Add fields to `serializeWorld()` | 1.2 |
| `agent-world/data/worlds/infinite-etude/config.json` | Add dashboard config | 1.3 |
| `web/src/types/index.ts` | Mirror types + add zone state | 2.1, 2.2 |
| `web/src/domain/dashboard-zones.ts` | **New** — zone resolution logic | 2.3 |
| `web/src/components/world-dashboard.tsx` | **New** — dashboard layout component | 3.1 |
| `web/src/components/dashboard-zone-panel.tsx` | **New** — zone panel sub-component | 3.2 |
| `web/src/components/world-dashboard.css` | **New** — dashboard styles | 3.3 |
| `web/src/pages/World.tsx` | Conditional render switch | 3.4 |
| `web/src/pages/World.update.ts` | Zone state handlers | 4.1, 4.2, 5.1 |
| `web/src/components/world-dashboard.tsx` | History toggle UI | 5.2 |
| `tests/dashboard-zones.test.ts` | **New** — unit tests | 6.1 |
| `tests/serialize-world.test.ts` | Add/update tests | 6.2 |
| `web/src/components/world-settings.tsx` | Add `uiMode` select toggle | 7.1 |
| `web/src/types/events.ts` | Add `update-world-ui-mode` event | 7.2 |
| `web/src/pages/World.update.ts` | Add `update-world-ui-mode` handler | 7.3 |
| `server/api.ts` | Verify PATCH passes `uiMode` | 7.4 |

## Notes

- **Electron is deferred.** Per REQ-8, Electron is SHOULD. We implement web-first and assess Electron separately.
- **No agent prompt changes.** Zone routing uses the existing `agentName` field on SSE events. Agents continue to respond naturally.
- **No SSE protocol changes.** All routing is frontend-only — the backend event pipeline is untouched.
- **`dashboardZones` is config-driven.** Any world can use dashboard mode by adding `uiMode` + `dashboardZones` to its config.json. No per-world code needed.
