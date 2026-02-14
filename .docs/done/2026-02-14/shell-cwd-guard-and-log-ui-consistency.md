# Shell CWD Guard and Log UI Consistency

**Date**: 2026-02-14  
**Type**: Bug Fix + Security Hardening + UI Consistency

## Overview

Implemented strict `shell_cmd` working-directory enforcement so runtime execution always uses trusted world context and rejects out-of-scope requests. Added richer error details for tool failures and aligned log/system message typography with agent messages in web and Electron chat UIs.

## Implementation

- Core runtime and tool execution:
  - Enforced trusted working directory resolution from world/tool context in `core/shell-cmd-tool.ts`.
  - Added strict mismatch rejection for model-provided `directory` values outside the world `working_directory`.
  - Added scope validation for command/path arguments, including:
    - relative escape forms (for example `./../../...`)
    - option assignment forms (for example `--flag=/path`)
    - short option prefix forms (for example `-I/path`)
  - Added inline script execution guard for interpreter eval modes (for example `sh -c`, `node -e`, `python -c`, `powershell -Command`) to prevent embedded path bypass.
  - Fixed validation-result typing by ensuring `executionId` is included in validation error formatting.

- Orchestration and tool-call display:
  - Added shell directory/scope guard checks before tool execution in `core/events/orchestrator.ts`.
  - Forced shell execution cwd to trusted world cwd in orchestrator execution path.
  - Updated tool-call display payloads to include trusted `workingDirectory` and preserve requested `directory` for diagnostics.
  - Updated tool execution metadata emission to report trusted directory for `shell_cmd`.

- Prompt context:
  - Updated `prepareMessagesForLLM` in `core/utils.ts` to append:
    - `working directory: <world working_directory or ./ fallback>`
  - Ensures the model consistently receives explicit cwd context.

- Electron/Web UI:
  - Added structured tool error detail formatting in Electron log message rendering and status-bar fallback:
    - includes error/message plus `toolCallId` and `agent` when available.
  - Unified system/log message typography with agent message typography:
    - Electron renderer removed monospace log-line override.
    - Web world chat log styles now inherit regular message font.

## Testing

- Added new test file:
  - `tests/core/prepare-messages-for-llm.test.ts`
    - verifies system prompt cwd suffix with configured and default cwd.

- Expanded shell guard tests:
  - `tests/core/shell-cmd-tool.test.ts`
  - `tests/core/shell-cmd-integration.test.ts`
  - covers directory mismatch rejection, out-of-scope paths, short-option path prefixes, and inline script guard rejection.

- Validation commands run:
  - `npx vitest run tests/core/shell-cmd-tool.test.ts tests/core/shell-cmd-integration.test.ts tests/core/prepare-messages-for-llm.test.ts`
  - `npm run check --workspace=core`
  - `npm run check --workspace=web`
  - `npm run renderer:build --prefix electron`

## Related Work

- `.docs/done/2026-02-13/shell-process-management.md`
- `.docs/done/2026-02-13/world-variables-env-text.md`
