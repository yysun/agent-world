# Requirement: CWD AGENTS.md Context Loading

**Date**: 2026-05-10
**Type**: Feature / Prompt Context
**Status**: ✅ Requirements Reviewed (AR Completed)

## Overview

When the runtime builds LLM conversation context for an agent turn, it must check for an `AGENTS.md` file in the agent's effective current working directory (CWD). If that file exists and is readable, its contents must be loaded into the turn context sent to the LLM.

This allows project-local agent instructions to influence runtime behavior without requiring those instructions to be manually copied into agent system prompts.

## Problem Statement

The current runtime already builds turn context from the agent system prompt, runtime prompt injections, conversation history, and working-directory-related metadata. However, it does not automatically surface a project-local `AGENTS.md` file from the active working directory.

As a result:

- users can place agent-operating instructions in the directory where the agent is actually working,
- tool execution and file access may occur relative to that directory,
- but the LLM does not see those local instructions unless they are duplicated elsewhere.

This creates drift between the runtime execution environment and the instructions visible to the model.

## Goals

- Make CWD-local `AGENTS.md` instructions available to the LLM at turn-build time.
- Keep the behavior deterministic and scoped to the agent's effective working directory.
- Preserve existing runtime behavior when no local `AGENTS.md` file is present.
- Avoid turning a missing or unreadable file into a hard turn failure.
- Make prompt-layer precedence explicit so project instructions sit between base runtime rules and task-specific skill/user inputs.

## Prompt Layer Precedence

This requirement defines the following instruction precedence for turn construction:

1. Built-in system prompt and invariant runtime rules that define how the agent operates.
2. CWD-local `AGENTS.md` instructions that define how the current project wants work done.
3. Skill-specific instructions loaded for the task when needed.
4. The current user message, which defines the immediate goal within the constraints above.

Implications:

- `AGENTS.md` may refine project-specific workflow and coding expectations, but it must not override built-in runtime, safety, or platform constraints.
- Skill instructions may add specialized task procedure, but they must not override higher-priority built-in or `AGENTS.md` constraints unless a separate requirement explicitly introduces that precedence change.
- The user message defines the requested outcome, but it must be interpreted within the limits established by built-in rules, `AGENTS.md`, and any loaded skill.

## Functional Requirements

- **REQ-1**: During LLM context construction for a turn, the runtime must resolve the agent's effective working directory using the same working-directory source already used for that turn's execution context.
- **REQ-2**: The runtime must check exactly one file path for project-local agent instructions: `<effective working directory>/AGENTS.md`.
- **REQ-3**: The runtime must not recursively scan parent directories, child directories, or sibling directories for additional `AGENTS.md` files as part of this requirement.
- **REQ-4**: If `<effective working directory>/AGENTS.md` exists, is a regular file, and is readable, the runtime must load its contents into the LLM conversation context for that turn.
- **REQ-5**: The injected `AGENTS.md` content must be included as instruction-scoped runtime context before the model produces the turn response.
- **REQ-6**: The injected `AGENTS.md` content must remain additive to existing runtime prompt/context sections; it must not replace the agent's authored system prompt, tool guidance, skill guidance, or conversation history.
- **REQ-7**: Prompt/context assembly must preserve this precedence order for turn interpretation: built-in system prompt and invariant runtime rules, then CWD-local `AGENTS.md`, then loaded skill instructions, then the current user message.
- **REQ-8**: `AGENTS.md` instructions must be interpreted as project-level operating constraints that can refine how work is done, but must not override higher-priority built-in runtime or safety rules.
- **REQ-9**: Loaded skill instructions must remain lower precedence than built-in system rules and `AGENTS.md`, and higher precedence than the current user message only for specialized task procedure.
- **REQ-10**: If no `AGENTS.md` file exists at the effective working directory, turn execution must continue with current behavior and without a hard error.
- **REQ-11**: If the file path exists but cannot be read successfully, the runtime must continue without injecting the file and must record a diagnostic signal appropriate for runtime debugging.
- **REQ-12**: The loaded content must reflect the file contents visible at the time the turn context is built for that turn; a turn must not use stale cached content from a different working directory.
- **REQ-13**: If the effective working directory changes between turns, the runtime must evaluate the `AGENTS.md` path for the new directory independently for the next turn.
- **REQ-14**: The injected local-instruction behavior must apply consistently to direct turns and continuation turns that rebuild LLM context within the same runtime boundary.

## Non-Functional Requirements

- **NFR-1 (Determinism)**: Given the same effective working directory and the same `AGENTS.md` file contents, the injected LLM context must be stable across runs.
- **NFR-2 (Reliability)**: Missing or unreadable `AGENTS.md` files must not break turn execution.
- **NFR-3 (Isolation)**: Only the active turn's effective working directory may influence which `AGENTS.md` file is loaded.
- **NFR-4 (Observability)**: Read failures and skip conditions should be diagnosable through existing runtime logging/debugging surfaces.

## Constraints

- This requirement is limited to the exact filename `AGENTS.md` in the effective working directory.
- The feature must integrate with the existing prompt/context build path rather than introducing a separate out-of-band instruction channel.
- The feature must not require users to modify saved agent system prompts just to adopt local `AGENTS.md` instructions.
- The feature must preserve prompt-layer precedence where built-in runtime rules outrank `AGENTS.md`, and `AGENTS.md` outranks loaded skill procedure and the current user request.

## Out of Scope

- Merging multiple `AGENTS.md` files from a directory tree.
- Defining precedence rules across multiple discovered `AGENTS.md` files in a root/parent/nested directory tree.
- UI/editor changes for browsing or editing `AGENTS.md`.
- Changes to skill loading, tool approval, or queue semantics unrelated to prompt/context assembly.

## Acceptance Criteria

- [ ] When the effective working directory contains a readable `AGENTS.md`, the next LLM turn includes that file's contents in the runtime instruction context.
- [ ] When the effective working directory does not contain `AGENTS.md`, turn behavior remains unchanged apart from the absence of that injected context.
- [ ] When `AGENTS.md` exists but cannot be read, the turn does not fail solely because of that read failure.
- [ ] The runtime checks only `<effective working directory>/AGENTS.md` and does not recursively search for additional instruction files.
- [ ] Changing the effective working directory causes the runtime to evaluate the new directory's `AGENTS.md` for subsequent turns.
- [ ] Direct-turn and continuation-turn prompt assembly paths apply the same local-instruction loading rule.
- [ ] Turn interpretation preserves the precedence order: built-in system/runtime rules, then `AGENTS.md`, then loaded skill instructions, then the current user message.
- [ ] `AGENTS.md` can refine project workflow but cannot override built-in runtime or safety constraints.

## References

- `core/utils.ts`
- `tests/core/prepare-messages-for-llm.test.ts`