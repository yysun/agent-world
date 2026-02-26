# Requirement: Import World from GitHub Shorthand

**Date**: 2026-02-25  
**Type**: Feature Enhancement  
**Component**: World Import (CLI/API/Electron/Web flows that support world import)  
**Related**: Existing world import/export behavior, world folder validation

## Overview

Add support for importing a world directly from a GitHub shorthand reference, e.g. `@awesome-agent-world/infinite-etude`, where the shorthand resolves to a concrete GitHub path containing a world folder.

Example target:

- Shorthand: `@awesome-agent-world/infinite-etude`
- Source URL: `https://github.com/yysun/awesome-agent-world/tree/main/data/worlds/infinite-etude`

## Goals

- Allow users to import worlds without manually cloning/downloading repositories first.
- Keep imported world semantics identical to existing folder-based import behavior.
- Provide clear, actionable errors for invalid shorthand, missing world path, or fetch failures.
- Preserve safety around overwrite/conflict handling.

## Functional Requirements

### REQ-1: GitHub Shorthand Input Support

World import entry points that currently accept local import sources:

- **MUST** accept a GitHub shorthand in the form `@<repo-alias>/<world-name>`.
- **MUST** support the shorthand example `@awesome-agent-world/infinite-etude`.
- **MUST** treat shorthand parsing as case-sensitive for `<world-name>` unless existing world import semantics already normalize names.

### REQ-2: Shorthand Resolution

For `@awesome-agent-world/<world-name>`:

- **MUST** resolve repository owner/name to `yysun/awesome-agent-world`.
- **MUST** resolve branch to `main` unless explicitly configurable by existing import options.
- **MUST** resolve world folder path to `data/worlds/<world-name>`.
- **MUST** fetch import data from GitHub (API or archive/raw strategy) without requiring local git tooling.

### REQ-3: Validation and Import Parity

After fetch/resolution:

- **MUST** validate fetched content using the same world-folder validation rules as local folder import.
- **MUST** run the same conflict detection/confirmation logic as existing import flow (e.g., world id/name conflicts).
- **MUST** import world data using current import semantics (world config, agents, chats/events when present).
- **MUST NOT** introduce an alternate world schema or bypass existing migration/validation paths.

### REQ-4: Error Handling and UX Feedback

- **MUST** return a clear error when shorthand format is invalid.
- **MUST** return a clear error when repo/path/branch cannot be resolved or fetched.
- **MUST** return a clear error when fetched content is not a valid world folder.
- **SHOULD** include source details in errors for debugging (resolved repo, branch, world path).

### REQ-5: Security and Trust Boundaries

- **MUST** restrict shorthand alias `awesome-agent-world` to the approved repository mapping (`yysun/awesome-agent-world`) unless user explicitly provides a full external source in a different import mode.
- **MUST** treat fetched content as untrusted input and apply existing validation guards.
- **MUST NOT** execute fetched scripts/content during import.
- **MUST** prevent path traversal when materializing fetched files (for example, reject entries that escape the temp root via `..` or absolute paths).
- **MUST** ignore or reject symbolic links in fetched content unless existing import semantics explicitly support them.

### REQ-6: Resource Limits and Deterministic Traceability

- **MUST** enforce bounded fetch limits (for example maximum file count and total downloaded bytes) to avoid unbounded memory/disk usage.
- **MUST** cleanly fail with actionable error when limits are exceeded.
- **MUST** include resolved source metadata in import result/debug details:
	- repository (`owner/repo`)
	- branch
	- world path
	- resolved commit SHA when available from the fetch mechanism
- **SHOULD** prefer immutable source reference in diagnostics (commit SHA) even when import request used branch `main`.

## Non-Functional Requirements

### Compatibility

- **MUST** preserve existing local folder import behavior unchanged.
- **MUST** not break import/export parity guarantees already established.

### Reliability

- Import from shorthand **SHOULD** be deterministic for the same shorthand and branch state.
- Network/transient fetch failures **MUST** fail safely without partial destructive writes.

## Scope

### In Scope

- Shorthand parsing and resolution for `@awesome-agent-world/<world-name>`.
- Fetching world folder content from GitHub and handing off to existing import pipeline.
- Error messages and parity validation.

### Out of Scope

- Generic GitHub shorthand support for arbitrary organizations/repositories.
- New world schema/versioning changes.
- Auto-updating imported worlds after initial import.

## Acceptance Criteria

- [ ] Import accepts `@awesome-agent-world/infinite-etude` as a valid source.
- [ ] Shorthand resolves to `yysun/awesome-agent-world`, branch `main`, path `data/worlds/infinite-etude`.
- [ ] Import fetches world content from GitHub without requiring manual clone/download.
- [ ] Fetched content is validated by the same rules as local folder import.
- [ ] Conflict handling matches existing import behavior.
- [ ] Invalid shorthand and fetch/path failures return clear actionable errors.
- [ ] Existing local world import remains unchanged.

## User Stories

### Story 1: Quick demo import
**As a** user  
**I want to** run world import with `@awesome-agent-world/infinite-etude`  
**So that** I can load the demo world in one step.

### Story 2: Safe import from remote
**As a** user  
**I want** imported GitHub content to go through normal validation/conflict checks  
**So that** remote imports are as safe as local imports.
