# Requirement: Web AppRun Layered View Architecture and Feature-Sliced Updates

**Date**: 2026-03-23  
**Type**: Refactor / Maintainability  
**Status**: ✅ Requirements Reviewed (AR Completed)

## Architecture Review (AR)

**Review Date**: 2026-03-23  
**Reviewer**: AI Assistant  
**Result**: ✅ APPROVED WITH GUARDRAILS

### Review Summary

The request is feasible and aligned with the existing web app direction. The current AppRun web client already separates route pages, reusable components, domain logic, typed events, and a large world update module. A controlled refactor can introduce clearer view-layer ownership and feature-sliced update structure without changing the underlying AppRun model-view-update behavior.

### Validated Assumptions

- The web app is AppRun-based and must continue to use AppRun page components, typed event names, and update maps as the source of truth for UI state transitions.
- The current web app already has distinct route entry points under `web/src/pages`, reusable UI under `web/src/components`, domain helpers under `web/src/domain`, and typed world event definitions under `web/src/types/events.ts`.
- `web/src/pages/World.update.ts` currently centralizes many distinct concerns that can be split by feature ownership while preserving existing event names and flow behavior.
- Existing tests and callers currently import the World update surface from `web/src/pages/World.update.ts`, so migration must preserve or explicitly coordinate that public import path.
- `web/src/pages/World.tsx` still owns additional route-local UI handlers (for example right-panel and modal open/close behavior), so update ownership work is not complete unless those handlers also receive explicit placement.
- The existing rules for AppRun generator composition, chat scoping, SSE lifecycle ordering, and handler ownership remain mandatory constraints for the refactor.

### Options Considered

1. **Option A: Incremental layered refactor with feature-sliced update extraction (Recommended)**
2. **Option B: Full rewrite of web structure in one pass**
3. **Option C: Keep current structure and only add comments/folders without real ownership changes**

### AR Decision

- Proceed with **Option A**.
- Treat AppRun architectural rules and current runtime behavior as non-negotiable invariants.
- Scope the refactor around view ownership, update ownership, and import boundaries rather than user-visible feature changes.
- Require regression-focused tests for the new module boundaries and update composition behavior.

## Overview

Refactor the web app into a clearer layered view architecture with explicit ownership for foundations, primitives, patterns, features, pages, and app shell, and split the World page update logic into feature-based modules while preserving the current AppRun architecture, typed event model, and runtime behavior.

## Goals

- Introduce a clear layered structure for web view code that improves discoverability and ownership.
- Separate generic visual building blocks from feature-specific UI.
- Keep route entry points thin and focused on page assembly.
- Break the large World update module into smaller feature-owned update modules.
- Preserve existing AppRun state ownership, async generator composition, and typed event contracts.
- Improve maintainability without introducing user-visible behavior regressions.

## Functional Requirements

- **REQ-1**: The web app must define explicit view-layer ownership for app shell, pages, features, patterns, primitives, and foundations within `web/src`.
- **REQ-2**: App shell code must own top-level app composition concerns such as route mounting, layout shell composition, and app-wide entry wiring.
- **REQ-3**: Page modules must remain the route-level entry points and must primarily assemble feature modules and shared view layers rather than owning large generic UI implementations.
- **REQ-4**: Feature modules must own business-specific UI, AppRun update handlers, and view orchestration for a bounded domain such as world chat, world history, settings, or home flows.
- **REQ-5**: Pattern modules must own reusable composed view structures that can be shared across multiple screens or features without embedding business-specific state transitions.
- **REQ-6**: Primitive modules must own small reusable visual controls and shells that are generic, presentation-focused, and free of feature-specific business logic.
- **REQ-7**: Foundation modules must own shared design tokens, global CSS variables, base control styling, and other low-level view rules with no feature-specific behavior.
- **REQ-8**: Existing reusable view code under the current web component area must be reorganized into the new ownership structure where appropriate, without changing the intended user-facing behavior.
- **REQ-9**: The World page update system must be decomposed into multiple feature-based update modules rather than remaining in one monolithic update file.
- **REQ-10**: Feature-based update modules must preserve the current typed world event contract and continue to compose into a single update surface for the World page.
- **REQ-11**: Shared multi-step AppRun flows used by multiple handlers must remain composable through direct helper/generator composition rather than handler-to-handler event chaining.
- **REQ-12**: The refactor must preserve current chat send, stop, streaming, HITL, refresh, message edit, message delete, chat history, and dashboard behaviors.
- **REQ-13**: The refactor must preserve current right-panel, mobile/tablet responsive behavior, and world page viewport handling.
- **REQ-14**: The refactor must preserve the current AppRun typed event names and payload expectations unless a coordinated, fully updated event contract change is intentionally made.
- **REQ-15**: The refactor must keep route-level World page logic compatible with the existing AppRun component structure and existing route registration.
- **REQ-16**: Any new barrel/composition modules introduced for view or update layers must provide stable, obvious import paths for future development.
- **REQ-17**: The resulting web structure must make it clear where new generic visual code belongs versus where new feature-specific AppRun logic belongs.
- **REQ-18**: The refactor must update or add targeted automated tests that validate the new module boundaries or update composition behavior at the public unit boundary.
- **REQ-19**: The refactor must preserve the current public World update import surface (`web/src/pages/World.update.ts`) through a compatibility facade or coordinated call-site migration so existing tests and callers do not break unintentionally.
- **REQ-20**: World route-local UI handlers that currently live in `pages/World.tsx` must be given explicit ownership in the new structure (feature-owned or route-ui-owned) rather than remaining as an uncategorized residue in the route page.

## Non-Functional Requirements

- **NFR-1 (Behavior Safety)**: No user-visible behavior regressions in the web app’s route rendering, world interactions, or chat flows.
- **NFR-2 (AppRun Integrity)**: AppRun remains the authoritative architecture for state updates, event handling, and async generator-driven transitions.
- **NFR-3 (Maintainability)**: A contributor must be able to identify the correct placement for new web UI and update logic without relying on large monolithic files.
- **NFR-4 (Import Clarity)**: Module boundaries and dependency direction must be understandable and consistent.
- **NFR-5 (Incremental Refactorability)**: The work must support incremental extraction and verification rather than requiring a risky all-at-once rewrite.
- **NFR-6 (Test Reliability)**: New or updated unit tests must remain deterministic and must not depend on live backends, real filesystems, or non-deterministic timing.

## Constraints

- Must continue to follow the existing web AppRun rules documented for `web/src`.
- Must preserve typed AppRun event usage through `web/src/types/events.ts` or its direct successor structure.
- Must not replace AppRun with another framework or state-management pattern.
- Must not move web code into Electron-specific folders or create cross-app shared UI layers between web and Electron.
- Must preserve current SSE lifecycle ordering and chat-scoped event behavior.
- Must preserve current async generator composition rules for multi-step state transitions.
- Must avoid introducing handler-to-handler `app.run(...)` chaining as a replacement for local flow composition.
- New extracted modules should use function-based exports and helpers; the refactor must not introduce new class-based layers beyond the existing AppRun route component compatibility surface.
- Must keep the refactor focused on web view architecture and web update structure rather than unrelated product changes.

## Out of Scope

- A visual redesign of the web app.
- Backend API changes unrelated to preserving current web behavior.
- Replacing AppRun page components with a different component model.
- Cross-client unification of web and Electron design-system code.
- New end-user features unrelated to the structural refactor.

## Acceptance Criteria

- [ ] The web app has an explicit layered view structure covering app shell, pages, features, patterns, primitives, and foundations.
- [ ] Route-level page files are thinner and primarily assemble feature and shared view modules.
- [ ] Generic reusable visual building blocks are separated from feature-specific UI ownership.
- [ ] `World.update` responsibilities are split into smaller feature-based update modules with clear ownership.
- [ ] World update modules still compose into a stable AppRun update map for the page.
- [ ] Current typed event behavior remains valid for the World page after the refactor.
- [ ] Existing chat, streaming, HITL, edit/delete, dashboard, and chat-history flows continue to behave correctly.
- [ ] Existing responsive world-page behavior continues to work after the refactor.
- [ ] Existing test and caller imports of `web/src/pages/World.update.ts` remain valid or are intentionally migrated within the same change set.
- [ ] World page route-local UI handlers are explicitly placed in the new ownership model instead of being left behind in an oversized page file.
- [ ] Targeted automated tests cover the new structure or critical preserved behavior at the appropriate unit boundary.
- [ ] The resulting folder and import structure makes future placement of view code and update code substantially clearer.