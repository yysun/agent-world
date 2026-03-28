# Test Spec: LLM Workspace Package

**Date:** 2026-03-27  
**Related Requirement:** [req-llm-workspace-package.md](/Users/esun/Documents/Projects/agent-world/.docs/reqs/2026/03/27/req-llm-workspace-package.md)  
**Related Plan:** [plan-llm-workspace-package.md](/Users/esun/Documents/Projects/agent-world/.docs/plans/2026/03/27/plan-llm-workspace-package.md)

## Goal

Verify that `@agent-world/llm` is a publishable runtime package that owns provider config, MCP support, built-in tool configuration and execution, tool contracts, and skill support while remaining consumable by `core/`.

## Scope

- package public API shape
- package-owned provider configuration
- MCP config parsing and tool resolution
- package-owned built-in tool ownership and configuration
- skill discovery/loading behavior
- `core` compatibility at the package boundary

## Scenarios

### 1. Runtime constructor exposes package-owned baseline configuration

Given a consumer creates `createLLMRuntime(...)`  
When constructor options include providers, MCP config, skill roots, and built-in tool enablement  
Then the runtime should expose those settings through package-owned registries and public getters without requiring `core` imports.

### 2. Provider config is isolated per runtime instance

Given two runtime instances with different provider credentials  
When each runtime reads back provider configuration  
Then each runtime should see only its own configured values and should not mutate the other runtime’s state.

### 3. Built-in tools are owned by the package

Given a runtime created with built-in tools enabled  
When tools are resolved from the package runtime  
Then package-owned built-ins such as `shell_cmd`, `web_fetch`, file tools, and `load_skill` should be present through the package surface rather than requiring `core` registration.

### 4. Constructor-time built-in enablement defines the default tool catalog

Given a runtime created with selected built-ins disabled  
When the runtime resolves its default tools  
Then disabled built-ins should be absent from the default resolved catalog  
And enabled built-ins should remain available.

### 5. Generate-time built-in filtering only narrows the default tool set

Given a runtime with a baseline built-in tool catalog  
When a generate call requests a narrower set of enabled built-ins  
Then only the requested subset should be active for that call  
And built-ins disabled at constructor time should not be implicitly re-enabled by generate-time options.

### 6. Package-owned built-ins execute inside the package, with HITL returning a pending artifact

Given package-owned built-in tools such as shell, web-fetch, file, skill-loading, and HITL  
When the runtime executes those tools  
Then shell, web-fetch, file, and skill-loading behavior should execute inside `@agent-world/llm`  
And `human_intervention_request` should return a deterministic pending HITL request artifact without requiring a package adapter  
And the package should not import `core` internals to perform those actions.

### 7. MCP and built-in tools remain merge-compatible

Given a runtime with built-ins enabled and MCP config set  
When the package resolves tools  
Then the resulting tool set should include both built-ins and MCP-provided tools using deterministic merge behavior.

### 7a. MCP tools are executable through the package runtime

Given a runtime with MCP config set  
When the package resolves MCP tools and executes one of them  
Then the tool should connect through the package-owned MCP client layer  
And return a deterministic result payload through the package tool contract  
And the runtime should be able to shut down MCP client resources cleanly.

### 7b. Per-call tool injection cannot override reserved built-in names

Given a runtime with package-owned built-ins  
When a caller passes per-call `tools` containing a reserved built-in name  
Then the runtime should reject that request instead of allowing the override.

### 8. Skill listing and loading remain package-owned

Given configured skill roots  
When the runtime lists available skills and loads a specific skill  
Then metadata listing and full skill loading should both work through package APIs  
And duplicate skill IDs should follow the documented root precedence rules.

### 9. Core compatibility remains intact during migration

Given `core` consumes `@agent-world/llm`  
When `core` runs existing agent/runtime flows  
Then package-backed provider behavior should remain compatible at the `core` boundary  
And the remaining built-in/MCP/skill bridge should stay explicitly scoped until the runtime migration is completed.

## Validation Notes

- Prefer targeted unit tests for package contracts and HITL pending-artifact behavior.
- Use in-memory fakes or mocks for filesystem, network, approval, and shell execution where test coverage touches execution behavior.
- Provide a terminal-runnable real-LLM showcase command, driven by repo `.env`, that exercises package-owned built-ins, skill loading, MCP execution, and streaming end to end.
- Run integration coverage after tool/runtime migration reaches the `core` transport path.
