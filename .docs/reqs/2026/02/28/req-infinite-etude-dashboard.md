# Requirement: Infinite-Étude Fixed-State Generative Dashboard

**Date**: 2026-02-28
**Type**: Feature — New UI Mode
**Component**: Web UI, Electron UI, Core (World config), SSE pipeline
**World**: `infinite-etude` (3 agents: Madame Pedagogue, Maestro Composer, Monsieur Engraver)

## Overview

Transition Infinite-Étude from the standard scrolling chat interface to a **Fixed-State Generative Dashboard** — a stable, non-scrolling UI where each agent occupies a dedicated zone. Content in each zone is **replaced** (not appended) whenever the corresponding agent produces a new response.

The goal is to provide a focused environment for music notation exercises, free from the distraction of an accumulating message history.

## Problem Statement

The current Agent-World UI is a chronological chat log. For Infinite-Étude:
- VexFlow sheet music renderings get buried in a growing message stream.
- Users must scroll to find the latest exercise and the latest score.
- The chat metaphor is a poor fit for a generative sight-reading trainer where only the **current state** matters.

## Goals

- Provide a fixed, non-scrolling dashboard layout for worlds that opt in.
- Each agent's output occupies a dedicated, named zone that replaces on update.
- VexFlow renderings display in stable viewports without scroll hunting.
- The dashboard must coexist with the standard chat UI — worlds choose their mode.
- The user can still send messages (text input) to trigger new generation cycles.

## Non-Goals

- Redesigning the standard chat UI for other worlds.
- Changing the core agent orchestration or turn-taking model.
- Supporting arbitrary numbers of zones or user-customizable layouts (3 fixed zones for now).

## Functional Requirements

### REQ-1: World-Level UI Mode Configuration

- The `World` type **MUST** support an optional `uiMode` field.
- Valid values: `'chat'` (default, current behavior) and `'dashboard'`.
- When `uiMode` is absent or `'chat'`, all behavior remains unchanged.
- `uiMode` **MUST** be persistable in `config.json` and editable via the existing World settings UI.
- `uiMode` **MUST** be delivered to the frontend via the existing World API/SSE responses.

### REQ-2: Dashboard Layout — Three Fixed Zones

When `uiMode` is `'dashboard'`, the UI **MUST** render three named zones instead of a scrolling message list:

| Zone | Agent | Content Type |
|------|-------|-------------|
| Pedagogue Zone | `madame-pedagogue` | Text — exercise instructions, feedback, difficulty info |
| Composer Zone | `maestro-composer` | Text — musical parameters, composition description |
| Engraver Zone | `monsieur-engraver` | VexFlow — rendered sheet music notation |

- Zones **MUST** be visually distinct, non-scrolling panels (their content is replaced, not appended).
- The Engraver Zone **SHOULD** be the largest, as it renders sheet music graphics.
- Zone layout **SHOULD** be responsive to different viewport sizes.

### REQ-3: State-Overwrite Content Model

- When a new message arrives for a given agent, the corresponding zone's content **MUST** be fully replaced with the new content.
- Previous content in that zone is discarded from the visible UI (it remains in the message store/history for persistence).
- During streaming, the zone **MUST** show the in-progress content (partial updates), then settle on the final content.
- If multiple agents stream simultaneously, each zone **MUST** update independently.

### REQ-4: Zone-Based Content Routing

- The frontend **MUST** route incoming messages/streaming events to the correct zone based on the `agentName` field already present in SSE events.
- No new backend protocol or structured JSON output format from agents is required — existing `agentName` on events is sufficient for routing.
- The existing custom renderer pipeline (e.g., VexFlow renderer for the Engraver zone) **MUST** continue to work within the zone context.

### REQ-5: User Input Persistence

- The dashboard **MUST** retain a text input area for the user to send messages.
- User messages trigger agent processing cycles as they do today.
- The input area **SHOULD** be visually separated from the agent zones (e.g., below the dashboard grid).

### REQ-6: Message History Access

- The dashboard **MUST** provide a way to access full message history (e.g., a toggle/drawer/tab to switch to the scrolling chat view, or a side panel).
- This ensures no data is hidden from the user; the dashboard is a display mode, not a data-loss mode.

### REQ-7: Metadata Display

- Each zone **SHOULD** display metadata about its current state:
  - Agent name
  - Timestamp of last update
  - Optional: status indicator (idle, streaming, error)

### REQ-8: Web UI and Electron Parity

- The dashboard mode **MUST** be implemented in the web UI.
- The dashboard mode **SHOULD** be implemented in the Electron UI.
- Per project rules, the web and Electron implementations **MUST** remain independent (no cross-app shared modules).

## Constraints

- The `World` type change touches shared core code — backward compatibility with existing worlds (which have no `uiMode` field) **MUST** be preserved.
- The standard chat UI **MUST NOT** be altered by this feature when `uiMode` is `'chat'` or absent.
- The VexFlow custom renderer already handles sheet music rendering — the dashboard layout wraps it, not replaces it.

## User Stories

1. **As a sight-reading student**, I open Infinite-Étude and see three stable panels: instructions, composition info, and sheet music. I type "give me a C major exercise" and all three panels update with the new exercise — no scrolling required.

2. **As a world creator**, I set `uiMode: 'dashboard'` in my world config and the UI switches to the fixed-zone layout without any code changes on my part.

3. **As a power user**, I want to review the full conversation history, so I click a toggle to switch back to the standard chat view at any time.

## Open Questions

1. Should zone layout be configurable per-world (e.g., number of zones, zone sizes), or is the 3-zone layout sufficient as a first version?
2. Should the metadata display include agent-specific controls (e.g., "regenerate this zone")?
3. When switching from dashboard to chat-history view and back, should the dashboard restore the latest state per zone, or re-render from the latest messages?
