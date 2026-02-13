# Main Agent Routing and Agent Auto Reply

**Date**: 2026-02-13  
**Type**: Feature

## Overview
Implemented two new configuration controls:
- World-level `mainAgent` routing to force incoming user messages to a single agent by injecting a leading `@mention`.
- Agent-level `autoReply` (default `true`) to control whether sender-targeted auto-mention replies are applied.

## Implementation
- Added `mainAgent` to world create/update/runtime types and API serialization/validation.
- Added `autoReply` to agent create/update/runtime types and API serialization/validation.
- Added SQLite migration `0014_add_main_agent_and_auto_reply.sql`:
  - `worlds.main_agent` (TEXT nullable)
  - `agents.auto_reply` (INTEGER NOT NULL DEFAULT 1)
- Updated SQLite persistence and restore flows to store/load both fields.
- Updated runtime routing in subscribers:
  - Human messages are rewritten to `@mainAgent ...` only when no paragraph-beginning mention exists.
  - Agent-name values are resolved to agent IDs for mention compatibility.
  - Invalid/unresolvable `mainAgent` values are ignored (no message rewrite).
- Updated response handling to skip sender auto-mention when `agent.autoReply === false`.
- Added web world edit form field for `mainAgent` and web agent edit toggle for `autoReply`.
- Added electron world edit panel field for `mainAgent` and electron agent edit panel toggle for `autoReply`.
- Updated electron IPC serialization/handlers to load/save `mainAgent` and `autoReply` values in panel flows.
- Updated electron renderer agent projection to preserve persisted `autoReply` values during edit/save.

## Testing
- Added `tests/core/events/main-agent-routing.test.ts` (6 tests).
- Added `tests/core/events/agent-auto-reply.test.ts` (2 tests).
- Ran targeted tests for both new suites.
- Ran full `npm test` successfully (67 files, 718 tests).

## Related Work
- Requirement: `.docs/reqs/2026-02-13/req-main-agent-routing-and-auto-reply.md`
- Plan: `.docs/plans/2026-02-13/plan-main-agent-routing-and-auto-reply.md`
