# REQ: Web World Right Panel Mobile-Friendly Behavior

## Summary
Define responsive behavior for the World page so the right panel remains usable across desktop, tablet, and mobile without breaking chat usability.

## Problem Statement
The current World page keeps desktop-oriented width/scale assumptions and fixed panel sizing. On smaller viewports, the chat area, right panel, and composer compete for space, causing cramped layout, reduced tap-target usability, and inconsistent access to chat history/settings.

## Goals
- Keep chat as the primary interaction surface on all viewports.
- Keep right panel functionality available on all viewports.
- Ensure responsive behavior is deterministic across desktop, tablet, and mobile.
- Eliminate horizontal overflow and clipped core interactions in the World page.

## Non-Goals
- Redesigning the visual theme, typography, or iconography.
- Changing backend APIs, world/chat data models, or SSE protocol behavior.
- Refactoring unrelated Home page or non-World routes as part of this requirement.

## Requirements (WHAT)
1. On desktop viewports, the World page must render chat and right panel side-by-side in the same layout flow.
2. On desktop viewports, the right panel must provide access to chat history and world actions without overlaying or hiding the primary chat area.
3. On tablet viewports, the right panel must be user-toggleable (open/close) and must not permanently consume chat width when closed.
4. On mobile viewports, the right panel content must be accessible through a dedicated mobile surface (for example sheet/drawer) that preserves chat readability and composer usability.
5. On mobile viewports, opening panel content must not cause the chat composer to become unreachable.
6. Viewport changes (resize/orientation) must preserve active world, selected chat, and active message stream context.
7. Core right-panel capabilities (chat search/load/create/delete and world actions currently exposed in panel controls) must remain reachable in responsive modes.
8. The World page must avoid horizontal page overflow for common viewport widths (phone portrait, phone landscape, tablet portrait, desktop).
9. Interactive controls in responsive panel states must remain touch-usable (no visually collapsed or inaccessible controls).
10. Existing message send/stop behavior and chat rendering behavior must remain functionally unchanged by the responsive panel work.

## Acceptance Criteria
- Desktop shows side-by-side chat and right panel with no overlap.
- Tablet supports opening/closing the panel while preserving chat-first usage.
- Mobile provides accessible panel content via a mobile-appropriate surface.
- Chat composer remains reachable and usable on mobile when panel is closed and after panel interactions.
- No horizontal scrolling appears in World page at target breakpoints.
- Chat history operations and world actions continue to work from responsive panel flows.
- Active world/chat/session context remains stable during viewport changes.
