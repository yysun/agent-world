# Requirement: LLM Package Host-Agnostic Turn Loop

**Date**: 2026-03-29  
**Type**: Runtime Boundary / Package API  
**Component**: `packages/llm` generic orchestration API, `core` package boundary  
**Related**: [req-llm-per-call-api.md](/Users/esun/Documents/Projects/agent-world/.docs/reqs/2026/03/28/req-llm-per-call-api.md), [req-agent-turn-loop-runner.md](/Users/esun/Documents/Projects/agent-world/.docs/reqs/2026/03/29/req-agent-turn-loop-runner.md), `packages/llm/src/runtime.ts`, `core/events/agent-turn-loop.ts`

## Overview

Add a generic `runTurnLoop(...)` API to `@agent-world/llm` that is reusable by host applications that do not have this repository's `world`, `agent`, or `chat` concepts.

The package loop **MUST** be host-agnostic and callback-driven. It **MUST NOT** require Agent World transcript types, persistence models, queue semantics, event emitters, or routing identities as part of its primary public API.

At the same time, `core/` **MUST NOT** continue depending on `@agent-world/llm` as the owner of its current runtime boundary. The intended repository boundary is:

- `packages/llm`: generic model/tool turn-loop engine
- `core/`: Agent World-specific persistence, queueing, restore, event routing, and tool/handoff policies

## Problem Statement

The current package already owns:

- provider adapters
- per-call `generate(...)` and `stream(...)`
- built-in tools and tool resolution
- MCP and skill integration

However, it does **not** yet own a reusable iterative turn loop. The looping behavior that repeatedly:

- builds messages
- calls the model
- interprets `tool_calls`
- executes tools
- appends tool results
- continues until a terminal state

still lives in Agent World-specific runtime code.

At the same time, the current repository state has `core/` consuming the publishable `@agent-world/llm` package. That coupling is not the desired end state for this story. The desired boundary is for `core/` to return to its direct runtime ownership model while `packages/llm` becomes independently reusable for other agent hosts.

## Goals

- Add a package-owned generic `runTurnLoop(...)` API to `@agent-world/llm`.
- Make the loop reusable by hosts that do not have `world`, `agent`, or `chat`.
- Keep the loop callback-driven so hosts control persistence, tool policies, and side effects.
- Keep `@agent-world/llm` publishable and free of `core/` imports.
- Restore the repository boundary so `core/` does not depend on `@agent-world/llm`.

## Non-Goals

- Moving Agent World durability, transcript persistence, queueing, restore/replay, or SSE ownership into `@agent-world/llm`.
- Making `@agent-world/llm` aware of Agent World `World`, `Agent`, `AgentMessage`, or `chatId` types.
- Requiring other hosts to adopt Agent World-style queue or persistence semantics.
- Redesigning the current Agent World durable turn lifecycle in this requirement.

## Functional Requirements

### REQ-1: Generic Package Loop Entry Point

- `@agent-world/llm` **MUST** expose a package-owned generic `runTurnLoop(...)` API.
- The API **MUST** be usable without any Agent World-specific identifiers or types.
- The API **MUST** be callback-driven rather than schema-coupled to one host runtime.

### REQ-2: Host-Agnostic Input Model

- The package loop **MUST NOT** require `world`, `agent`, `chat`, transcript-row, or queue-row identifiers in its primary API.
- The package loop **MUST** operate on package-owned message/response/tool-call contracts or caller-supplied generic state.
- Any host-specific state **MUST** be carried through generic caller-owned state parameters rather than package-owned Agent World types.

### REQ-3: Callback Ownership Boundaries

- The package loop **MUST** let hosts supply callbacks for:
  - building the next model input/messages
  - invoking the model
  - handling text responses
  - handling tool-call responses
  - deciding whether to continue or stop
- The package loop **MAY** offer optional lifecycle callbacks for logging or persistence hooks.
- The package loop **MUST NOT** directly own transcript persistence, queue mutation, or UI event publication.

### REQ-4: Tool-Loop Semantics

- The package loop **MUST** support iterative model → tool-call inspection → tool execution → continuation behavior.
- The package loop **MUST** remain compatible with the package’s existing `LLMResponse` and tool-definition contracts.
- The package loop **MUST** support bounded retry behavior for empty or otherwise non-progressing responses.
- The package loop **MUST** allow hosts to stop the loop or request continuation after each step.

### REQ-5: Host-Owned Durability and Side Effects

- Memory persistence **MUST** remain host-owned.
- Message queue ownership **MUST** remain host-owned.
- Restore/replay ownership **MUST** remain host-owned.
- Approval/HITL persistence and recovery **MUST** remain host-owned unless a separate requirement explicitly moves those contracts into the package.
- Event publication, SSE, and UI routing **MUST** remain host-owned.

### REQ-6: Package Boundary Purity

- `@agent-world/llm` **MUST NOT** import from `core/`.
- The new package loop **MUST** be reusable by external consumers without depending on repository-local runtime modules.
- Package public types **MUST** remain package-owned.

### REQ-7: Core Boundary Reset

- `core/` **MUST NOT** depend on `@agent-world/llm` as part of this story’s target architecture.
- The repository target state **MUST** restore `core/` to direct ownership of its runtime/provider integration boundary.
- The package loop **MUST NOT** be designed in a way that requires `core/` to consume it immediately.
- Migration from the current state **MUST** permit package work and `core` rollback to be reasoned about as separate concerns.

### REQ-8: Compatibility With Existing Package Surfaces

- The new `runTurnLoop(...)` API **MUST** coexist with `generate(...)`, `stream(...)`, `resolveTools(...)`, and `resolveToolsAsync(...)`.
- Hosts that only need one-shot model calls **MUST NOT** be forced onto the loop API.
- Hosts that want a reusable tool loop **MUST** be able to build on package-owned contracts instead of reimplementing the control flow.

## Non-Functional Requirements

### Reusability

- The package loop **MUST** be understandable and usable by hosts outside this monorepo.
- The package loop **SHOULD** minimize assumptions about persistence and runtime topology.

### Maintainability

- The package loop **SHOULD** isolate generic loop control from host-specific policy.
- The package loop **SHOULD** reduce duplicated host-side tool-loop control logic without absorbing host durability responsibilities.

### Compatibility

- The package loop **MUST** preserve the current provider boundary where provider clients remain model-call clients rather than orchestration owners.
- The package loop **MUST** remain compatible with the package’s current per-call API model.

## Scope

### In Scope

- A generic `runTurnLoop(...)` package API.
- Package-owned callback contracts and loop control contracts.
- Clear ownership boundaries between package orchestration and host durability.
- The target architecture statement that `core/` returns to direct runtime ownership rather than consuming `@agent-world/llm`.

### Out of Scope

- Implementing the `core/` rollback in this REQ document.
- Reworking Agent World persistence or queue semantics.
- Defining a cross-host durable transcript protocol.
- Requiring external consumers to use Agent World-style tool/handoff conventions.

## Acceptance Criteria

- [x] `@agent-world/llm` exposes a generic `runTurnLoop(...)` API.
- [x] The package loop API does not require `world`, `agent`, or `chat`.
- [x] Hosts can supply callbacks for message building, model invocation, tool handling, and continue/stop decisions.
- [x] Memory persistence and message queue behavior remain host-owned concerns.
- [x] The package remains free of `core/` imports.
- [x] The documented target repository boundary restores `core/` to direct runtime ownership instead of package dependence.
- [x] The package loop coexists cleanly with `generate(...)` and `stream(...)`.

## User Stories

### Story 1: External host reuse

**As an** external agent-project maintainer  
**I want** a generic `runTurnLoop(...)` in `@agent-world/llm`  
**So that** I can reuse tool-loop orchestration without adopting Agent World runtime types.

### Story 2: Host-owned durability

**As a** host-runtime maintainer  
**I want** to keep persistence, queueing, and replay outside the package  
**So that** I can apply my own storage and recovery model without fighting package assumptions.

### Story 3: Repo boundary reset

**As an** Agent World maintainer  
**I want** `core/` restored to direct runtime ownership instead of package dependence  
**So that** the publishable package remains generic and the app runtime remains app-specific.
