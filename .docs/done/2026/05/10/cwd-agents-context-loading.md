# CWD AGENTS.md Context Loading

**Date**: 2026-05-10  
**Type**: Feature + Prompt Assembly Refactor + Regression Coverage

## Overview

Completed support for loading `AGENTS.md` from the agent's effective working directory during LLM prompt construction.

The runtime now injects the file contents as project instructions when `<working_directory>/AGENTS.md` exists and is readable, while keeping missing or unreadable files non-fatal. Prompt assembly was also refactored so the final system prompt is composed step by step instead of relying on heading-based string insertion.

## What Changed

### 1) Project-local `AGENTS.md` prompt injection

- Added CWD-local prompt loading in `core/utils.ts`.
- Implemented exact-path resolution for `<effective working directory>/AGENTS.md`.
- Added non-fatal handling for:
  - missing file (`ENOENT`) -> no injected project section
  - unreadable file -> warning log + no injected project section
- Injected only the file contents as the project-instruction payload wrapped in the existing prompt section envelope.

### 2) Structured system prompt composition

- Added `SystemPromptSections` in `core/types.ts` to represent:
  - authored system prompt
  - runtime guidance sections
  - project instruction section
  - skill section
- Added `composeSystemPromptFromSections()` in `core/utils.ts`.
- Updated `prepareMessagesForLLM()` to build the system prompt from structured sections in the required precedence order:
  1. built-in/runtime guidance
  2. project `AGENTS.md`
  3. skill guidance

### 3) Runtime prompt-order fix

- Refactored `core/llm-runtime.ts` so runtime tool guidance is applied before transient prompt metadata is stripped.
- Added `prepareMessagesForRuntime()` so the real execution path now:
  1. filters client-side/orphaned messages
  2. appends runtime tool rules while structured sections are still available
  3. strips transient/custom fields before provider transport
- Preserved fallback behavior for unstructured system prompts by appending runtime tool guidance without heading-based search/replace.

## Tests and Verification

Added and updated targeted regression coverage in:

- `tests/core/prepare-messages-for-llm.test.ts`
- `tests/core/append-tool-rules.test.ts`

Covered cases include:

- readable `AGENTS.md` is injected
- missing `AGENTS.md` is a no-op
- unreadable `AGENTS.md` is non-fatal
- changing working directories re-evaluates `AGENTS.md`
- runtime tool guidance remains ordered before project instructions and skill guidance
- the real runtime-preparation pipeline preserves structured prompt ordering and strips transient metadata before transport
- literal `## Project Instructions` / `## Agent Skills` prose in authored prompts does not trigger heading-based insertion behavior

Validation command run:

- `npx vitest run tests/core/prepare-messages-for-llm.test.ts tests/core/append-tool-rules.test.ts`

Result:

- **2 test files passed**
- **15 tests passed**

## Residual Notes

- The targeted Vitest run still emits the pre-existing sqlite mock stderr from the current test harness, but the prompt-assembly suites pass cleanly.
- Verification for this story was unit-scoped; no broader integration or E2E pass was run as part of DD.

## Related Docs

- `.docs/reqs/2026/05/10/req-cwd-agents-context-loading.md`
- `.docs/plans/2026/05/10/plan-cwd-agents-context-loading.md`