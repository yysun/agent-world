# Requirement: Electron App Modular Structure and Test Reorganization

**Date**: 2026-02-12  
**Type**: Refactor / Maintainability  
**Status**: ✅ Requirements Reviewed (AR Completed)

## Architecture Review (AR)

**Review Date**: 2026-02-12  
**Reviewer**: AI Assistant  
**Result**: ✅ APPROVED WITH GUARDRAILS

### Review Summary

The request is feasible and timely: the Electron renderer currently includes a large app surface alongside separate state and UI modules, and Electron-focused tests already exist but are minimally scoped. A controlled modular refactor with explicit regression guardrails can improve maintainability without changing user-visible behavior.

### Validated Assumptions

- The Electron app currently runs through `electron/main.js`, `electron/preload.js`, and renderer code under `electron/renderer/src`.
- Existing renderer logic already has separable state concerns (for example streaming and activity state files) and UI concerns (component files), indicating good modularization potential.
- Test infrastructure already includes Electron-specific tests under `tests/electron` and broader project tests under `tests/*`, so test reorganization can be done without introducing a new test framework.

### Options Considered

1. **Option A: Incremental module extraction with behavior lock (Recommended)**
2. **Option B: Full rewrite into a new structure in one pass**
3. **Option C: Keep current structure and only add comments/tests**

### AR Decision

- Proceed with **Option A**.
- Treat runtime behavior parity and regression safety as first-order requirements.
- Require test reorganization to improve discoverability while preserving full test execution and confidence.

## Overview

Refactor the Electron app into a clearer modular structure, convert Electron `main` and `preload` code to TypeScript, and reorganize the related tests so the codebase is easier to understand, maintain, and extend, while preserving existing behavior and avoiding regressions.

## Goals

- Improve module boundaries and ownership in Electron main, preload, and renderer code.
- Convert Electron main-process and preload entry code to TypeScript with equivalent runtime behavior.
- Reduce coupling in renderer app logic by separating state, orchestration, and presentation concerns.
- Reorganize Electron-related tests into a consistent, discoverable structure.
- Preserve current functionality, UX behavior, and integration contracts.

## Functional Requirements

- **REQ-1**: The Electron app must maintain all existing user-visible behavior after refactoring, including chat flows, streaming display, activity indicators, and tool-call display behavior.
- **REQ-2**: Main-process responsibilities must be organized into clearly separated modules by concern (for example: app lifecycle, window management, IPC wiring, and backend integration boundaries).
- **REQ-3**: Electron main-process source must be migrated from JavaScript to TypeScript while preserving runtime behavior, process lifecycle behavior, and IPC behavior.
- **REQ-4**: Preload source must be migrated from JavaScript to TypeScript while preserving bridge behavior and renderer API compatibility.
- **REQ-5**: Preload responsibilities must be organized into clearly separated modules for bridge exposure, channel validation, and typed IPC surface definitions.
- **REQ-6**: Renderer responsibilities must be organized into clearly separated modules for domain/state logic, UI components, and app composition.
- **REQ-7**: Shared utility logic used across Electron layers must be placed in explicit shared modules with stable import paths.
- **REQ-8**: Public interfaces between modules must be explicit and stable so downstream callers are not coupled to internal implementation details.
- **REQ-9**: Existing configuration and startup behavior must remain compatible with current project scripts and packaging assumptions.
- **REQ-10**: Electron-related tests must be reorganized into a clear structure aligned to module responsibilities (for example by layer and feature), without reducing coverage of existing behavior.
- **REQ-11**: Test names and file locations must make intent clear so contributors can quickly locate tests for renderer state, UI behavior, preload bridge behavior, and main-process orchestration.
- **REQ-12**: The reorganized test suite must remain runnable through existing test commands and CI expectations.
- **REQ-13**: Refactor work must include regression-focused tests for critical user flows that could break during modularization (stream lifecycle, activity lifecycle, message rendering, and IPC-triggered updates).
- **REQ-14**: Any removed or relocated tests must preserve equivalent assertions and failure detection capability.
- **REQ-15**: TypeScript typing for Electron IPC channels exposed through preload must define stable request/response shapes and detect contract drift at compile time.
- **REQ-16**: Build/start workflows must support executing Electron with TypeScript-based main/preload sources without changing user-facing startup commands.

## Non-Functional Requirements

- **NFR-1 (Behavior Safety)**: No functional regressions in Electron app behavior.
- **NFR-2 (Maintainability)**: Module ownership and boundaries must be understandable by a new contributor without tracing large monolithic files.
- **NFR-3 (Test Reliability)**: Reorganized tests must remain deterministic and not depend on file-system or external service side effects for unit-level checks.
- **NFR-4 (Developer Experience)**: Engineers must be able to identify where to place new Electron code and corresponding tests with minimal ambiguity.
- **NFR-5 (Incremental Delivery)**: Refactor scope must support incremental verification so regressions can be detected early.
- **NFR-6 (Type Safety)**: Main/preload compile-time type checks must reduce unsafe IPC usage and improve maintainability.

## Constraints

- Must not break existing app behavior or expected UX interactions.
- Must preserve compatibility with the current Electron runtime/tooling in the repository.
- Must keep existing project-level testing toolchain and conventions.
- Must not require changes to unrelated monorepo packages unless needed to preserve compatibility.
- Must keep `main`/`preload` runtime loading behavior compatible with packaged and local development flows.

## Out of Scope

- New Electron features unrelated to modularization/test organization.
- Visual redesign of the Electron UI.
- Replacing the current test framework.
- Large architecture migrations outside Electron scope (CLI/server/core/web except required interface compatibility).

## Acceptance Criteria

- [ ] Electron app launches and runs with behavior parity for existing core user flows.
- [ ] Module boundaries for main, preload, and renderer code are clearly defined and reflected in file organization.
- [ ] Electron `main` and `preload` are authored in TypeScript and run with parity to previous JavaScript behavior.
- [ ] Renderer app logic is split into smaller responsibility-focused modules with clear composition points.
- [ ] Existing Electron-focused tests are reorganized into a coherent structure with preserved or improved assertion coverage.
- [ ] Test execution via existing commands remains successful for affected suites.
- [ ] Critical regression scenarios around streaming, activity state, and UI updates are covered by automated tests.
- [ ] No regressions are introduced in IPC-based interactions between renderer, preload, and main processes.
- [ ] Typed preload IPC contracts are in place and consumed consistently by renderer and main-process handlers.
