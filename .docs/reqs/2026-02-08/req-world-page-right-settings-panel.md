# Requirement: World Page Right Settings Panel + Responsive Layout

**Date**: 2026-02-08  
**Type**: UI Enhancement  
**Target**: React app World page

## Overview

Add a right-side settings panel on the World page that can slide open/closed and contains both World settings and Agent settings. The panel must appear beside the main content area and must not overlay or cover the main area on desktop/tablet layouts.  
Update the World page layout to be responsive so chat, chat navigation, and settings remain usable across desktop, tablet, and mobile widths.

## Goals

- Provide quick access to World settings from the World page.
- Provide quick access to Agent settings from the World page.
- Keep the main content visible and usable while settings are open.
- Ensure the World page remains functional and readable across desktop, tablet, and mobile viewports.

## Functional Requirements

- **REQ-1**: The World page must include a right-side settings panel region.
- **REQ-2**: The right-side panel must support a slide open/close behavior.
- **REQ-3**: The panel must include two settings sections:
  - World settings
  - Agent settings
- **REQ-4**: World settings and Agent settings must be accessible within the same right-side panel without leaving the World page.
- **REQ-5**: When the panel is open, it must be displayed side-by-side with the main area (split layout), not as an overlay.
- **REQ-6**: Opening the panel must not block interaction with the main area unless a specific control is intentionally disabled.
- **REQ-7**: The panel must preserve correct context for the currently selected world and agent.
- **REQ-8**: The panel must allow switching between World settings and Agent settings from within the panel.
- **REQ-9**: Trigger behavior must be consistent:
  - Clicking the world settings control opens the panel to World settings.
  - Clicking an agent entry opens the panel to Agent settings for that agent.
- **REQ-10**: World page layout must adapt by viewport size:
  - Desktop: chat list + main content + optional right settings panel are all supported within the page layout.
  - Tablet: chat list remains available (collapsible is acceptable), and settings remain available without leaving the page.
  - Mobile: chat list and settings remain accessible through responsive navigation patterns without breaking chat usage.
- **REQ-11**: On mobile widths, critical chat actions (view messages, send message, switch chat) must remain accessible when settings are opened and closed.
- **REQ-12**: Responsive behavior must cover key World page regions:
  - Chat list/navigation region
  - Main chat region
  - Settings region (World and Agent)

## Non-Functional Requirements

- **NFR-1 (Responsiveness)**: On desktop/tablet widths, the layout must remain side-by-side when the panel is open.
- **NFR-2 (Usability)**: The panel open/close control must be discoverable and consistently available on the World page.
- **NFR-3 (Stability)**: Existing World page interactions must continue to work when the panel is closed or open.
- **NFR-4 (Mobile Usability)**: On mobile, content must avoid horizontal clipping/overflow and remain readable and operable with touch input.
- **NFR-5 (Interaction Continuity)**: Responsive transitions (resize or orientation change) must not lose selected world/chat/agent context.

## Constraints

- Must be implemented in the existing React World page flow.
- Must not introduce a modal or fullscreen settings experience for this feature.
- Must not require separate pages/routes to access World or Agent settings in the World page workflow.

## Out of Scope

- Redesigning unrelated World page sections.
- Backend/data model changes unrelated to displaying/editing settings in the panel.
- New settings domains beyond World settings and Agent settings.

## Acceptance Criteria

- [ ] A right-side panel exists on the World page.
- [ ] The panel can slide open and slide closed.
- [ ] The panel provides access to both World settings and Agent settings.
- [ ] The open panel sits beside the main area and does not cover it.
- [ ] Main area remains visible while the panel is open.
- [ ] Main area interactions remain functional while the panel is open (except explicitly disabled controls).
- [ ] The panel content reflects the active world and selected agent context.
- [ ] Desktop viewport behavior is usable with chat list, main content, and right settings panel.
- [ ] Tablet viewport behavior is usable with accessible chat list and settings controls.
- [ ] Mobile viewport behavior is usable for chat navigation, message interaction, and settings access without layout breakage.
- [ ] No horizontal overflow blocks primary interaction on common viewport sizes.

## Architecture Review Summary

**Review Date**: 2026-02-08  
**Status**: Approved with responsiveness clarifications

### Validated Assumptions

- Existing World and Agent settings editors can be reused inside a right-side panel.
- Current World page mode switching can be replaced by a split-layout panel model without backend changes.
- Side-by-side behavior is feasible using layout width allocation (not overlay positioning).
- Existing chat and chat-list interactions can remain active while settings panel is open.
- Responsive layout can be implemented within the current World page route and component boundaries.

### Architecture Options Considered

1. **Option A (Selected)**: Replace settings `viewMode` screens with persistent chat + right panel state.
   - Pros: Meets side-by-side requirement directly, minimal cognitive switching, lowest behavior risk.
   - Cons: Requires layout/state refactor in `WorldPage`.
2. **Option B**: Keep full-page settings views and add a second compact panel path.
   - Pros: Smaller immediate refactor.
   - Cons: Duplicated settings UX, inconsistent behavior paths, higher long-term maintenance cost.
3. **Option C**: Right drawer overlay.
   - Pros: Fast to implement.
   - Cons: Violates requirement that panel must not cover the main area.
4. **Option D**: Responsive adaptive layout (selected in combination with Option A).
   - Pros: Supports desktop/tablet side-by-side behavior and mobile usability.
   - Cons: Adds breakpoint/state complexity to layout logic.

### Decision Notes

- Chosen approach: **Option A + Option D**.
- Panel contains both settings sections with in-panel switching.
- Overlay/modal settings patterns are explicitly rejected.
- Known pre-existing gap in current page (`handleSaveWorld` TODO) is not introduced by this feature and must not regress from current behavior.
