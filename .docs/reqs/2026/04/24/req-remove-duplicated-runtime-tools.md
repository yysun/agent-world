# Requirement: Migrate and Delete Duplicated Runtime Tools

**Date**: 2026-04-24  
**Type**: Runtime Ownership Consolidation / Tool Surface Simplification  
**Component**: `core/llm-runtime.ts`, `core/mcp-server-registry.ts`, duplicated built-in tool modules in `core/`, tool resume/orchestrator paths, built-in tool tests  
**Related**: `.docs/reqs/2026/04/16/req-remove-internal-llm-package.md`, `.docs/reqs/2026/04/24/req-llm-runtime-hitl-schema.md`

## Overview

Agent World must stop maintaining repository-owned built-in tool definitions for tool names that are already reserved and owned by `llm-runtime`.

The external runtime already owns the built-in tool catalog for these names:

- `shell_cmd`
- `load_skill`
- `ask_user_input`
- `human_intervention_request`
- `web_fetch`
- `read_file`
- `write_file`
- `list_files`
- `grep`

Agent World currently still keeps a second built-in surface for those same public tool names in `core/`, especially through the legacy built-in registry path. That creates duplicate tool ownership, duplicate tests, and a risk that non-runtime execution paths diverge from the runtime-owned contract.

This requirement migrates Agent World to one tool-ownership boundary for all runtime-owned built-in names and removes the duplicate repository-built tool definitions after the migration is complete.

This is a deletion requirement, not a partial coexistence requirement. After the migration lands, Agent World must not keep two public implementations of the same runtime-owned built-in tool name.

## Problem Statement

The repository now uses `llm-runtime` as the primary model/runtime execution boundary, but it still carries a second built-in tool surface in `core/` for the same reserved tool names.

That duplication causes several problems:

- Reserved-name ownership is split between the package runtime and the repository host.
- The same public tool name can behave differently depending on which execution path resolved it.
- Non-runtime tool consumers can continue to depend on legacy core implementations instead of the runtime-owned contract.
- Tests and docs must validate two overlapping implementations of the same public tool family.
- Runtime migration is incomplete while the repo still owns built-in tool definitions that the external runtime already reserves.

The result is an ambiguous ownership model: Agent World says it uses `llm-runtime` built-ins, but the repo still constructs its own versions of those tools in parallel.

## Goals

- Make `llm-runtime` the only public owner of all runtime-reserved built-in tool names.
- Remove repository-owned duplicate tool definitions for the overlapping built-in names.
- Migrate all execution paths that still depend on the duplicate core built-ins onto the runtime-owned contract.
- Preserve Agent World host behavior that must still exist around world scope, chat scope, approvals, persistence, replay, and user-facing event semantics.
- Remove duplicate tests, registry wiring, and developer-facing documentation that exist only because the repo still owns duplicate built-ins.

## Non-Goals

- Removing host-only tools that are not runtime-owned built-ins, such as `create_agent` or `send_message`.
- Redesigning unrelated queue, SSE, persistence, MCP server discovery, or client UX behavior beyond what is required for the ownership migration.
- Removing Agent World-specific host side effects when those side effects are still required for product behavior.
- Renaming runtime-reserved built-ins to avoid the migration.

## Functional Requirements

### REQ-1: `llm-runtime` Must Be The Only Public Owner Of Reserved Built-In Names

- Agent World **MUST** treat `llm-runtime` as the single public owner of the runtime-reserved built-in tool names:
  - `shell_cmd`
  - `load_skill`
  - `ask_user_input`
  - `human_intervention_request`
  - `web_fetch`
  - `read_file`
  - `write_file`
  - `list_files`
  - `grep`
- `core/` **MUST NOT** continue to publish separate built-in tool definitions under those same public names once the migration is complete.
- The legacy alias `human_intervention_request` **MAY** remain only as the runtime-owned alias of `ask_user_input`, not as a separate repository-owned tool implementation.

### REQ-2: All Execution Paths Must Resolve One Canonical Built-In Tool Surface

- Agent World **MUST** migrate every active execution path that still resolves duplicate core built-ins to the canonical runtime-owned built-in tool surface.
- Runtime request execution, restore/resume flows, orchestrator/memory-manager continuation flows, server transport paths, Electron paths, and any other active built-in tool consumers **MUST NOT** keep using a second repository-owned implementation of a runtime-reserved built-in name.
- No active product path **MAY** depend on a repository-owned duplicate built-in after the migration is complete.

### REQ-3: Duplicate Built-In Registrations Must Be Removed

- The repository **MUST** remove built-in registry wiring that constructs or returns duplicate public built-ins for runtime-reserved names.
- Functions that enumerate or return tool catalogs for a world **MUST NOT** synthesize a second built-in copy for names already owned by `llm-runtime`.
- Agent World **MUST NOT** pass host extra tools into `llm-runtime` under reserved built-in names.

### REQ-4: Required Agent World Product Semantics Must Survive The Migration

- The migration **MUST NOT** regress Agent World product behavior that depends on host context or side effects around tool execution.
- Existing product semantics that remain required, including world/chat scoping, approval flow behavior, persistence side effects, replay/restore behavior, tool-result artifact behavior, and user-visible event sequencing, **MUST** continue to work after duplicate built-ins are removed.
- If a required product behavior is not owned by `llm-runtime`, Agent World **MUST** preserve that behavior without keeping a second public built-in implementation under the same reserved tool name.

### REQ-5: Duplicate Core Tool Implementations Must Be Deleted After Migration

- After all active execution paths have been migrated, repository-owned built-in tool definitions and supporting code whose only remaining purpose is implementing runtime-reserved public tool names **MUST** be deleted.
- Core modules, helper branches, compatibility wrappers, and dead code that exist only to support the duplicate built-in ownership model **MUST** be removed.
- Repository-owned tests that exist only to validate deleted duplicate built-in implementations **MUST** also be removed or replaced with tests that validate the runtime-owned contract at the Agent World boundary.

### REQ-6: Host-Only Tools Must Remain Clearly Separated

- Host-only tools that are not runtime-reserved built-ins, including `create_agent` and `send_message`, **MUST** remain clearly separated from the migrated built-in ownership boundary.
- The migration **MUST NOT** incorrectly classify host-only tools as duplicates merely because they participate in the host runtime tool map.

### REQ-7: Tool Contracts Must Stop Drifting Across Duplicate Surfaces

- After the migration, Agent World **MUST NOT** maintain a second schema, description, or return contract for a runtime-reserved built-in tool name.
- Runtime-owned built-in names **MUST** advertise one canonical contract across prompt guidance, validation, execution, persistence-facing artifacts, and test coverage.
- Agent World compatibility support for historical data **MAY** remain where needed, but it **MUST NOT** keep a second live public built-in contract for newly executed tool calls.

### REQ-8: Documentation, Tests, And Validation Flows Must Reflect The New Ownership Boundary

- Active developer-facing docs **MUST** stop describing the removed repository-owned duplicate built-ins as first-class public tool implementations.
- Validation flows **MUST** stop asserting duplicate built-in ownership in `core/` once those duplicates are removed.
- Remaining tests **MUST** validate the runtime-owned built-in behavior at the Agent World integration boundary rather than validating an obsolete duplicate implementation.

## Non-Functional Requirements

### Simplicity

- Agent World **SHOULD** expose one clear ownership model for runtime-reserved built-in tools.
- The repo **SHOULD** no longer require maintainers to understand two implementations of the same built-in tool name.

### Maintainability

- The repository **SHOULD** avoid keeping source files and tests whose only purpose is duplicating runtime-owned built-ins.
- Host-specific code left after the migration **SHOULD** be limited to Agent World integration concerns rather than re-implementing the runtime tool itself.

### Reliability

- Consolidating ownership **MUST NOT** break active built-in tool execution paths, pending-tool resume behavior, or client-visible behavior.
- Deleting duplicate built-ins **MUST NOT** leave hidden fallback code paths that still reference removed implementations.
- The repository **MUST** remain buildable and the relevant targeted tests **MUST** pass after the duplicate built-ins are removed.

## Scope

### In Scope

- Migrating active execution paths away from duplicate core built-ins for runtime-reserved names
- Removing duplicate built-in registrations from `core/`
- Deleting duplicate core built-in tool definitions and duplicate-only helpers when migration is complete
- Updating tests and active docs that still describe or validate duplicate built-in ownership

### Out of Scope

- Broad redesign of Agent World tool UX or client layout
- Removal of host-only tools that are not runtime-reserved built-ins
- Unrelated MCP server tooling that does not duplicate a runtime-reserved built-in name

## Acceptance Criteria

- [ ] `core/` no longer publishes separate built-in tool definitions under runtime-reserved public names once the migration is complete.
- [ ] No active execution path depends on a duplicate repository-owned implementation of `shell_cmd`, `load_skill`, `ask_user_input`, `human_intervention_request`, `web_fetch`, `read_file`, `write_file`, `list_files`, or `grep`.
- [ ] Tool catalogs and registry paths no longer synthesize duplicate public built-ins for runtime-reserved names.
- [ ] Host extra tools passed into `llm-runtime` do not redefine reserved built-in names.
- [ ] Agent World still preserves required host semantics such as scoping, approvals, persistence, replay, and user-visible event ordering for affected tool flows.
- [ ] Repository-owned tests that only validated duplicate built-in implementations are removed or replaced with integration-boundary coverage.
- [ ] Active docs describe one canonical owner for runtime-reserved built-in tools.
- [ ] Build, typecheck, and relevant targeted tests pass without the duplicate built-ins present.

## User Stories

### Story 1: Runtime maintainer

**As a** runtime maintainer  
**I want** `llm-runtime` to be the only public owner of reserved built-in tool names  
**So that** Agent World no longer carries a second overlapping built-in surface.

### Story 2: Product maintainer

**As an** Agent World maintainer  
**I want** duplicate built-ins removed without breaking host semantics  
**So that** the runtime boundary is simpler but the product still behaves correctly.

### Story 3: Test maintainer

**As a** test maintainer  
**I want** duplicate-implementation tests removed or replaced with boundary tests  
**So that** the suite validates the real ownership boundary instead of obsolete duplicates.

## Open Questions

1. Resolved in AP/AR: runtime-reserved built-ins move to one canonical runtime-backed tool resolver; `mcp-server-registry` must stop owning public built-in registrations and remain MCP infrastructure only.
2. Resolved in AP/AR: thin duplicates may be deleted as soon as all active consumers move to the canonical runtime-owned surface, but rich duplicates (`shell_cmd`, `web_fetch`, `load_skill`, `write_file`) require parity hooks or a non-public host integration seam before their public duplicate implementations can be deleted.
3. Resolved in AP/AR: historical persisted tool calls may keep private compatibility replay adapters, but those adapters must not remain tool-catalog-visible public built-in implementations for new calls.

## Architecture Review Notes (AR)

### High-Priority Issues Found And Resolved

- Split resolver risk: the original requirement did not name the canonical migration seam for non-LLM execution paths, which would allow `getMCPToolsForWorld(...)` to keep reintroducing duplicate built-ins.
  - Resolution: require one runtime-backed canonical tool resolver for runtime-reserved names and remove public built-in ownership from `mcp-server-registry`.
- Premature deletion risk: deleting rich duplicate tools before runtime parity exists would regress approvals, replay, SSE streaming, artifact envelopes, or other required host semantics.
  - Resolution: require phased deletion with an explicit parity gate for `shell_cmd`, `web_fetch`, `load_skill`, and `write_file`.
- Historical replay risk: old persisted tool calls and pending transcripts could become unresumable if duplicate implementations disappear with no compatibility path.
  - Resolution: allow private replay-only compatibility adapters while forbidding continued public duplicate ownership for newly executed tool calls.