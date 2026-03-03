# Requirement: Built-in `write_file` Tool with Trusted-Scope Security

**Date**: 2026-02-28  
**Type**: Feature Addition and Security Policy  
**Component**: Core built-in file tools

## Overview

Add a built-in tool named `write_file` that allows the agent to create or update files in the workspace while preserving the same trust-boundary protections and deterministic behavior used by other core tools.

## Goals

- Enable safe file creation and modification through a first-class built-in tool.
- Reuse existing trusted-directory and path-validation security model.
- Keep write behavior explicit, deterministic, and auditable.

## Functional Requirements

### REQ-1: Tool Availability

- The world toolset **MUST** include a built-in tool named `write_file`.
- `write_file` **MUST** be discoverable and invokable through the same built-in tool pathway used by other core tools.

### REQ-2: Input Contract

- `write_file` **MUST** accept a target file path and content payload.
- The path input **MUST** support relative paths resolved from trusted working directory context.
- Missing or invalid input fields **MUST** return clear validation errors.

### REQ-3: Trusted Scope Enforcement

- `write_file` **MUST** resolve target paths against the trusted working directory used by other file/shell tools.
- Attempts to write outside trusted scope **MUST** be denied with explicit errors.
- Path traversal attempts and equivalent bypass patterns **MUST** be rejected.

### REQ-4: Write Mode Semantics

- `write_file` **MUST** provide explicit mode behavior for at minimum:
  - create-only (fail if file already exists)
  - overwrite (replace file content)
- If append behavior is supported, it **MUST** be explicitly requested and deterministic.
- Default behavior **MUST NOT** be ambiguous.

### REQ-5: Directory and File Handling

- `write_file` **MUST** support writing to nested paths inside trusted scope.
- Parent-directory creation behavior **MUST** be deterministic and documented.
- Writes to directories (instead of files) **MUST** be rejected with actionable errors.

### REQ-6: Output Contract

- Successful responses **MUST** return machine-readable structured output.
- Result payload **MUST** include resolved target path and operation status.
- Result payload **SHOULD** include metadata useful for auditing (for example bytes written and whether file was created or updated).

### REQ-7: Error Handling

- Validation failures, scope violations, I/O failures, and mode conflicts **MUST** produce clear error responses.
- Error responses **SHOULD** include enough context for correction without exposing sensitive system details.

## Non-Functional Requirements

### Security

- The tool **MUST** follow the same trust-boundary model as existing core file/shell tools.
- The tool **MUST NOT** allow writes outside trusted scope through symlink/path-bypass tricks that are already covered by existing validation policy.

### Reliability

- Behavior **MUST** be deterministic for identical inputs and filesystem state.
- The tool **MUST** avoid partial-success ambiguity in its response semantics.

### Compatibility

- Existing built-in tool contracts (`read_file`, `list_files`, `grep`, etc.) **MUST** remain unchanged.

## Scope

### In Scope

- New built-in `write_file` tool definition and registration.
- Input validation and trusted-scope path enforcement.
- Deterministic write modes and structured output/error responses.

### Out of Scope

- Recursive bulk write/copy operations.
- Binary patching/diff-merge engines.
- Permission elevation or writes outside trusted runtime scope.

## Acceptance Criteria

- [ ] `write_file` appears in built-in tools for a world with no MCP config.
- [ ] Valid in-scope create request writes a new file and returns success metadata.
- [ ] Create-only mode rejects writes when target already exists.
- [ ] Overwrite mode replaces existing file content deterministically.
- [ ] Out-of-scope path requests are rejected with explicit trust-boundary errors.
- [ ] Invalid/missing input is rejected with actionable validation errors.
- [ ] Directory-target write attempts are rejected.
- [ ] Existing built-in tools remain backward compatible.

## Architecture Review Notes (AR)

### Decision

- Add `write_file` as a built-in core tool adjacent to existing file tools.
- Reuse existing trusted working-directory resolution and scope-validation primitives.
- Keep write modes explicit and default-safe to avoid accidental destructive writes.

### Tradeoffs

- Explicit mode requirements add small input complexity but improve safety and predictability.
- Strict trust-boundary enforcement may block some power-user paths but preserves runtime security guarantees.
