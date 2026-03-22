# Requirement: Skill Script Location and Execution Context

**Date**: 2026-02-24
**Type**: Feature
**Status**: Draft

> Historical note: this requirement assumes scripts referenced by `SKILL.md` are executed during `load_skill`.
> That assumption was superseded on 2026-03-22 by [req-load-skill-no-auto-script-run.md](../../03/22/req-load-skill-no-auto-script-run.md).
> The path-resolution guidance remains useful if/when the LLM later requests an explicit execution tool call.

## Overview

Define the standard for how agents resolve and execute scripts referenced in a `SKILL.md` file. The rules must ensure portability across different agent implementations and predictable behavior for scripts that manipulate the user's project.

## Goals

- Scripts can reliably locate their own bundled resources (e.g., `assets/`, `references/`) regardless of where the agent is running.
- Scripts that operate on project files do so in the user's active project directory, not the skill folder.
- Behavior is consistent whether the skill is a project-level or user-level (global) skill.

## Functional Requirements

- **REQ-1**: Agents must resolve all script paths to absolute paths using the Skill Root Directory (the folder containing `SKILL.md`) as the base.
  - Example: A SKILL.md reference to `scripts/cleanup.sh` in skill root `~/.agentskills/my-skill/` must resolve to `~/.agentskills/my-skill/scripts/cleanup.sh`.

- **REQ-2**: Scripts must be executed with the **Current Project Directory** (the user's active working directory) as the shell's working directory (CWD), not the skill root.
  - This allows scripts to naturally read and write the user's project files using relative paths.

- **REQ-3**: Scripts must not assume that their own bundled resources (files in `assets/`, `references/`, or elsewhere inside the skill root) are accessible via relative paths from the shell CWD.
  - Scripts that require access to their own bundled resources must determine their own location at runtime using standard language features (e.g., `__file__` / `os.path.dirname` in Python, `__dirname` in Node.js).

- **REQ-4**: For user-level (global) skills located outside the project tree, the agent must:
  - Resolve the script to its absolute path (derived from the skill root, per REQ-1).
  - Execute it with the user's Current Project Directory as the CWD (per REQ-2).

## Non-Functional Requirements

- **NFR-1 (Portability)**: The resolution and execution rules must be consistent regardless of whether the skill is a project-level or user-level skill.
- **NFR-2 (Predictability)**: Given the same script reference and the same project directory, the resolved absolute script path and execution CWD must be deterministic.

## Constraints

- Agents must not pass the skill root as the CWD at execution time, as this breaks scripts designed to operate on project files.
- Script path resolution must not depend on the shell's current directory — only the skill root.

## Out of Scope

- How scripts are invoked (interpreter, arguments) — covered separately.
- HITL approval flow for script execution.
- Script discovery rules (which patterns in SKILL.md trigger resolution).

## Acceptance Criteria

- [ ] Scripts referenced in SKILL.md are resolved to absolute paths relative to the skill root.
- [ ] Scripts are executed with the user's Current Project Directory as CWD.
- [ ] Global/user-level skill scripts execute with the project directory as CWD (not the skill root or user home).
- [ ] Scripts that self-locate using `__file__` / `__dirname` can access their bundled resources correctly.
