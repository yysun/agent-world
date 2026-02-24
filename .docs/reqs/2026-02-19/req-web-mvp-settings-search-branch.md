# Requirement: Web MVP parity for settings, chat search, and chat branching

**Date**: 2026-02-19  
**Type**: Feature Enhancement  
**Priority**: High

## Overview

Define the minimum web-app feature set needed to deliver MVP parity for three specific capabilities:
1. Enable the web `Settings` route/page.
2. Add chat-session search in web chat history.
3. Add branch-from-message support in web chat.

## Goals

- Deliver a usable MVP with only the requested scope (1+2+3).
- Keep existing web chat/world behavior intact while adding the new capabilities.
- Align user-visible behavior with established desktop semantics where applicable.

## Functional Requirements

### REQ-1: Settings route must be accessible in web app
**Status**: Required  
**Description**: The web application must expose and navigate to a `Settings` page through its route registration.

**Acceptance Criteria**:
- [ ] A web route for `Settings` is registered and reachable.
- [ ] Navigating to the route renders the settings page content.
- [ ] Existing `Home` and `World` routes continue to work unchanged.

### REQ-2: Chat-session search in web chat history
**Status**: Required  
**Description**: Users must be able to filter chat history entries by search text in the web UI.

**Acceptance Criteria**:
- [ ] Chat history UI includes a search input.
- [ ] Search filters session list by chat title/name using case-insensitive matching.
- [ ] Empty search restores the full list.
- [ ] Search does not break chat select, new chat, or delete actions.

### REQ-3: Branch chat from eligible message in web chat
**Status**: Required  
**Description**: Users must be able to create a branched chat timeline from an eligible agent message in the web app.

**Acceptance Criteria**:
- [ ] Eligible message UI includes a branch action.
- [ ] Branch action creates a new chat session in the same world.
- [ ] New branch includes source-chat history up to and including the selected message.
- [ ] Messages after the selected message are excluded from the new branch.
- [ ] On success, the newly created branch chat becomes active in the UI.
- [ ] On failure, current chat remains active and user receives error feedback.

## Non-Functional Requirements

- Scope must remain limited to these three MVP items.
- No regressions to existing web message send/stop/edit/delete flows.
- New behavior must remain deterministic per world/chat context.
- Existing typed-event safety in web event handling must be preserved.

## Constraints

- Web app only (no Electron, CLI, or server-only UX changes beyond existing API usage).
- MVP excludes broader desktop parity items not listed in 1+2+3.
- Requirement defines WHAT only; implementation details are out of scope for this document.

## Out of Scope

- Workspace/folder management UI parity.
- Full system-settings parity (theme/storage/skill toggles) beyond route accessibility requirement.
- World import/export parity work not explicitly requested in this MVP.
