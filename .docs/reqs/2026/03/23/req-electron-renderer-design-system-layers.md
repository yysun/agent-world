# Requirement: Electron Renderer Design System Layering

**Date**: 2026-03-23  
**Type**: Refactor / Architecture / Maintainability  
**Scope**: `electron/renderer/src/`  
**Status**: ✅ Completed

## Architecture Review (AR)

**Review Date**: 2026-03-23  
**Reviewer**: AI Assistant  
**Result**: ✅ Approved for planning with strict boundary guardrails

### Review Summary

The Electron renderer already has the raw ingredients of a design system, including shared theme tokens and several reusable UI pieces, but the current surface mixes generic base UI with product-specific workspace, chat, queue, settings, and editor components. Establishing a strict layered design-system core is feasible and appropriate, but only if the core is kept narrowly scoped and business UI is explicitly kept out of it.

### Validated Assumptions

- The renderer already has shared visual tokens and global styling rules that can serve as a Foundations layer.
- The renderer currently exposes a single mixed component surface that includes both generic and business-specific modules.
- The Electron renderer contains repeated layout and interaction structures that can benefit from a stable, reusable layering model.
- The requested layering is maintainability work and should preserve current renderer behavior rather than introduce a UI redesign.

### Guardrails

- The design-system core is limited to `Foundations`, `Primitives`, and `Patterns` only.
- Business-specific UI must remain outside the design-system core, even if it is reusable within the Electron app.
- Business-specific UI ownership should remain explicit and should preferably be organized by app-shell or feature/domain boundaries rather than a single undifferentiated UI bucket.
- Layer ownership must be explicit so contributors can tell whether a module belongs to the core or to feature/application UI.
- Dependency direction must remain one-way from more generic to more specific layers.

## Overview

Reorganize the Electron renderer UI into a strict design-system model with three internal layers:

- **Foundations**: design tokens and visual rules
- **Primitives**: atomic generic reusable base components such as buttons, cards, menu items, inputs, and similar UI building blocks
- **Patterns**: reusable composed structures

The design-system core must stop at those three layers. Business-specific renderer UI must consume the core but must not become part of it.

The requirement does not mandate one exact folder name for business-specific UI, but it does require that business UI ownership remain obvious. A flat `components/` directory may be used during incremental migration, but the preferred long-term direction is app-shell and feature/domain grouping.

## Goals

- Define a strict and durable design-system boundary for the Electron renderer.
- Separate visual rules, base building blocks, and composed reusable structures into distinct layers.
- Prevent business-specific renderer UI from drifting into the shared design-system core.
- Make ownership of shared UI modules clear to contributors.
- Preserve current renderer behavior while improving maintainability and reuse discipline.

## Definitions

- **Design-system core**: The set of shared renderer UI modules that belong to one of the three approved layers: Foundations, Primitives, or Patterns.
- **Business-specific UI**: UI that encodes renderer product concepts, workflows, or domain semantics such as chat, sessions, worlds, agents, skills, queues, settings, import/export flows, or editor-specific business behavior.
- **Feature/application UI organization**: The folder structure used for business-specific UI outside the design-system core, ideally grouped by app shell or feature/domain ownership rather than one mixed bucket of unrelated components.
- **Layer mixing**: A module simultaneously owning responsibilities from more than one layer, or depending on a more specific layer than its own.

## Functional Requirements

- **REQ-1**: The Electron renderer design-system core must be organized into exactly three layers: `Foundations`, `Primitives`, and `Patterns`.
- **REQ-2**: Every shared renderer UI module that belongs to the design-system core must have a single, unambiguous layer assignment.
- **REQ-3**: `Foundations` must contain only design tokens and product-agnostic visual rules, including theme variables, spacing scales, typography rules, color semantics, radii, elevation, motion rules, and other non-component visual primitives.
- **REQ-4**: `Foundations` must not contain product-specific copy, domain-specific state, renderer feature workflows, business-specific components, or feature-specific selectors/styles tied to chat, header, streaming, tool, world, agent, queue, skill, or settings behavior unless those styles are first generalized.
- **REQ-5**: `Primitives` must contain only atomic generic reusable base components built on Foundations, such as buttons, cards, menu items, inputs, labels, and similar UI building blocks.
- **REQ-6**: `Primitives` must be domain-agnostic and named by generic UI purpose rather than renderer business concepts, specialized status widgets, or workflow affordances.
- **REQ-7**: `Primitives` must not require business-specific props, data contracts, or state models tied to chat, world, agent, skill, queue, settings, or other renderer product concepts.
- **REQ-8**: `Patterns` must contain reusable composed structures built from Foundations and Primitives.
- **REQ-9**: `Patterns` may define repeated layout and interaction structures, but they must remain product-agnostic and must not embed renderer business workflows, persistence logic, or domain-specific concepts.
- **REQ-10**: The design-system core must not export or contain business-specific UI modules.
- **REQ-11**: Business-specific renderer UI must live outside the design-system core, even when it is reused across multiple Electron screens or flows.
- **REQ-11A**: Business-specific renderer UI should have explicit app-shell or feature/domain ownership; a temporary flat `components/` directory is acceptable during incremental migration, but it must not become the architectural model that hides domain boundaries.
- **REQ-12**: Business-specific UI may consume Foundations, Primitives, and Patterns, but the reverse dependency direction is forbidden.
- **REQ-13**: Dependency direction must be strictly one-way: Foundations may not depend on Primitives, Patterns, or business-specific UI; Primitives may depend only on Foundations; Patterns may depend only on Foundations and Primitives; business-specific UI may depend on any of the three core layers.
- **REQ-14**: A shared export surface must make layer ownership obvious and must not flatten all renderer UI into a single undifferentiated component barrel that hides the distinction between core layers and business UI.
- **REQ-15**: Reusable abstractions that encode renderer domain semantics, business labels, or workflow-specific behavior must be classified as business-specific UI rather than as Primitives or Patterns.
- **REQ-16**: Shared visual rules currently duplicated across renderer UI must be consolidated into Foundations during the migration.
- **REQ-17**: Generic reusable base components must expose generic composition-oriented APIs such as neutral naming, slots, or standard presentational props rather than feature-specific contracts.
- **REQ-18**: Reusable composed structures in Patterns must be usable by multiple renderer features without requiring chat-, world-, skill-, queue-, or settings-specific assumptions.
- **REQ-19**: The renderer codebase must include contributor-facing guidance that defines the three layers, allowed contents, forbidden contents, and the boundary between the design-system core and business-specific UI.
- **REQ-20**: The migration to the layered design system must preserve existing Electron renderer behavior and visual parity for feature UIs unless a separate approved requirement changes that behavior.
- **REQ-21**: The layering work must support incremental migration so existing renderer features can be moved without requiring a single all-at-once rewrite.
- **REQ-22**: Automated test coverage for the implementation must include targeted regression checks that protect layer boundaries, shared exports, and representative reusable core modules.
- **REQ-23**: This work must remain scoped to the Electron renderer and must not create a shared cross-app design-system module between the Electron app and the web app.
- **REQ-24**: A module must not be promoted into Primitives or Patterns while it still imports or defaults to business-specific UI; any such dependency must be removed, inverted via slots/props, or kept outside the design-system core until generalized.
- **REQ-25**: The migration may use temporary compatibility entry points during import rewiring, but those shims must not become the long-term ownership surface for the design-system core.
- **REQ-26**: Composite status indicators, settings-specific toggles, navigation affordances, timers, or similar specialized widgets do not qualify as `Primitives` unless they are first reduced to neutral atomic building blocks with generic naming and composition-oriented APIs.
- **REQ-27**: When a reusable UI element is better described by a concrete product role than by an atomic UI role, it must remain in business-specific UI or be classified as a higher layer only after it is generalized.
- **REQ-28**: Automated boundary/export tests and public design-system barrels must enforce the approved layer semantics and must not permanently codify transitional misclassifications such as specialized widgets being treated as primitives.

## Non-Functional Requirements

- **NFR-1 (Maintainability)**: A contributor must be able to determine whether new renderer UI belongs in Foundations, Primitives, Patterns, or business-specific UI without tracing large mixed files.
- **NFR-2 (Boundary Clarity)**: The design-system core must have stable, easy-to-understand ownership boundaries that discourage accidental feature creep.
- **NFR-3 (Reuse Quality)**: Shared renderer UI abstractions must be reusable because they are generic, not because business-specific assumptions were generalized after the fact.
- **NFR-4 (Behavior Safety)**: The layering migration must not regress existing renderer interactions, streaming-related UI behavior, or workspace layout behavior.
- **NFR-5 (Incremental Delivery)**: The change must be implementable in phases that allow targeted verification as modules move into their correct layers.
- **NFR-6 (Electron Scope Integrity)**: The layering model must respect the repo rule that Electron and web UI remain separate application boundaries.
- **NFR-7 (Business-UI Ownership Clarity)**: Contributors should be able to identify the owning app shell or feature/domain for business-specific renderer UI without relying on a large flat directory of unrelated components.

## Constraints

- The design-system core must stop at the three requested layers and must not absorb business UI.
- The work must preserve current Electron renderer functionality while reorganizing ownership and exports.
- The work must stay within existing repository boundaries and must not introduce a shared UI package across the Electron and web apps.
- Business-specific renderer modules may remain reusable within feature/application space, but they must not be labeled or exported as design-system core.

## Out of Scope

- A renderer visual redesign.
- Cross-app UI unification between Electron and web.
- Rewriting renderer business workflows unrelated to layer separation.
- Introducing business-specific “pattern” components into the design-system core.
- Changing application behavior solely to fit the new structure.

## Acceptance Criteria

- [x] The approved design-system core is defined as Foundations, Primitives, and Patterns only.
- [x] Each shared renderer UI module is assignable to exactly one of: Foundations, Primitives, Patterns, or business-specific UI.
- [x] Foundations contain only design tokens and visual rules.
- [x] Primitives contain only atomic generic reusable base components such as buttons, cards, menu items, inputs, and similar neutral UI building blocks.
- [x] Patterns contain only reusable composed structures that remain product-agnostic.
- [x] Business-specific renderer UI is kept outside the design-system core.
- [x] Dependency direction prevents more generic layers from importing more specific layers.
- [x] Shared exports make layer ownership obvious instead of hiding all modules behind one mixed surface.
- [x] Contributor guidance documents the layer model and the business-UI exclusion rule.
- [x] The documented target architecture makes clear that business-specific UI should evolve toward explicit app-shell or feature/domain ownership rather than a permanent flat component bucket.
- [x] Implementation can be executed incrementally without requiring a full renderer rewrite.
- [x] Feature UIs preserve current behavior during the migration.
- [x] Targeted automated tests exist for representative core modules and boundary regressions.
- [x] Foundations exclude feature-specific renderer selectors unless those selectors are first generalized.
- [x] No promoted Primitive or Pattern depends directly on business-specific UI.
- [x] Specialized status widgets, settings toggles, timers, and navigation affordances are not classified as Primitives unless they have been reduced to neutral atomic components.
- [x] Boundary/export tests and public barrels validate the approved atomic primitive model rather than preserving transitional specialized-widget exports.

## Completion Notes

- The design-system core now consists of a foundations layer (`tokens.css`, `globals.css`, `field-styles.ts`), atomic primitives (`Button`, `IconButton`, `Card`, `MenuItem`, `Input`, `Select`, `Textarea`, `Radio`, `Checkbox`, `Switch`), and generic patterns (`AppFrameLayout`, `BaseEditor`, `TextEditorDialog`, `LabeledField`, `PanelActionBar`).
- Business-specific renderer UI now lives under explicit app-shell and feature boundaries where that ownership is clear: `electron/renderer/src/app/shell/`, `features/chat/`, `features/queue/`, `features/settings/`, and `features/skills/`.
- The remaining `electron/renderer/src/components/` surface is now a narrowed compatibility area for unmigrated component-owned UI, not the architectural front door for renderer business UI.
- The stable renderer stylesheet entry remains `electron/renderer/src/styles.css`, but ownership is now split between foundations and `feature-styles.css`.
- Boundary/export tests and focused renderer regression tests were updated to enforce the approved layer semantics, feature/app-shell entry points, and the narrowed compatibility-barrel contract.

## Approval Gate

This story is complete. Implementation, focused verification, code review, and completion documentation are now recorded under the matching plan, test, and done docs.