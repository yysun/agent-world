# Requirement: Publishable LLM Workspace Package

**Date**: 2026-03-27  
**Type**: Architecture / Packaging  
**Component**: Monorepo workspace structure, LLM runtime boundary, MCP/tool/skill integration  
**Related**: `core/llm-manager.ts`, `core/mcp-server-registry.ts`, `core/load-skill-tool.ts`, `core/skill-registry.ts`, `core/events/*`

## Overview

Create a new monorepo workspace for LLM functionality that can be published as an npm package and consumed by `core/`.

The new workspace must provide a single coherent package boundary for:
- model/provider invocation
- MCP integration
- tool registration and execution through a contract
- skill discovery/loading support
- built-in runtime tools currently owned by `core/`

The goal is to let `core/` depend on a reusable package instead of owning these responsibilities directly.

## Goals

- Establish a publishable npm package for the project’s LLM-related runtime capabilities.
- Move the reusable LLM, MCP, tool-contract, and skill-support concerns behind one package boundary.
- Allow `core/` to consume the package without behavior loss in existing agent flows.
- Preserve current world/chat/tool semantics while reducing direct coupling inside `core/`.
- Define a stable public API that can be versioned independently from app-specific code.

## Functional Requirements

### REQ-1: Dedicated Publishable Workspace

- The monorepo **MUST** contain a dedicated workspace for the new LLM package.
- The workspace **MUST** be buildable and publishable as an npm package.
- The workspace **MUST** expose a stable package entrypoint and typed public API.
- The package **MUST** be usable by local monorepo consumers before publishing and by external consumers after publishing.

### REQ-2: Core Consumption

- `core/` **MUST** consume the new package for LLM-related runtime responsibilities that move into the workspace.
- `core/` **MUST NOT** duplicate moved logic after migration is complete.
- Existing `core/` agent behavior **MUST** remain functionally compatible from the perspective of callers and users.

### REQ-3: Provider Invocation Support

- The package **MUST** support the project’s current normalized LLM request/response model.
- The package **MUST** support both non-streaming and streaming model invocation.
- The package **MUST** preserve normalized tool-call response handling used by the current runtime.
- The package **MUST** support the currently supported provider families used by the project.

### REQ-4: MCP Support

- The package **MUST** include MCP integration support as part of its public capability surface.
- MCP support **MUST** allow consumers to resolve tools from package-managed MCP configuration/runtime state.
- MCP support **MUST** preserve current behavior for mixed built-in and MCP-provided tool availability.
- MCP support **MUST** continue to support the transport/config patterns already used by the project unless explicitly deprecated in a later requirement.

### REQ-5: Tool Contract and Registration

- The package **MUST** define a tool contract for registration, validation, execution context, and normalized results.
- The tool contract **MUST** support both built-in tools and externally provided tools.
- Tool registration **MUST** allow `core/` to assemble the tool set needed for a world/chat run without reaching into package internals.
- Tool execution results **MUST** remain compatible with the current continuation flow expectations in `core/`.

### REQ-5A: Package-Owned Built-In Tools

- The package **MUST** fully own the current built-in tool implementations that are part of the reusable runtime boundary, including the built-in shell, web-fetch, file, skill-loading, and related runtime tools currently registered through `core`.
- The package **MUST** expose explicit public configuration for enabling and disabling built-in tools.
- Built-in tool availability **MUST** be configurable without requiring consumers to reimplement or manually re-register the built-in tools.
- Built-in tool execution **MUST** still receive any required host execution context through explicit package contracts.
- Migration of built-in tools into the package **MUST** preserve the current mixed built-in plus MCP tool availability model.
- The primary enable/disable configuration **SHOULD** be constructor-time runtime configuration so the runtime has a stable default tool catalog.
- The package **MAY** support per-call narrowing or filtering of already-registered built-in tools, but per-call configuration **MUST NOT** become the only mechanism for built-in tool control.

### REQ-6: Skill Support

- The package **MUST** include skill support.
- Skill support **MUST** include discovery/listing of available skills and on-demand loading of skill instructions.
- Skill support **MUST** remain compatible with current skill-oriented prompting and tool-driven skill loading behavior.
- Skill support **MUST** preserve the distinction between available-skill metadata and full loaded-skill content.

### REQ-7: Runtime Boundary

- The package **MUST** present a coherent runtime boundary that groups provider invocation, MCP support, tool contracts, and skills together.
- The package boundary **MUST** be explicit about what context the host supplies for execution.
- Host-specific app concerns that are not part of the reusable runtime **MUST NOT** leak into the package’s public API unless required as explicit contracts.
- The boundary **MUST** support reuse by `core/` without forcing application-specific UI concerns into the package.

### REQ-8: Compatibility and Migration

- The migration **MUST** preserve current message/tool lifecycle semantics expected by `core/`.
- Existing persisted tool-call and continuation behavior **MUST** remain reconstructable after migration.
- The package introduction **MUST** not break current agent flows that depend on MCP tools, built-in tools, skill loading, or streamed tool-call responses.
- The migration **MUST** allow incremental adoption inside the monorepo rather than requiring a flag day rewrite.

### REQ-9: Versioning and Package Identity

- The package **MUST** have a clear npm package identity suitable for public or private publication.
- The package **MUST** use semantic versioning.
- The package **MUST** define which APIs are public and which are internal-only.
- Breaking changes to the package API **MUST** be managed through versioning rather than hidden coupling.

## Non-Functional Requirements

### Reliability

- The package **MUST** preserve deterministic tool and skill resolution behavior for equivalent inputs.
- Integration failures at the package boundary **MUST** fail in observable ways suitable for host recovery and diagnostics.

### Maintainability

- The workspace split **SHOULD** reduce responsibility overlap between `core/` and the package.
- Public contracts **SHOULD** be explicit enough that internal refactors do not force changes in `core/`.

### Observability

- The package **MUST** preserve or replace current diagnostic surfaces for provider calls, MCP/tool resolution, and skill loading so runtime issues remain debuggable.

### Packaging

- The package **SHOULD** avoid depending on app-only entrypoints so it can be published cleanly.
- The package **MUST** clearly define required runtime environment assumptions for consumers.

## Scope

### In Scope

- New workspace creation for a publishable LLM package.
- Package identity and public API definition.
- Provider invocation support.
- MCP integration.
- Tool registration/execution contract.
- Built-in runtime tool ownership and configuration.
- Skill discovery/loading support.
- `core/` consumption of the package.

### Out of Scope

- UI redesign in web or Electron.
- Marketplace/distribution workflow beyond npm package publication readiness.
- Rewriting unrelated world/chat features that are not needed for the package boundary.

## Acceptance Criteria

- [ ] A dedicated monorepo workspace exists for the new publishable LLM package.
- [ ] The workspace is structured so it can be published as an npm package.
- [ ] The package exposes typed public APIs for model invocation, MCP support, tool contracts, and skill support.
- [ ] `core/` can consume the package instead of owning those responsibilities directly.
- [ ] Streaming and non-streaming LLM behavior remain compatible with current agent flows.
- [ ] MCP-backed and built-in tool availability remain compatible with existing behavior.
- [ ] Built-in tools are owned by the package and can be explicitly enabled or disabled through the public API.
- [ ] Tool registration and execution use an explicit contract exposed by the package.
- [ ] Skill listing and on-demand skill loading remain available through the package.
- [ ] Existing runtime flows in `core/` remain functionally intact after migration.
- [ ] The package has a defined npm package identity and semver policy.

## User Stories

### Story 1: Core runtime reuse

**As a** maintainer of `core/`  
**I want** `core/` to depend on a dedicated LLM runtime package  
**So that** LLM, MCP, tool, and skill logic can be reused and versioned separately.

### Story 2: Publishable package

**As a** package maintainer  
**I want** the new workspace to be publishable to npm  
**So that** the runtime can be reused outside this monorepo.

### Story 3: Stable integration boundary

**As an** application/runtime integrator  
**I want** explicit contracts for tools, MCP, and skills  
**So that** I can use the package without relying on internal `core/` implementation details.
