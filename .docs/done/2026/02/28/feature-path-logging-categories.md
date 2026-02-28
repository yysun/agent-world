# DD: Feature-Path Logging Categories for LLM and Tool Diagnostics

**Date:** 2026-02-28  
**Status:** Complete  
**Related REQ:** `.docs/reqs/2026/02/28/req-feature-path-logging-categories.md`  
**Related AP:** `.docs/plans/2026/02/28/plan-feature-path-logging-categories.md`

## Summary

Completed implementation and documentation of canonical feature-path logging for LLM/tool diagnostics, including:
- end-to-end turn tracing categories,
- LLM request/response metadata categories,
- opt-in redacted raw payload categories,
- tool request/response/error/continuation stage categories,
- final message publish-stage diagnostics,
- migration-safe dual emission for selected legacy categories.

## Completed Scope

### 1) Canonical feature-path logging categories added

- Added runtime category support and usage for:
  - `turn.trace`
  - `llm.prep`
  - `llm.request.meta`
  - `llm.request.raw`
  - `llm.response.meta`
  - `llm.response.raw`
  - `tool.call.request`
  - `tool.call.response`
  - `tool.call.error`
  - `tool.continuation`
  - `message.publish`

### 2) LLM boundary diagnostics implemented

- Added request diagnostics before provider invocation (`llm.prep`, `llm.request.meta`).
- Added response diagnostics after provider completion (`llm.response.meta`).
- Added raw request/response payload diagnostics with explicit category gating:
  - `llm.request.raw`
  - `llm.response.raw`
- Added shared payload redaction utility for sensitive keys and long-string truncation.

### 3) Tool and continuation path diagnostics aligned

- Added canonical category emission for tool-path logs via bridge utility:
  - `tool.call.request`
  - `tool.call.response`
  - `tool.call.error`
  - `tool.continuation`
- Preserved `llm.tool.bridge` compatibility path for existing bridge-focused workflows.

### 4) Turn and publish-stage visibility added

- Added turn lifecycle start/end diagnostics with duration + status under `turn.trace`.
- Added assistant publish-stage diagnostics in direct and continuation paths under `message.publish`.

### 5) Documentation updates completed

- Updated [logging-guide.md](/Users/esun/Documents/Projects/agent-world/docs/logging-guide.md) with canonical categories and feature-path presets.
- Updated [mcp-debug-logging.md](/Users/esun/Documents/Projects/agent-world/docs/mcp-debug-logging.md) to include MCP + feature-path trace presets, raw payload controls, and redaction guidance.

## CR Findings and Fixes

### Finding fixed

- **Category routing defect risk (tool bridge direction parsing):** `TOOLS->LLM` could be misclassified as continuation instead of tool response in canonical category mapping.

### Fix applied

- Updated canonical direction parsing in [tool-bridge-logging.ts](/Users/esun/Documents/Projects/agent-world/core/events/tool-bridge-logging.ts) to support singular/plural forms (`TOOL`/`TOOLS`) for request/response/error direction detection.
- Added test assertion in [tool-bridge-logging.test.ts](/Users/esun/Documents/Projects/agent-world/tests/core/events/tool-bridge-logging.test.ts) to verify `TOOLS->LLM` maps to `tool.call.response`.

### CR outcome

- No remaining high-priority issues identified in the current uncommitted feature-path logging diff after the fix above.

## Verification

### Commands executed

1. `npx vitest run tests/core/events/tool-bridge-logging.test.ts tests/core/llm-manager-feature-path-logging.test.ts tests/core/feature-path-logging.test.ts`
2. `npm run check`

### Results

- Targeted vitest suite passed: **3 files, 10 tests**.
- Type-check suite passed for monorepo check targets (`core`, `web`, `electron`).

## Key Files

- [feature-path-logging.ts](/Users/esun/Documents/Projects/agent-world/core/feature-path-logging.ts)
- [llm-manager.ts](/Users/esun/Documents/Projects/agent-world/core/llm-manager.ts)
- [tool-bridge-logging.ts](/Users/esun/Documents/Projects/agent-world/core/events/tool-bridge-logging.ts)
- [orchestrator.ts](/Users/esun/Documents/Projects/agent-world/core/events/orchestrator.ts)
- [memory-manager.ts](/Users/esun/Documents/Projects/agent-world/core/events/memory-manager.ts)
- [message-prep.ts](/Users/esun/Documents/Projects/agent-world/core/message-prep.ts)
- [logger.ts](/Users/esun/Documents/Projects/agent-world/core/logger.ts)
- [logging-guide.md](/Users/esun/Documents/Projects/agent-world/docs/logging-guide.md)
- [mcp-debug-logging.md](/Users/esun/Documents/Projects/agent-world/docs/mcp-debug-logging.md)
- [llm-manager-feature-path-logging.test.ts](/Users/esun/Documents/Projects/agent-world/tests/core/llm-manager-feature-path-logging.test.ts)
- [feature-path-logging.test.ts](/Users/esun/Documents/Projects/agent-world/tests/core/feature-path-logging.test.ts)
- [tool-bridge-logging.test.ts](/Users/esun/Documents/Projects/agent-world/tests/core/events/tool-bridge-logging.test.ts)
