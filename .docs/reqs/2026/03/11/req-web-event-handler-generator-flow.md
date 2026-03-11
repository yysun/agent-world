# Requirement: Web Event Handler Generator Flow

**Date**: 2026-03-11  
**Type**: Refactor  
**Component**: `web` AppRun event/update flow  
**Related**: World page event handlers, chat/session lifecycle, SSE-driven state updates

## Overview

Refactor the web app's AppRun update flow so event handlers do not dispatch other AppRun events with `app.run(...)` as part of their internal control flow.

The web app must preserve existing user-visible behavior while making multi-step state transitions explicit within the owning handler flow.

## Goals

- Remove handler-to-handler dispatching via `app.run(...)` from web event handlers.
- Preserve existing chat, world, SSE, HITL, and session behavior.
- Keep multi-step UI transitions deterministic and easier to reason about.
- Align AppRun state management with generator-driven progressive state updates where appropriate.

## Functional Requirements

### REQ-1: No Internal Handler Chaining via `app.run`

- Web AppRun event handlers **MUST NOT** call `app.run(...)` to invoke other AppRun event handlers as part of normal control flow.
- Equivalent multi-step behavior **MUST** remain available through direct handler-local flow composition.

### REQ-2: Preserve Send Message Behavior

- Sending a chat message **MUST** continue to support:
  - composer validation
  - optimistic user-message insertion
  - active-chat validation
  - SSE request startup
  - send error handling
- Keyboard-triggered send and button-triggered send **MUST** remain behaviorally consistent.

### REQ-3: Preserve World Initialization and Refresh Semantics

- World initialization, chat switching, and refresh-triggered hydration **MUST** continue to:
  - load the selected world
  - resolve the active chat correctly
  - rebuild the visible chat transcript from persisted memory
  - preserve active-chat scoping rules
  - preserve pending HITL reconstruction behavior

### REQ-4: Preserve Chat Session Lifecycle Behavior

- Creating, loading, and deleting chats **MUST** continue to produce the same user-visible outcomes as before.
- Chat lifecycle flows **MUST** preserve loading and error states.
- Route changes and selected-chat updates **MUST** remain consistent with the hydrated world state.

### REQ-5: Preserve SSE and Event Contract Behavior

- SSE stream lifecycle ordering and payload handling **MUST** remain unchanged.
- Existing message, tool, system, and world activity event semantics **MUST** remain compatible with current web rendering behavior.
- Refactoring event-handler composition **MUST NOT** alter transport payload shape or event ordering guarantees.

### REQ-6: Preserve HITL and Recovery Semantics

- Pending HITL prompts **MUST** remain scoped to the active chat and survive refresh/reload flows as they do now.
- Recovery paths that reconstruct pending HITL state from persisted messages **MUST** remain intact.

## Non-Functional Requirements

### Maintainability

- Multi-step state transitions **SHOULD** be owned by a single handler flow whenever practical.
- Shared behavior between trigger sources **SHOULD** be expressed through reusable local flow helpers rather than indirect event dispatch.

### Testability

- Refactored flows **MUST** remain testable at the unit boundary.
- Progressive state transitions **SHOULD** be observable through yielded states where AppRun supports async generators.

## Scope

### In Scope

- `web/src/pages/World.update.ts`
- Related web-side helpers used to compose message send/init/chat lifecycle flows
- Removal of handler-to-handler `app.run(...)` usage from web AppRun event handlers

### Out of Scope

- SSE transport redesign
- Route framework replacement
- Non-web runtimes
- Scheduler callbacks or external asynchronous sources unless required by the refactor

## Acceptance Criteria

- [ ] No AppRun update handler in the scoped web flow uses `app.run(...)` to invoke another AppRun update handler.
- [ ] Message send still behaves the same from both keyboard and click triggers.
- [ ] Chat creation, chat loading, and chat deletion still preserve loading/error behavior and route consistency.
- [ ] World refresh flows still preserve transcript hydration and active-chat/HITL scoping.
- [ ] SSE/tool/system/world event handling behavior is unchanged at the contract boundary.
