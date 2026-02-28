# Requirement: Extension Platform for Custom Renderers and Client Extension Points

**Date**: 2026-02-26  
**Type**: Feature Enhancement  
**Component**: Extension system (World config, runtime registry, developer tooling, Web/Electron client surfaces)  
**Related**: Existing custom renderer registry, MCP tools/resources, HITL UI flows

## Overview

Add a first-class extension platform so customers can install extensions and enable them per world.  
The platform must support custom renderers plus additional client extension points (for example commands, panels, and event hooks) while preserving current built-in behavior.

## Goals

- Enable customers to add renderer and UI behavior without modifying core source code.
- Provide world-level control over which extensions are active and how they are configured.
- Define a clear storage model for extension packages, metadata, and world bindings.
- Provide a predictable extension developer experience (create, run, package, install, validate).
- Keep compatibility with existing MCP/tool-driven flows and plain-text fallback paths.

## Functional Requirements

### REQ-1: World-Level Extension Configuration

- The world model **MUST** support extension configuration independent of `mcpConfig`.
- World extension configuration **MUST** include:
  - enabled extension IDs
  - optional per-extension settings
  - deterministic ordering/priority for extension resolution
- World updates via API/UI **MUST** allow reading and writing extension configuration.

### REQ-2: Extension Catalog and Storage

- The system **MUST** support globally installed extensions that can be reused by multiple worlds.
- Extension artifacts and metadata **MUST** be persisted outside source-controlled app code.
- The platform **MUST** persist:
  - extension identity (publisher/name/version)
  - compatibility metadata (host API version constraints)
  - declared permissions/capabilities
  - install status and integrity metadata
- World records **MUST NOT** duplicate extension code; they **MUST** reference installed extensions by ID/version.

### REQ-3: Contribution Points

- The extension platform **MUST** define contribution points for at least:
  - custom message renderers
  - command/workflow actions
  - client lifecycle/event hooks
- Renderer contributions **MUST** be able to declare message/tool match conditions (for example by `toolExecution.toolName` and/or content type).
- Resolver behavior **MUST** be deterministic when multiple extensions match the same message.

### REQ-4: Runtime Resolution and Fallback

- Runtime **MUST** preserve current built-in rendering behavior when no extension matches.
- Runtime **MUST** handle extension failures safely:
  - no client crash
  - fallback to built-in/default renderer
  - observable error state for diagnostics
- Existing plain-text fallback paths (such as `render_sheet_music({...})`) **MUST** remain compatible unless explicitly disabled by policy.

### REQ-5: Security, Permissions, and Trust

- Extensions **MUST** declare required permissions.
- Host runtime **MUST** enforce permission boundaries per extension capability.
- The platform **MUST** support a trust policy for extension installation and activation (for example untrusted/disabled states).
- Sensitive capabilities (filesystem writes, shell/tool execution, network) **MUST** require explicit approval policy and auditable logs.

### REQ-6: Lifecycle Management

- The system **MUST** support extension lifecycle operations:
  - install
  - uninstall
  - enable/disable per world
  - upgrade/downgrade
- Lifecycle changes **MUST** be reflected consistently across clients and server APIs.
- Disabling or uninstalling an extension **MUST** not corrupt world data; world config should remain recoverable.

### REQ-7: Developer Experience

- The platform **MUST** provide an extension manifest schema and validation errors.
- The platform **MUST** provide developer workflows for:
  - scaffolding a new extension
  - local development/testing against host app
  - packaging and install validation
- Developer documentation **MUST** specify:
  - available contribution points
  - host APIs exposed to extensions
  - compatibility/versioning rules
  - permission model

### REQ-8: Compatibility with MCP and Skills

- Extension platform **MUST** coexist with MCP tool/resource flows and agent skills.
- Extensions **MUST NOT** break existing tool event semantics used by HITL and tool-execution UI.
- Renderer extension matching **MUST** be able to consume structured tool outputs from MCP-driven tool events.

### REQ-9: GitHub Shorthand Extension Install

- CLI **MUST** support shorthand install command:
  - `agent-world ext install <extension-name>`
- For shorthand input without explicit source, installer **MUST** resolve to:
  - repository: `yysun/awesome-agent-world`
  - branch: `main` (unless existing install options override branch)
  - path: `extensions/<extension-name>`
- Installer **MUST** use the same trust and validation model as other extension install paths.
- Installer **MUST** fail with clear actionable errors when shorthand resolution, fetch, validation, or packaging checks fail.
- Installer **MUST** include source diagnostics in result/logs:
  - resolved repository
  - branch
  - extension path
  - commit SHA when available
- Installer **MUST** reject path traversal and unsupported archive entries while materializing extension files.

## Non-Functional Requirements

### Reliability

- Extension resolution and activation **MUST** be deterministic for a given world config.
- Invalid extension manifests or runtime errors **MUST** fail safely and preserve baseline app functionality.

### Performance

- Extension loading **SHOULD** avoid noticeable chat-render latency regressions in typical workloads.
- World initialization **SHOULD** avoid loading unused extensions.

### Observability

- Extension load/match/failure events **MUST** be diagnosable via logs/telemetry.
- Runtime diagnostics **SHOULD** identify which extension rendered a message.

## Scope

### In Scope

- World-level extension config model.
- Global extension storage/catalog model.
- Renderer and core client extension points.
- Extension lifecycle APIs/commands and developer workflow requirements.
- GitHub shorthand install flow for extension packages from approved alias source.

### Out of Scope

- Marketplace/distribution backend implementation.
- Billing/licensing systems for extensions.
- Cross-organization trust federation.
- Generic shorthand mapping for arbitrary repositories beyond approved aliases.

## Acceptance Criteria

- [ ] Worlds can persist extension enablement/settings independently from `mcpConfig`.
- [ ] Installed extensions are stored globally and referenced by worlds.
- [ ] Renderer extension matching can trigger by structured tool metadata (for example `toolExecution.toolName`).
- [ ] Runtime deterministically resolves multiple matching renderers.
- [ ] Extension failures safely fall back to built-in rendering with diagnostics.
- [ ] Extension permissions are declared and enforced.
- [ ] CLI/API flows exist to install, enable, disable, upgrade, and uninstall extensions.
- [ ] `agent-world ext install <extension-name>` resolves to `yysun/awesome-agent-world` `extensions/<extension-name>` by default.
- [ ] Shorthand install returns clear diagnostics for resolved source and commit (when available).
- [ ] Extension authoring docs/workflows exist for scaffold, dev, and package steps.
- [ ] Existing HITL and MCP-driven tool UI behavior remains functional.

## User Stories

### Story 1: World owner control
**As a** world owner  
**I want to** enable specific extensions per world with configurable settings  
**So that** each world can have tailored renderer/UI behavior.

### Story 2: Extension developer workflow
**As an** extension developer  
**I want** a manifest schema and local dev/package/install workflow  
**So that** I can build and ship extensions predictably.

### Story 3: Safe runtime behavior
**As an** operator  
**I want** extension permissions and safe fallback behavior  
**So that** extension issues do not break core chat/tool functionality.
