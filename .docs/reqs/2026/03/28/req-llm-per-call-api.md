# Requirement: LLM Package Per-Call API

**Date**: 2026-03-28  
**Type**: API Simplification / Runtime Boundary  
**Component**: `packages/llm` public API, MCP/skill/provider configuration flow  
**Related**: `.docs/reqs/2026/03/27/req-llm-workspace-package.md`, `packages/llm/src/runtime.ts`, `packages/llm/src/mcp.ts`, `packages/llm/src/skills.ts`

## Overview

Change `@agent-world/llm` from a constructor-oriented runtime API to a per-call API.

The package **MUST** keep separate `generate(...)` and `stream(...)` entrypoints, but consumers **MUST NOT** be required to create a runtime instance or perform public constructor-time setup before making calls.

Provider configuration, MCP configuration, skill roots, tool selection, and request execution context **MUST** be supplied through the per-call API surface, while caching and reuse concerns remain internal package behavior.

## Goals

- Remove the requirement for consumers to create a runtime object before using the package.
- Preserve `generate(...)` and `stream(...)` as the primary public entrypoints.
- Keep the package self-contained for model invocation, built-in tools, MCP, and skills.
- Allow `core/` to resolve world, agent, and chat state into one per-call request without managing package lifecycle objects.
- Keep internal caching as an implementation detail rather than a public API concern.

## Functional Requirements

### REQ-1: No Required Constructor

- The package **MUST NOT** require a public constructor or runtime factory as the primary usage path.
- Consumers **MUST** be able to call `generate(...)` and `stream(...)` directly with all required inputs.
- Any constructor-style or instance-style API, if retained temporarily for compatibility, **MUST NOT** remain the recommended primary package usage model.

### REQ-2: Separate Generate and Stream Entry Points

- The package **MUST** keep distinct `generate(...)` and `stream(...)` public functions.
- `generate(...)` **MUST** represent buffered/non-streaming invocation.
- `stream(...)` **MUST** represent incremental/streaming invocation.
- Both functions **MUST** share the same conceptual configuration model so developers do not need to learn two different runtime setup models.

### REQ-3: Per-Call Configuration Model

- Provider selection **MUST** be passed per call.
- Model selection **MUST** be passed per call.
- Provider credentials or provider-specific configuration **MUST** be passable per call.
- MCP configuration **MUST** be passable per call.
- Skill roots **MUST** be passable per call.
- Built-in tool enablement or selection **MUST** be passable per call.
- Extra tools **MUST** be passable per call.
- Request-local execution context such as working directory, reasoning effort, permission, and abort signal **MUST** be passable per call.

### REQ-4: Internal Caching and Reuse

- The package **MUST** handle provider, MCP, and skill reuse internally where beneficial.
- Internal caching **MUST NOT** require explicit public setup calls such as provider registration, MCP registration, or skill-root registration.
- Internal caching **MUST** be keyed or scoped in a way that avoids mixing incompatible configurations.
- Internal caching **MUST** remain an implementation detail rather than a required concept for package consumers.

### REQ-5: MCP Behavior Under Per-Call API

- MCP tool availability **MUST** still be resolved from the MCP configuration provided to `generate(...)` or `stream(...)`.
- MCP connection reuse and tool discovery caching **MUST** remain possible without a public runtime instance.
- MCP behavior **MUST** remain compatible with mixed built-in, extra-tool, and MCP-provided tool availability.
- MCP cleanup semantics **MUST** remain well-defined even if no public runtime object is created.

### REQ-6: Skill Behavior Under Per-Call API

- Skill discovery and `load_skill` behavior **MUST** use the skill roots provided to `generate(...)` or `stream(...)`.
- The package **MUST** support skill-root changes between calls without requiring the consumer to manually recreate a runtime object.
- Skill discovery behavior **MUST** remain deterministic for equivalent roots and filesystem state.

### REQ-7: Tool Model Under Per-Call API

- Built-in tools **MUST** remain package-owned.
- Built-in tool selection **MUST** be configurable per call.
- Extra tools **MUST** remain additive-only.
- Consumers **MUST NOT** be able to override reserved built-in tool names through per-call extra tools.
- Tool resolution behavior **MUST** remain consistent between `generate(...)` and `stream(...)`.

### REQ-8: World, Agent, and Chat Integration

- The package API **MUST** allow hosts such as `core/` to resolve world, agent, and chat state into a single per-call request.
- The package **MUST NOT** require world, agent, or chat identifiers as primary public API inputs unless strictly needed for tool execution context.
- The package **MUST** support the host choosing the effective provider and model per call, including world defaults overridden by agent-specific values.
- The package **MUST** support the host passing chat- or UI-level execution context such as current working directory, reasoning effort, and permission on each call.

### REQ-9: Compatibility and Migration

- The package transition from constructor-oriented API to per-call API **MUST** preserve current normalized request/response semantics.
- Existing streaming and non-streaming behavior **MUST** remain functionally compatible from the perspective of `core/`.
- Migration **MUST** allow incremental adaptation rather than requiring a flag-day rewrite across the monorepo.

## Non-Functional Requirements

### Simplicity

- The public API **SHOULD** minimize required concepts for first-time users.
- The public API **SHOULD** make it obvious which inputs are passed on each call.

### Maintainability

- The package **SHOULD** keep internal caching and lifecycle complexity hidden from consumers.
- The package **SHOULD** avoid exposing multiple competing public setup patterns for the same capability.

### Reliability

- Equivalent per-call inputs **MUST** produce equivalent tool, MCP, and skill resolution behavior.
- Internal cache reuse **MUST NOT** create incorrect cross-request leakage between incompatible configurations.

## Scope

### In Scope

- Public API shift from constructor-oriented runtime usage to per-call usage.
- Per-call configuration for provider/model/MCP/skills/tools/context.
- Internal caching expectations for provider, MCP, and skills.
- Compatibility expectations for `core/` integration.

### Out of Scope

- UI redesign or workflow changes in web or Electron.
- Rewriting unrelated chat/session features.
- Detailed implementation strategy for cache eviction or lifecycle internals.

## Acceptance Criteria

- [ ] `@agent-world/llm` exposes `generate(...)` and `stream(...)` as the primary public API.
- [ ] Consumers can make LLM calls without creating a runtime instance first.
- [ ] Provider/model/configuration can be supplied per call.
- [ ] MCP configuration can be supplied per call and still affects callable MCP tools.
- [ ] Skill roots can be supplied per call and still affect skill discovery/loading behavior.
- [ ] Built-in tool selection can be supplied per call.
- [ ] Extra tools remain additive-only and cannot override built-in names.
- [ ] Internal caching/reuse remains possible without public setup APIs.
- [ ] `core/` can map world, agent, and chat state into one per-call request model.
- [ ] `generate(...)` and `stream(...)` remain behaviorally aligned aside from delivery mode.

## User Stories

### Story 1: Core integration

**As a** `core/` maintainer  
**I want** to call `generate(...)` or `stream(...)` with resolved world/agent/chat inputs  
**So that** I do not need to manage package runtime instances or constructor-time package state.

### Story 2: External consumer simplicity

**As an** external package consumer  
**I want** a single per-call API model  
**So that** I can use the package without first learning a separate runtime-construction lifecycle.

### Story 3: Internal optimization without public complexity

**As a** package maintainer  
**I want** provider, MCP, and skill reuse to stay internal  
**So that** performance and lifecycle optimization do not complicate the public API.

