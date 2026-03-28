# Requirement: LLM Package Explicit Environment and Dependency Injection

**Date**: 2026-03-28  
**Type**: Architecture / Runtime Purity  
**Component**: `packages/llm` public API, internal state management, MCP/skill/tool dependencies  
**Related**: [req-llm-per-call-api.md](/Users/esun/Documents/Projects/agent-world/.docs/reqs/2026/03/28/req-llm-per-call-api.md), `packages/llm/src/runtime.ts`, `packages/llm/src/mcp.ts`, `packages/llm/src/skills.ts`

## Overview

Evolve `@agent-world/llm` from a per-call API with hidden internal runtime state into a design that supports explicit environment and dependency injection.

The package should reduce hidden mutable internal state by making MCP access, skill access, provider configuration access, and other environment-sensitive capabilities explicit dependencies at the call boundary or through an explicitly injected environment object.

The goal is not strict mathematical purity. The goal is to make orchestration behavior more explicit, more testable, and easier to reason about by separating orchestration logic from environment-bound side effects and caches.

## Goals

- Reduce hidden mutable internal state inside `@agent-world/llm`.
- Make MCP, skill, provider, and built-in tool dependencies explicit to advanced consumers.
- Preserve simple per-call usage for common cases where possible.
- Improve testability, isolation, and reasoning about configuration-dependent behavior.
- Allow package consumers to control lifecycle and reuse when needed without relying on undocumented internal caches.

## Functional Requirements

### REQ-1: Explicit Environment Support

- The package **MUST** support an explicit environment or dependency injection model for `generate(...)` and `stream(...)`.
- The injected environment **MUST** be able to supply provider access, MCP access, skill access, and tool-related dependencies required by the package runtime.
- The package **MUST** be able to run using the explicit environment without requiring hidden internal cache creation for those injected capabilities.

### REQ-2: Separation of Orchestration and Environment

- The package **MUST** separate LLM orchestration behavior from environment-bound side effects.
- Orchestration logic **MUST** be able to operate against explicit provider/tool/MCP/skill dependencies rather than always constructing them internally.
- Environment-sensitive operations such as MCP client reuse, filesystem-backed skill lookup, and built-in tool execution dependencies **MUST** be representable as explicit injected services or adapters.

### REQ-3: Optional Simpler Default Path

- The package **MAY** retain a simple per-call convenience path that internally constructs or reuses dependencies.
- If such a convenience path remains, the package **MUST** clearly distinguish it from the explicit environment path.
- The convenience path **MUST NOT** be the only way to use the package.

### REQ-4: MCP Dependency Control

- MCP access **MUST** be injectable explicitly, either as a registry-like dependency, an MCP resolver, or an equivalent environment contract.
- Consumers **MUST** be able to control MCP lifecycle and reuse without depending on hidden package-global or module-global caches.
- MCP tool discovery and execution behavior **MUST** remain compatible with current package tool resolution behavior.

### REQ-5: Skill Dependency Control

- Skill access **MUST** be injectable explicitly, either as a skill registry, skill loader, or equivalent environment contract.
- Consumers **MUST** be able to control skill-root lifecycle and refresh behavior without relying solely on hidden internal state.
- Skill listing and `load_skill` behavior **MUST** remain compatible with current package semantics.

### REQ-6: Provider Dependency Control

- Provider configuration and provider client access **MUST** be injectable explicitly.
- Consumers **MUST** be able to control provider lifecycle, reuse, and configuration scope without depending only on hidden package-managed caches.
- The package **MUST** still support current provider families and normalized request/response behavior.

### REQ-7: Tool Dependency Control

- Built-in tools **MUST** remain package-owned in definition and validation behavior.
- Dependencies required by built-in tools **MUST** be representable explicitly through the environment contract where appropriate.
- Extra tools **MUST** remain additive-only and **MUST NOT** override reserved built-in names.

### REQ-8: Testability and Isolation

- The explicit environment path **MUST** allow deterministic tests without relying on hidden mutable package state.
- Equivalent calls with explicitly different environments **MUST NOT** leak state across each other through package internals.
- Package test strategy **MUST** be able to exercise orchestration logic separately from environment adapters.

### REQ-9: Compatibility and Migration

- The package **MUST** allow an incremental migration from the current per-call API with internal caches to the explicit-environment model.
- Existing `generate(...)` and `stream(...)` usage **MUST** remain behaviorally compatible unless explicitly deprecated in a later approved change.
- Migration **MUST** allow `core/` and other consumers to adopt explicit environments gradually.

## Non-Functional Requirements

### Clarity

- The package **SHOULD** make it clear which behavior comes from orchestration and which behavior comes from environment adapters.
- The package **SHOULD** reduce hidden state assumptions in its main runtime path.

### Maintainability

- The design **SHOULD** make provider/MCP/skill/tool lifecycle concerns easier to evolve independently.
- The design **SHOULD** reduce the need for package-internal cache-reset hooks in tests.

### Reliability

- Explicit dependency injection **MUST** not degrade current tool-call, MCP, or skill behavior.
- Environment boundaries **MUST** preserve stable resolution and execution semantics for equivalent inputs.

## Scope

### In Scope

- Explicit environment or dependency injection support for `generate(...)` and `stream(...)`
- Separation of orchestration logic from environment-bound state and adapters
- MCP, skill, provider, and tool dependency injection model
- Compatibility path from current internal-cache implementation

### Out of Scope

- Rewriting unrelated `core/`, `server/`, `web/`, or `electron` orchestration logic
- Removing `generate(...)` or `stream(...)`
- Immediate removal of convenience APIs without an approved migration plan

## Acceptance Criteria

- [ ] `@agent-world/llm` supports an explicit environment/dependency injection path.
- [ ] MCP access can be controlled explicitly by consumers.
- [ ] Skill access can be controlled explicitly by consumers.
- [ ] Provider access can be controlled explicitly by consumers.
- [ ] Built-in tool behavior remains package-owned while environment-sensitive dependencies can be injected.
- [ ] Orchestration logic can be exercised in tests without relying on hidden internal cache state.
- [ ] `generate(...)` and `stream(...)` remain available and behaviorally compatible.
- [ ] Migration from the current per-call internal-cache design can happen incrementally.

## User Stories

### Story 1: Explicit control

**As a** package consumer  
**I want** to inject provider/MCP/skill dependencies explicitly  
**So that** I can control lifecycle, reuse, and isolation without hidden package state.

### Story 2: Better testing

**As a** package maintainer  
**I want** orchestration to be testable separately from environment adapters  
**So that** package tests can be more deterministic and easier to reason about.

### Story 3: Advanced integration

**As an** advanced runtime integrator  
**I want** the package to support both a convenience path and an explicit environment path  
**So that** simple consumers keep an easy API while more complex consumers gain tighter control.

