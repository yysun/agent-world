# Requirement: Electron Non-Chat Human Panel Layout

## Story

`electron-non-chat-human-panel-layout`

## Overview

The Electron renderer's non-chat world views (`board`, `grid`, `canvas`) must always show the latest human input panel when the user switches away from chat view. The current implementation is unstable: the human input panel can disappear after a view switch, the lower content panes can lose scrolling, and repeated fixes have shifted the bug between layout, partitioning, and scroll behavior without producing a stable contract.

This requirement redefines the non-chat layout around a simpler and more explicit structure instead of incremental class tweaks.

## Background

Recent fixes attempted to solve the issue through:

- sticky positioning of the latest human message
- moving scroll ownership between the outer transcript viewport and inner board/grid/canvas panes
- resetting outer scroll positions on non-chat view entry
- adjusting human-message partitioning to recognize persisted sender variants such as `you`

These changes improved isolated failure modes, but the overall layout contract is still ambiguous. The live bug remains: after switching from chat view, the human input panel can still disappear even though tests pass.

The root problem is architectural rather than cosmetic: multiple layers currently participate in scroll management and height negotiation for the same surface.

## Goals

- Make the latest human input panel deterministically visible in all non-chat views after any view switch.
- Ensure board/grid/canvas content scrolls independently without hiding or overlapping the human panel.
- Eliminate competing scroll ownership between the outer transcript viewport and inner non-chat panes.
- Replace fragile layout coupling with a simpler, testable non-chat surface contract.

## Functional Requirements

### FR-1: Non-chat layout must use explicit two-region structure

Non-chat world views must render as exactly two vertical regions inside the message area:

- a top human input region that always renders when a latest human message exists
- a lower content region that owns all scrolling for board/grid/canvas/system content

The top region must remain visible after switching from chat view.

### FR-2: Outer transcript viewport must not control non-chat scrolling

When the active world view is `board`, `grid`, or `canvas`, the outer transcript viewport must not be the primary scrolling surface for the message content. Non-chat scrolling must be owned by the lower region defined in FR-1.

### FR-3: Human panel detection must reuse canonical renderer message semantics

The latest human input panel must be derived from the same canonical human-message classification used elsewhere in the renderer. Non-chat view behavior must not depend on a narrower or duplicate sender-role heuristic.

### FR-4: View switching must preserve human-panel visibility

Switching from `chat` to any non-chat view must never leave the user at a scroll position where the human input panel is hidden or absent when a latest human message exists.

### FR-5: Lower non-chat content must remain scrollable

Board lanes, grid cells, canvas message surfaces, and system-message sections must remain reachable via scrolling after the redesign. Fixing the human panel must not regress lower-pane scroll behavior.

### FR-6: Layout must avoid overlap and clipping

The human input panel must not be covered by the composer, hidden behind the header, or visually overlapped by scrolling lower content.

## Non-Functional Requirements

- The redesign must favor one clear scroll owner per active surface.
- The implementation must keep renderer layering consistent with `app/shell` orchestration and `features/chat` ownership.
- The fix must include targeted regression coverage at the renderer boundary.
- Existing chat-view behavior must remain unchanged.

## Constraints

- Keep web and Electron app behavior separate; this change applies only to the Electron renderer.
- Do not reintroduce floating composer overlap.
- Do not rely on brittle chains of compensating scroll resets as the primary design.

## Acceptance Criteria

- [ ] Switching from chat to board shows the latest human input panel at the top when one exists.
- [ ] Switching from chat to grid shows the latest human input panel at the top when one exists.
- [ ] Switching from chat to canvas shows the latest human input panel at the top when one exists.
- [ ] The lower board/grid/canvas region remains scrollable after the switch.
- [ ] Human input detection works for canonical persisted sender values including `human`, `user`, and `you`.
- [ ] No non-chat content scrolls over or hides the human input panel.
- [ ] Focused renderer unit tests cover the redesigned contract.
