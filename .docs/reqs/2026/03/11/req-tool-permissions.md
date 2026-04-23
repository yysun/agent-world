# Requirement: Built-in Tool Permission Levels

**Date**: 2026-03-11  
**Type**: Feature  
**Component**: `core` (tool execution), `server` (API schema), `web` (composer UI)  
**Architecture Note**: `toolPermission` is stored as an env key `tool_permission=<value>` inside `world.variables` (same pattern as `working_directory`) — no dedicated DB column or API schema field.  
**Related**: `core/file-tools.ts`, `core/web-fetch-tool.ts`, `core/shell-cmd-tool.ts`, `core/load-skill-tool.ts`, `core/tool-approval.ts`, `web/src/components/world-chat.tsx`

## Overview

Add three permission control levels — **Read**, **Ask**, **Auto** — that govern which built-in tools agents in a world may use and which require user approval before execution.

The permission level is a world-scoped setting: all agents in a world share the same level. It is persisted in the world's storage record and exposed via the REST API.

A dropdown to select the level is added to the web frontend composer toolbar, placed next to the existing "Project" (open project folder) button.

---

## Permission Levels

### Read
Agents may only passively inspect project content, fetch public web content, and load skill instructions. Write, shell execution, agent creation, and skill script execution are blocked.

**Allowed tools (automatic):**
- `read_file` — read project files
- `list_files` — list directory contents
- `grep` — search file contents
- `web_fetch` — fetch public web content (existing SSRF/private-network guards still apply)
- `load_skill` — load skill instruction text into agent context (read phase only; skill script execution is blocked)
- `send_message` — agent-to-agent messaging (unrelated to file/web/shell)
- `ask_user_input` / `human_intervention_request` — HITL is always available; `ask_user_input` is the preferred public alias

**Blocked tools (returns an error / refused at dispatch):**
- `write_file`
- `shell_cmd`
- `create_agent`
- Any skill script/action triggered via `load_skill`

### Ask
Agents may inspect files and fetch web docs automatically. They must get user approval before every file write, every shell command, and every skill action or script. Creating agents also requires approval.

**Allowed tools (automatic):**
- All Read-level tools ✓
- `web_fetch` — URL fetch (SSRF guards still apply)

**Tools requiring per-invocation approval (HITL):**
- `write_file` — each write requires user approval
- `shell_cmd` — every invocation requires user approval regardless of risk tier
- `load_skill` action/script execution — each script step requires user approval
- `create_agent` — requires user approval

### Auto
Agents may use all built-in tools according to their existing automatic behavior. The existing project-scope (`working_directory`), shell risk-tier logic, create-agent HITL flow, and SSRF safety guards remain active.

**Behavior summary:**
- `write_file` — automatic
- `web_fetch` — automatic
- `shell_cmd` — existing risk-tier logic
- `load_skill` (including script execution) — automatic
- `create_agent` — existing approval flow remains active
- `read_file`, `list_files`, `grep`, `send_message`, `ask_user_input` / `human_intervention_request` — unchanged

---

## Functional Requirements

### REQ-1: World-Level Permission Field

- The permission level is stored as the env key `tool_permission` inside the world's existing `variables` text field (one `KEY=value` line, same pattern as `working_directory`).
- Default value when the key is absent: `'auto'` (preserves existing behavior for all existing worlds).
- No dedicated DB column or schema migration is required.
- Read via `getEnvValueFromText(world.variables, 'tool_permission') ?? 'auto'`.
- Written via `upsertEnvVariable(variables, 'tool_permission', value)` → `PATCH /worlds/:worldName { variables: ... }`.

### REQ-2: Tool Dispatch Enforcement

- Each built-in tool's execution path **MUST** check the owning world's `toolPermission` level.
- **Read level:**
  - `write_file`, `shell_cmd`, `create_agent`, and skill script execution **MUST** return an error result (not throw) with a message indicating the tool is blocked by the current permission level.
  - `web_fetch` **MUST** remain allowed at `read`.
  - `load_skill` **MUST** load skill instructions into context but **MUST** block any script execution step.
- **Ask level:**
  - `write_file` **MUST** route every invocation through HITL approval.
  - `shell_cmd` **MUST** route every invocation through HITL approval, bypassing its existing risk-tier `allow` path.
  - `load_skill` script execution steps **MUST** route through HITL approval.
  - `create_agent` **MUST** route through HITL approval (it already does; this stays active in Ask and Auto).
  - `web_fetch` runs automatically (no additional approval beyond existing SSRF guards).
- **Auto level:**
  - All tools run as currently implemented.
  - `shell_cmd` keeps its existing risk-tier gating.
  - `create_agent` keeps its existing approval flow.

### REQ-3: REST API Exposure

- `GET /worlds/:worldName` response already includes `variables`; `tool_permission` is carried within it.
- `PATCH /worlds/:worldName` already accepts `variables`; updating `tool_permission` writes the full updated `variables` string.

### REQ-4: Web Composer Dropdown

- The composer toolbar in `web/src/components/world-chat.tsx` **MUST** include a `<select>` (or equivalent styled dropdown) for `toolPermission`.
- Placement: immediately to the right of the existing "Project" button (`.composer-project-button`).
- Options: "Read", "Ask", "Auto" (displayed labels), mapping to `'read'`, `'ask'`, `'auto'` values.
- Default selected value reflects the world's current `toolPermission` from state.
- Changing the dropdown **MUST** PATCH the world setting via the API and update the local world state.

### REQ-5: State Propagation

- When `toolPermission` changes (via PATCH), the updated value **MUST** be reflected in the loaded world state in the frontend without requiring a full page reload.
- SSE-driven world metadata refreshes **MUST** carry the `toolPermission` field so it stays in sync across clients.

### REQ-6: No Behavioral Regression for Auto

- All existing worlds without a persisted `toolPermission` default to `'auto'`.
- The `'auto'` level **MUST** produce identical tool behavior to the current implementation.

---

## Non-Goals

- Per-agent permission overrides (all agents in a world share the same level).
- Tool-level fine-grained allowlisting beyond the three levels.
- Electron-specific UI changes (Electron app may address separately).
- Audit logging of blocked tool invocations (out of scope for this iteration).

---

## Acceptance Criteria

1. Setting a world to `read`: agents cannot execute `shell_cmd`, `write_file`, `create_agent`, or skill scripts; `web_fetch` remains available; blocked calls return a clear error message.
2. Setting a world to `ask`: `write_file` and `shell_cmd` always prompt for user approval; `web_fetch` runs automatically; HITL approval flow works end-to-end.
3. Setting a world to `auto`: all tools run with no new restrictions.
4. The web composer shows the dropdown and updates the world on change.
5. Existing worlds without a persisted level default to `auto` with no behavior change.
6. Unit tests cover tool dispatch enforcement for all three levels across `shell_cmd`, `web_fetch`, `write_file`, `create_agent`, and `load_skill`.
