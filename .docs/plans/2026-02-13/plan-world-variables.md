# Architecture Plan: World Variables as `.env` Text

**Date:** 2026-02-12  
**Related Requirement:** [req-world-variables.md](../../reqs/2026-02-13/req-world-variables.md)  
**Status:** ✅ Completed

## Overview

This plan implements world variables as a single `.env`-style text field (`world.variables?: string`) and adds runtime env lookup/interpolation for agent system prompts before each LLM call.

Core outcomes:
- Persist `.env` text at world level
- Parse text into env map safely at runtime
- Expose world env lookup (`getEnvValue`)
- Interpolate `{{ variable }}` in agent system prompt per LLM invocation
- Use `working_directory` env value in shell tool when no explicit directory is provided
- Let Electron `Project` button set selected folder as world `working_directory`

## Architecture Decisions

### AD-1: Single Text Field (`variables?: string`)
- Store raw `.env` content, not structured JSON map
- Keeps UX simple and editable in one place
- Parsing happens at runtime

### AD-2: Deterministic `.env` Parser
- Implement lightweight parser in core (no external dependency)
- Supported syntax:
  - `KEY=value`
  - blank lines
  - `# comments`
  - optional whitespace around key and `=`
- Last key assignment wins
- Invalid lines are ignored with debug logs

### AD-3: Runtime Interpolation on Every LLM Call
- Resolve placeholders from latest world env map each call
- Do not mutate stored prompt text
- Undefined variables resolve to empty string

### AD-4: World-level Env Lookup API
- Expose manager and world-convenience methods for env retrieval
- Main requirement method: `getEnvValue(key)`

### AD-5: Shell Directory Resolution Priority
1. explicit `directory` argument
2. world env `working_directory`
3. clear error

### AD-6: Shell Safety Guard
- If no directory can be resolved, shell command execution is aborted before spawning process.
- Error response is returned to caller with remediation guidance.

### AD-7: Electron UI as Working Directory Source
- The Electron user-input `Project` button becomes a first-class setter for world `working_directory`.
- Folder selection updates persisted world `.env` text, not transient UI state only.

## Components

### 1) Types (`core/types.ts`)
- Update `World` interface:
  - add `variables?: string`

### 2) World Manager API (`core/managers.ts`)

Add functions:
- `setWorldVariablesText(worldId, variablesText)`
- `getWorldVariablesText(worldId)`
- `getWorldEnvMap(worldId)`
- `getWorldEnvValue(worldId, key)`

Add world convenience methods (manager surface):
- `setVariablesText(variablesText)`
- `getVariablesText()`
- `getEnvMap()`
- `getEnvValue(key)`

### 3) Parser + Interpolation (`core/utils.ts`)

Add:
- `parseEnvText(variablesText?: string): Record<string, string>`
- `interpolateSystemPrompt(template: string, envMap: Record<string, string>): string`

Rules:
- Placeholder regex supports `{{ variable }}` with inner whitespace
- Case-sensitive key lookup
- Missing key -> empty string

### 4) Agent/LLM Message Prep Integration (`core/utils.ts`)

In LLM preparation flow (`prepareMessagesForLLM` path):
- load world variables text
- parse to env map
- resolve `agent.systemPrompt` via interpolation
- inject resolved system message for this call only

### 5) Shell Tool (`core/shell-cmd-tool.ts`)

Update tool execution:
- If `directory` missing, read `working_directory` from world env map
- If still missing, return clear actionable error and do not execute command
- Update tool description to explain fallback behavior

### 6) Electron `Project` Button Integration (`electron/*`, `web/*`)

- Wire `Project` button click to folder picker flow in Electron.
- On select, call world update API to set `working_directory` in `.env` text.
- On cancel, no-op.
- Keep IPC contract minimal: selected folder path + active world ID.

## Data Flow

```mermaid
flowchart TD
  A[Agent turn starts] --> B[Load world.variables text]
  B --> C[parseEnvText]
  C --> D[Load agent system prompt template]
  D --> E[interpolate {{ variable }}]
  E --> F[Create runtime system message]
  F --> G[Call LLM]
```

```mermaid
flowchart TD
  A[shell_cmd called] --> B{directory provided?}
  B -->|yes| C[use directory arg]
  B -->|no| D[getEnvValue('working_directory')]
  D --> E{found?}
  E -->|yes| F[use env working_directory]
  E -->|no| G[return error]
  C --> H[execute command]
  F --> H
```

## Implementation Phases

### Phase 1: Type + Storage Foundation
- [x] Add `variables?: string` to `World` type
- [x] Verify persistence in file storage
- [x] Verify persistence in memory storage
- [x] Verify persistence in SQLite storage
- [x] Verify backward compatibility with worlds lacking `variables`

### Phase 2: Env Parser + Lookup API
- [x] Implement `parseEnvText` utility
- [x] Implement manager API:
  - [x] `setWorldVariablesText`
  - [x] `getWorldVariablesText`
  - [x] `getWorldEnvMap`
  - [x] `getWorldEnvValue`
- [x] Add world convenience methods including `getEnvValue`

### Phase 3: Runtime Prompt Interpolation
- [x] Add interpolation function for `{{ variable }}`
- [x] Integrate into message prep before LLM call
- [x] Ensure stored system prompt remains unchanged
- [x] Handle undefined variable as empty string

### Phase 4: Shell Command Fallback Integration
- [x] Update shell tool description for env fallback
- [x] Apply directory priority logic (arg > env > error)
- [x] Add explicit error guidance when unresolved
- [x] Add hard guard: unresolved directory means no shell process spawn

### Phase 5: Electron `Project` Button Integration
- [x] Identify current input-area `Project` button event path
- [x] Add/confirm Electron folder-picker IPC bridge
- [x] Implement flow: select folder -> set world `working_directory` in `.env` text
- [x] Implement cancel handling with no world mutation
- [x] Add UI feedback/state refresh after successful set

### Phase 6: Tests

#### Unit tests
- [x] `.env` parser cases:
  - [x] comments/blank lines
  - [x] whitespace handling
  - [x] duplicate keys (last wins)
  - [x] invalid lines ignored
- [x] `getWorldEnvValue` behavior
- [x] interpolation cases (`{{ variable }}` + spacing)
- [x] undefined variable -> empty string
- [x] shell resolution priority
- [x] shell unresolved-directory guard (no execution)
- [x] Electron project button mapping logic (with mocked picker response)

#### Integration tests
- [x] End-to-end with memory backend
- [x] End-to-end with file backend
- [x] End-to-end with SQLite backend
- [x] Electron flow: project folder selection persists `working_directory`

### Phase 7: Documentation + Validation
- [x] Update docs with `.env` examples
- [x] Run targeted tests
- [x] Run full `npm test`
- [x] Validate no regression on worlds without `variables`

## Risks & Mitigation

- **Invalid `.env` syntax**: ignore invalid lines + debug logs
- **Prompt regressions**: keep interpolation runtime-only and non-mutating
- **Storage compatibility**: keep field optional and test all backends
- **Shell ambiguity**: document and enforce strict precedence order
- **Accidental shell execution without directory**: enforce no-spawn guard with tests
- **Electron IPC mismatch**: keep request/response payloads minimal and typed

## Technical Notes

### Suggested parser behavior

- Input:
  ```env
  # world settings
  project_name = agent-world
  working_directory=/Users/me/project
  INVALID LINE
  project_name=agent-world-v2
  ```

- Output map:
  - `project_name -> agent-world-v2`
  - `working_directory -> /Users/me/project`

### Suggested interpolation behavior

- Template: `Project {{ project_name }} at {{ working_directory }}`
- Missing variable replacement: empty string
- No template expressions beyond simple token replacement

## Exit Criteria

- [x] Requirement doc and plan are aligned with `.env` text model
- [x] `World.variables` implemented as optional string
- [x] World exposes env lookup including `getEnvValue`
- [x] Agent system prompt interpolation runs before each LLM call
- [x] Shell tool honors `working_directory` fallback
- [x] Shell tool does not execute when directory is unresolved
- [x] Electron `Project` button sets persisted world `working_directory`
- [x] Tests pass across storage backends

---

## Architecture Review (AR)

**Review Date:** 2026-02-12  
**Reviewer:** GitHub Copilot  
**Status:** ✅ APPROVED with implementation recommendations

### Review Summary

The revised architecture is feasible and coherent. The `.env` text model, runtime interpolation, shell safety guard, and Electron `Project` button flow fit the existing codebase with low migration risk.

### Completeness Review

- ✅ Covers world storage, runtime parsing, lookup API, and prompt interpolation lifecycle.
- ✅ Explicitly defines shell behavior when directory is unresolved (must not spawn process).
- ✅ Includes Electron UI workflow from folder picker to persisted world `working_directory`.
- ✅ Defines tests for parser, shell guard, and Electron flow.

### Feasibility Review

- ✅ **World storage (`variables?: string`)**: Optional field, no migration required.
- ✅ **Runtime interpolation**: Natural fit in current `prepareMessagesForLLM` path.
- ✅ **Shell guard**: Straightforward pre-execution check before process spawn.
- ✅ **Electron flow**: Achievable via current IPC bridge and world update APIs.

### Scalability & Performance

- ✅ Runtime parse + interpolation is lightweight for typical `.env` payload sizes.
- ✅ No new external dependencies required.
- ⚠️ Recommendation: parse once per LLM request and reuse map within that call path.

### Security & Reliability

- ✅ No eval/template execution; plain string substitution only.
- ✅ Invalid `.env` lines fail safe (ignored + debug logging).
- ✅ Shell no-directory guard prevents accidental command execution in ambiguous context.
- ⚠️ Recommendation: normalize and trim selected folder path in Electron before persisting.

### Key Clarifications (to lock before SS)

1. **Variable key format:** keep parser permissive for `.env` compatibility, but ignore malformed keys and log debug.
2. **Placeholder regex:** support `{{ variable }}` and `{{variable}}`; do not support nested expressions.
3. **Electron cancel behavior:** must be strict no-op (no write, no event side effects).
4. **Shell precedence:** retain `directory arg > world working_directory > abort` exactly.

### Test Strategy Review

- ✅ Unit tests listed are sufficient for parser and interpolation correctness.
- ✅ Shell test coverage includes “no spawn when unresolved directory.”
- ✅ Integration includes Electron picker -> persisted world variable path.
- ⚠️ Recommendation: add a regression test proving existing prompts without placeholders are unchanged.

### Verdict

✅ **APPROVED** — Proceed to SS implementation with the above clarifications and recommendations.
