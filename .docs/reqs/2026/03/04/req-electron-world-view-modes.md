# Requirement: Electron World View Modes and View Selector

## Overview

The Electron app currently renders world messages in a single chat-style presentation. This requirement introduces explicit world rendering view types so users can switch among multiple message visualization modes while preserving the existing behavior as the default.

## Goals

- Add typed world view modes for rendering user and agent messages in the Electron app.
- Keep the current message display as `Chat View`.
- Add three additional modes: `Board View`, `Grid View`, and `Canvas View`.
- Add a view selector in the top area of the screen, positioned to the left of the `Log` and `Settings` buttons.

## Functional Requirements

### FR-1: Define world view rendering types

The Electron renderer must define explicit world view types that can be used by state, UI controls, and rendering logic.

Required view types:
- `chat`
- `board`
- `grid`
- `canvas`

### FR-2: Preserve current rendering as Chat View

The current message rendering behavior must be retained and labeled as `Chat View`.

Acceptance intent:
- Existing user and agent message rendering in the current layout remains unchanged when `Chat View` is selected.
- `Chat View` is the default view for existing and new sessions unless user settings specify otherwise.

### FR-3: Add Board View

`Board View` must render agent messages in separate vertical lanes by agent identity.

Acceptance intent:
- Messages from different agents appear in distinct vertical columns/lanes.
- User messages remain visible in a way that preserves conversation continuity in this view.

### FR-4: Add Grid View

`Grid View` must render agent messages in separate agent-specific cells.

Required layout options to support:
- `1+2`
- `2+2`
- `2+2`

Acceptance intent:
- Users can switch among the listed grid layout options while in `Grid View`.
- Agent messages are grouped by agent and displayed in dedicated cells.

Note:
- The option list above intentionally mirrors the requested values verbatim.

### FR-5: Add Canvas View

`Canvas View` must render all agent messages together in a single shared visual area (`div`/canvas-style region).

Acceptance intent:
- Agent messages are shown in one shared space rather than per-agent lanes/cells.
- User messages remain visible and contextually connected to agent messages.

### FR-6: Add view selector in top controls

A world view selector control must be added in the top screen controls.

Placement requirement:
- The selector is placed immediately to the left of `Log` and `Settings` buttons.

Behavior requirement:
- Selector lists: `Chat View`, `Board View`, `Grid View`, `Canvas View`.
- Switching selection updates the message rendering mode immediately.

## Non-Functional Requirements

- View switching must be deterministic and not reorder message chronology unexpectedly.
- No regressions to current world message lifecycle behavior.
- UI must remain usable on desktop and mobile form factors used by the Electron renderer.

## Constraints

- Scope is limited to the Electron app.
- Existing event/message contracts must remain compatible.
- Existing `Log` and `Settings` controls must remain available and functional.

## Acceptance Criteria

- [ ] World view mode types are defined for `chat`, `board`, `grid`, `canvas`.
- [ ] Current rendering is preserved as `Chat View` and remains default behavior.
- [ ] `Board View` displays agent messages in separate vertical lanes.
- [ ] `Grid View` displays agent messages in separate cells and supports options `1+2`, `2+2`, `2+2`.
- [ ] `Canvas View` displays all agent messages in one shared area.
- [ ] A top-level view selector is visible and positioned to the left of `Log` and `Settings`.
- [ ] Changing view selection updates rendering mode without breaking message visibility.
