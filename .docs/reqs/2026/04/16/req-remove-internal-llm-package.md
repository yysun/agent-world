# Requirement: Remove Internal LLM Workspace Package

**Date**: 2026-04-16  
**Type**: Repository Simplification / Dependency Boundary Change  
**Component**: root workspace, `packages/llm`, `core/` LLM runtime files, LLM-specific tests and showcase e2e coverage  
**Related**: `.docs/reqs/2026/03/28/req-llm-per-call-api.md`, `.docs/reqs/2026/03/28/req-llm-explicit-environment.md`, `.docs/reqs/2026/03/29/req-llm-host-agnostic-turn-loop.md`, `.docs/plans/2026/03/27/plan-llm-workspace-package.md`

## Overview

Remove the repository-owned `packages/llm` workspace and all repository surfaces whose only purpose is to build, export, validate, or showcase that internal package.

The repository must stop treating `@agent-world/llm` as a first-class workspace package and instead depend on the external npm package `llm-runtime`.

This migration is a full runtime ownership change, not a hybrid arrangement. Agent World must use `llm-runtime` as its LLM runtime boundary rather than keeping part of the previous repository-owned runtime in `core/`.

This change also removes LLM-package-specific tests, showcase e2e runners, and core-side compatibility code that exists only to support the deleted internal package boundary.

The change must preserve Agent World's host application behavior that still requires model execution. Removing the internal package must not leave `core/`, `cli/`, `server/`, or Electron in a state where normal agent turns can no longer run.

## Problem Statement

The repository currently carries two overlapping LLM-related surfaces:

- a dedicated internal workspace package in `packages/llm`
- a separate set of direct LLM runtime files in `core/`

That duplication increases maintenance cost and keeps a large amount of package-specific test and e2e coverage in the repo even though the requested direction is to stop owning the package here and use `llm-runtime` instead.

The repo also still includes root-level package exports, workspace wiring, Electron file dependencies, TypeScript path mapping, and test coverage that explicitly assert the existence of `@agent-world/llm` inside this monorepo.

## Goals

- Remove the internal `packages/llm` workspace from the monorepo.
- Replace repository-owned package wiring with an external `llm-runtime` npm dependency.
- Remove tests and e2e showcase coverage whose purpose is validating the deleted internal package.
- Remove `core/` code and tests whose only purpose is the deleted internal package boundary or duplicated LLM implementation.
- Require `llm-runtime` to own the actual model/runtime/provider/tool execution path end to end.
- Consolidate tool-call error handling and retry behavior so `llm-runtime` is the single recovery authority.
- Preserve normal Agent World runtime behavior for model-backed agent execution after the package removal.

## Non-Goals

- Removing LLM capability from Agent World entirely.
- Redesigning unrelated chat, queue, restore, SSE, HITL, or UI behavior.
- Reworking provider configuration UX beyond what is necessary to stop depending on the internal package.
- Deleting historical documentation that merely references prior LLM work unless it becomes actively misleading or breaks validation.

## Functional Requirements

### REQ-1: Remove Internal Workspace Package Ownership

- The root workspace **MUST NOT** keep `packages/llm` as a declared workspace.
- The root package **MUST NOT** export `./llm` from the repository package entrypoints.
- Repository install, build, and check scripts **MUST NOT** depend on building or checking `packages/llm`.
- Monorepo metadata and lockfiles **MUST** reflect that `packages/llm` is no longer an owned workspace package.

### REQ-2: Adopt External `llm-runtime` Dependency

- The repository **MUST** install and use the npm package `llm-runtime`.
- Any package manifest currently depending on the internal workspace package **MUST** stop depending on `@agent-world/llm` from `file:../packages/llm` or equivalent local-workspace wiring.
- The new dependency boundary **MUST** be expressed through standard npm dependency resolution rather than a workspace-local package path.

### REQ-3: Remove Package-Specific Test Surface

- The repository **MUST** remove dedicated `tests/llm/**` coverage that exists to validate the internal `packages/llm` package surface.
- The repository **MUST** remove LLM-package-specific showcase or package-resolution tests that assert the existence of the internal workspace package.
- The root npm scripts **MUST NOT** keep `test:llm`, `test:llm-showcase`, or `test:llm-turn-loop-showcase` commands once those tests are removed.

### REQ-4: Remove LLM Package E2E Showcase Coverage

- The repository **MUST** remove e2e or showcase runners whose purpose is demonstrating or validating the internal package as a publishable standalone package.
- Support fixtures used only by those removed showcase runners **MUST** also be removed.
- Remaining e2e coverage **MUST** focus on Agent World product behavior rather than package-marketing or package-boundary demonstrations.

### REQ-5: Remove Core-Side LLM Package Compatibility and Duplicate Runtime Code

- `core/` **MUST NOT** keep compatibility files, adapters, or tests whose purpose is supporting the deleted internal `packages/llm` boundary.
- `core/` **MUST NOT** retain repository-owned LLM runtime modules for provider execution, model dispatch, tool runtime ownership, MCP runtime ownership, or package-style runtime orchestration once `llm-runtime` replaces them.
- Files such as `core/llm-config.ts`, `core/llm-manager.ts`, and direct provider runtime modules **MUST** be removed or reduced to thin host-side integration shims that delegate runtime execution to `llm-runtime`.
- Any remaining `core/` code in this area **MUST NOT** duplicate runtime behavior already owned by `llm-runtime`; it may only translate Agent World host state and events into the external runtime contract.

### REQ-6: Preserve Agent World Runtime Behavior

- Agent World **MUST** continue to support normal model-backed agent execution after the internal package removal.
- Existing product paths in `core/`, `cli/`, `server/`, and Electron **MUST NOT** be left without a working LLM execution path.
- That working LLM execution path **MUST** go through `llm-runtime` rather than a split execution model shared between `llm-runtime` and repository-owned legacy runtime code.
- Tool execution, continuation, and host-owned event semantics **MUST** remain aligned with existing Agent World contracts unless a separate approved requirement changes them.

### REQ-7: Consolidate Tool-Call Error Handling and Retry Ownership In `llm-runtime`

- `llm-runtime` **MUST** be the single owner of tool-call error classification, recoverable validation handling, malformed tool-call fallback behavior, and bounded retry policy for runtime tool execution.
- `core/` **MUST NOT** keep a second implementation of tool-call recovery rules once `llm-runtime` owns the runtime path.
- Core-side logic for malformed tool calls, validation retry suppression, plain-text tool-intent fallback, or post-tool retry loops **MUST** be removed or reduced to host-event translation only when the same behavior is already implemented in `llm-runtime`.
- Retry semantics for runtime-owned tool execution, including MCP execution retry and tool-call correction loops, **MUST** be configured and enforced through `llm-runtime` rather than duplicated in repository-owned runtime modules.
- Agent World may still publish user-facing events or persist artifacts derived from tool failures, but it **MUST NOT** independently decide whether a tool failure is retriable, how many retries are allowed, or how the model should be re-prompted when `llm-runtime` already owns that policy.

### REQ-8: Remove Package-Boundary Assertions From Tooling

- TypeScript path mapping or repository tests that explicitly assert `@agent-world/llm` resolves to `packages/llm` **MUST** be removed or updated.
- Electron-specific dependency wiring that points to the local `packages/llm` folder **MUST** be removed.
- Root and package metadata **MUST NOT** imply that this repository publishes or ships `@agent-world/llm` from local source.

### REQ-9: Documentation and Script Consistency

- Repository docs and commands that instruct maintainers to build or test the internal `packages/llm` workspace **MUST** be removed or updated when they are part of the active developer workflow.
- Developer-facing scripts and validation flows **MUST** describe the new external `llm-runtime` dependency boundary consistently.

## Non-Functional Requirements

### Simplicity

- The repository **SHOULD** have one clear LLM runtime dependency boundary instead of an internal package plus duplicated core runtime ownership.
- Developer workflows **SHOULD** no longer include separate internal-package showcase commands.

### Maintainability

- LLM-related code left in `core/` **SHOULD** be limited to Agent World-specific orchestration and host integration only.
- Tool-call retry and recovery policy **SHOULD** exist in one place only, under `llm-runtime`.
- The repo **SHOULD** avoid keeping tests whose only value is asserting a package boundary that no longer exists.

### Reliability

- Replacing the internal package with `llm-runtime` **MUST NOT** break existing turn execution, tool continuation, or provider dispatch in normal product paths.
- Full `llm-runtime` adoption **MUST NOT** leave hidden fallback execution paths in repo-owned runtime modules that can diverge from the external package.
- Consolidating tool-call retry/error handling **MUST NOT** produce conflicting retry loops or duplicate failure artifacts across `core/` and `llm-runtime`.
- Removal work **MUST** leave build, typecheck, and targeted runtime tests in a passing state.

## Scope

### In Scope

- Root workspace and package manifest changes required to remove `packages/llm`
- Installing and wiring `llm-runtime`
- Removing internal-package unit tests, showcase tests, and package-boundary checks
- Removing LLM-package-related e2e showcase files
- Removing duplicated or compatibility-only LLM files and tests from `core/`
- Moving tool-call error handling and retry ownership from `core/` into `llm-runtime`

### Out of Scope

- Broad product redesign around agent configuration or provider UX
- Schema-level removal of world or agent LLM configuration fields unless separately required
- Replacing unrelated docs that only mention historical LLM work in archived done/req/plan records

## Acceptance Criteria

- [ ] `packages/llm` is no longer a root workspace package.
- [ ] The root package no longer exports `./llm` from local workspace output.
- [ ] The repo depends on `llm-runtime` through npm package wiring.
- [ ] Electron and any other package manifests no longer point at `file:../packages/llm` or equivalent local package wiring.
- [ ] `tests/llm/**` and other internal-package-specific tests are removed.
- [ ] LLM showcase e2e runners and their support fixtures are removed.
- [ ] Package-boundary assertions such as `@agent-world/llm` path mapping tests are removed or updated.
- [ ] `core/` no longer contains repository-owned LLM runtime execution code except for thin host-side integration that delegates to `llm-runtime`.
- [ ] Normal Agent World LLM-backed execution still has a functioning runtime path through the new boundary.
- [ ] That runtime path is fully owned by `llm-runtime` rather than split with legacy repository runtime modules.
- [ ] Tool-call validation recovery, malformed-call handling, and retry policy are owned by `llm-runtime` rather than duplicated in `core/`.
- [ ] `core/` only translates runtime failures into Agent World persistence and event side effects; it does not independently run a second tool-call retry policy.
- [ ] Build, typecheck, and targeted test flows no longer reference the deleted internal package.

## User Stories

### Story 1: Repository maintainer

**As a** repository maintainer  
**I want** to stop owning `packages/llm` in this monorepo  
**So that** the repo has one simpler runtime boundary and less package-specific maintenance.

### Story 2: Product maintainer

**As an** Agent World maintainer  
**I want** Agent World to keep working after the package removal  
**So that** dependency-boundary cleanup does not break the product.

### Story 3: Test maintainer

**As a** test maintainer  
**I want** LLM-package showcase and package-boundary tests removed  
**So that** the remaining test suite validates product behavior instead of a deleted internal package.

### Story 4: Runtime maintainer

**As a** runtime maintainer  
**I want** tool-call recovery and retry policy to live only in `llm-runtime`  
**So that** Agent World does not carry conflicting recovery logic across two runtime layers.

## Open Questions

1. Whether any current web or Electron tests depend indirectly on the internal-package showcase fixtures and therefore need replacement coverage rather than pure deletion.
2. Whether active developer docs outside `.docs/done/**` should be updated in the same change set or only when they block the new workflow.