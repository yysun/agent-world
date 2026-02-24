# Requirement: World Variables (.env Text) System

**Date:** 2026-02-12  
**Type:** Feature Enhancement  
**Status:** ✅ Implemented

## Overview

Add a world-level configuration field named `variables` that stores `.env`-style text (multiline string). The system must parse this text into key-value entries at runtime and use those values for:

1. world env value lookup APIs,
2. template interpolation (`{{ variable }}`) in agent system prompts before each LLM call,
3. tool behavior (e.g., shell default directory from `working_directory`).

## Goals

1. Provide a single text-based config field for world variables
2. Support runtime interpolation in system prompts using parsed env values
3. Expose world API to get env value by key
4. Keep behavior backward-compatible for worlds without `variables`
5. Ensure no prompt mutation at storage time
6. Let Electron users set world `working_directory` from the input-area `Project` button

## Functional Requirements

### REQ-1: World Variables Storage as Text

- World interface MUST support `variables?: string`
- `variables` MUST contain `.env`-style content (newline-separated entries)
- Empty string and undefined MUST both be valid
- Existing worlds without `variables` MUST continue to load
- Variables text MUST persist in all storage backends (file, SQLite, memory)

**Acceptance:**
- World can be created/updated with `variables` text
- Text persists and reloads correctly
- Backward compatibility maintained

### REQ-2: Env Parsing and Lookup API

- A parser MUST convert world `variables` text into `Record<string, string>` at runtime
- Parser MUST support:
  - comments starting with `#`
  - blank lines
  - `KEY=value` entries
  - optional whitespace around key and `=`
- Last definition wins for duplicate keys
- Invalid lines MUST be ignored (with debug logging), not crash

- World-facing APIs MUST include:
  - `getWorldVariablesText(worldId): string`
  - `setWorldVariablesText(worldId, variablesText): Promise<World | null>`
  - `getWorldEnvValue(worldId, key): Promise<string | undefined>`
  - `getWorldEnvMap(worldId): Promise<Record<string, string>>`

**Acceptance:**
- `.env` text parses deterministically
- `getWorldEnvValue` returns expected value or `undefined`
- Invalid lines do not break processing

### REQ-3: World Convenience API

- World runtime API (World manager surface) MUST expose convenience methods:
  - `setVariablesText(variablesText)`
  - `getVariablesText()`
  - `getEnvValue(key)`
  - `getEnvMap()`

**Acceptance:**
- Convenience methods delegate to manager functions correctly
- Type safety maintained

### REQ-4: System Prompt Template Interpolation

- Agent system prompts MUST support `{{ variable }}` syntax
- Interpolation MUST run each time before LLM invocation
- Interpolation source MUST be parsed world env map from `variables` text
- Undefined variables MUST resolve to empty string
- Multiple placeholders in same prompt MUST all be replaced
- Placeholder lookup MUST be case-sensitive
- Stored system prompt MUST remain unchanged

**Acceptance:**
- `{{ working_directory }}` and other placeholders resolve correctly
- Undefined placeholders do not crash
- Updates to world variables text affect next LLM call immediately

### REQ-5: Shell Command Directory Enforcement

- Shell command tool MUST resolve directory as:
  1. explicit `directory` parameter if provided,
  2. else `working_directory` from world env map,
  3. else return clear error.
- If neither explicit `directory` nor world `working_directory` exists, shell command tool MUST NOT execute any command.
- Tool description MUST explain this precedence

**Acceptance:**
- No-directory shell calls use world env `working_directory`
- Explicit `directory` always overrides env value
- Missing both returns actionable error and command is not executed

### REQ-6: Electron `Project` Button Working Directory Binding

- In the Electron app, the `Project` button in the user input area MUST allow selecting a folder.
- After folder selection, the app MUST set the selected path into current world's env as `working_directory`.
- The update MUST persist to world `variables` text (`.env` style) so it affects future turns.
- If user cancels folder selection, world variables MUST remain unchanged.

**Acceptance:**
- Selecting a folder updates world `working_directory` in persisted world variables text
- Next shell command without explicit `directory` uses selected folder
- Cancel flow performs no update

## Non-Functional Requirements

### Performance

- Interpolation + env parse overhead MUST remain low (< 1ms typical per call)
- Env lookup MUST be O(1) on parsed map

### Security

- Interpolation MUST be plain string substitution only (no eval)
- Parser MUST not execute code
- Invalid `.env` syntax MUST fail safe (ignore line, log debug)

### Compatibility

- No DB migration required if `variables` stays optional
- Existing prompts without template syntax work unchanged

## Constraints

### Technical

- Must integrate with existing LLM message preparation flow
- Must work with all storage backends
- Must not break existing world/agent APIs

### Business

- Must follow project coding standards
- Must include test coverage for parser, lookup, interpolation, and shell resolution

## Acceptance Criteria

- [x] World interface updated to `variables?: string`
- [x] Parser for `.env`-style variables implemented
- [x] World manager exposes env text and lookup APIs
- [x] World convenience methods expose `getEnvValue` and env accessors
- [x] Agent system prompt interpolation uses world env values per LLM call
- [x] Shell command fallback uses `working_directory` env value
- [x] Shell command is blocked when both explicit directory and world `working_directory` are missing
- [x] Electron `Project` button sets selected folder as world `working_directory`
- [x] Unit tests cover parsing and interpolation edge cases
- [x] Integration tests verify behavior across storage backends
- [x] Documentation updated with `.env` examples
- [x] No breaking changes to existing functionality

## User Stories

### Story 1: Set Working Directory Once

**As a** world administrator  
**I want to** set `working_directory` in world `variables` text  
**So that** shell commands use it by default

**Acceptance:**
- Can set:
  ```env
  working_directory=/path/to/project
  ```
- Shell command without `directory` uses that value
- Explicit `directory` still overrides

### Story 2: Dynamic System Prompt by World Config

**As an** agent creator  
**I want** `{{ variable }}` placeholders in system prompt  
**So that** prompt behavior follows world env values

**Acceptance:**
- Prompt like `Project: {{ project_name }}` resolves before each LLM call
- Changing world `variables` text updates next call output

### Story 3: Set Working Directory from Electron UI

**As a** desktop app user  
**I want to** click `Project` and select a folder  
**So that** my world `working_directory` is set automatically

**Acceptance:**
- Chosen folder is stored as `working_directory` in world variables text
- If folder picker is canceled, no world update occurs

## Out of Scope

- Complex template logic (conditionals, loops, filters)
- Non-system-message interpolation
- Secret management / encryption
- Environment variable inheritance
- UI editor for `.env` content

## Dependencies

- `core/types.ts` (`World` field change)
- `core/managers.ts` (env API + convenience methods)
- `core/utils.ts` (interpolation and parser usage in message prep)
- `core/shell-cmd-tool.ts` (directory resolution fallback)
- Electron input UI and main/preload bridge for folder selection + world variable update
- storage modules for persistence compatibility

## Notes

- Recommended placeholder style: `{{ variable_name }}`
- Recommended variable naming: `snake_case`
- Parser should be intentionally simple and deterministic
