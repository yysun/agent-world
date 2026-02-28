# MCP Debug Logging Guide

## Overview

Use this guide when diagnosing MCP tool paths end-to-end, not just MCP server lifecycle.

MCP categories (`mcp.*`) tell you what happened at the server boundary.  
Feature-path categories (`turn.trace`, `llm.*`, `tool.call.*`, `message.publish`) tell you how the request moved through preparation, LLM calls, tool handoff, continuation, and final publish.

If you need raw payload visibility (request/response bodies), enable the raw LLM categories explicitly.

## Quick Presets

### MCP server health only

```bash
LOG_MCP_LIFECYCLE=info LOG_MCP_CONNECTION=debug LOG_MCP_TOOLS=debug npm run web:dev
```

### MCP execution + feature-path metadata (recommended default)

```bash
LOG_MCP_EXECUTION=debug LOG_TURN_TRACE=debug LOG_LLM_PREP=debug LOG_LLM_REQUEST_META=debug LOG_LLM_RESPONSE_META=debug LOG_TOOL_CALL_REQUEST=debug LOG_TOOL_CALL_RESPONSE=debug LOG_TOOL_CALL_ERROR=debug LOG_TOOL_CONTINUATION=debug LOG_MESSAGE_PUBLISH=debug npm run web:dev
```

### Full payload diagnostics (includes redacted raw request/response)

```bash
LOG_MCP_EXECUTION=debug LOG_TURN_TRACE=debug LOG_LLM_PREP=debug LOG_LLM_REQUEST_META=debug LOG_LLM_REQUEST_RAW=debug LOG_LLM_RESPONSE_META=debug LOG_LLM_RESPONSE_RAW=debug LOG_TOOL_CALL_REQUEST=debug LOG_TOOL_CALL_RESPONSE=debug LOG_TOOL_CALL_ERROR=debug LOG_TOOL_CONTINUATION=debug LOG_MESSAGE_PUBLISH=debug npm run web:dev
```

## Categories to Use

### MCP boundary categories

| Category | Purpose | Enable |
|----------|---------|--------|
| `mcp.lifecycle` | Server start/stop/ready events | `LOG_MCP_LIFECYCLE=info` |
| `mcp.connection` | Transport connection details | `LOG_MCP_CONNECTION=debug` |
| `mcp.tools` | Tool discovery/caching | `LOG_MCP_TOOLS=debug` |
| `mcp.execution` | Tool execution requests/results/errors | `LOG_MCP_EXECUTION=debug` |

### Feature-path categories (for request tracing)

| Category | Purpose | Enable |
|----------|---------|--------|
| `turn.trace` | Turn start/end with duration/status | `LOG_TURN_TRACE=debug` |
| `llm.prep` | Message preparation/filtering summary | `LOG_LLM_PREP=debug` |
| `llm.request.meta` | Outbound LLM request metadata | `LOG_LLM_REQUEST_META=debug` |
| `llm.request.raw` | Outbound LLM raw payload (redacted) | `LOG_LLM_REQUEST_RAW=debug` |
| `llm.response.meta` | Inbound LLM response metadata | `LOG_LLM_RESPONSE_META=debug` |
| `llm.response.raw` | Inbound LLM raw payload (redacted) | `LOG_LLM_RESPONSE_RAW=debug` |
| `tool.call.request` | LLM -> tool handoff stage | `LOG_TOOL_CALL_REQUEST=debug` |
| `tool.call.response` | Tool -> LLM success stage | `LOG_TOOL_CALL_RESPONSE=debug` |
| `tool.call.error` | Tool -> LLM error stage | `LOG_TOOL_CALL_ERROR=debug` |
| `tool.continuation` | Post-tool continuation/retry/cancel flow | `LOG_TOOL_CONTINUATION=debug` |
| `message.publish` | Final assistant publish stage | `LOG_MESSAGE_PUBLISH=debug` |

## What You Can Answer with These Logs

### 1. How were user messages prepared before the LLM call?

Enable:

```bash
LOG_LLM_PREP=debug npm run web:dev
```

Look for `llm.prep` entries such as prepared message counts and role distribution.

### 2. What was sent to and received from the LLM?

Enable metadata only:

```bash
LOG_LLM_REQUEST_META=debug LOG_LLM_RESPONSE_META=debug npm run web:dev
```

Enable raw payloads too:

```bash
LOG_LLM_REQUEST_RAW=debug LOG_LLM_RESPONSE_RAW=debug npm run web:dev
```

Raw logs are sanitized: fields matching sensitive key patterns (for example `apiKey`, `token`, `secret`, `authorization`, `cookie`) are redacted.

### 3. How were tools called and how did continuation proceed?

Enable:

```bash
LOG_TOOL_CALL_REQUEST=debug LOG_TOOL_CALL_RESPONSE=debug LOG_TOOL_CALL_ERROR=debug LOG_TOOL_CONTINUATION=debug LOG_MCP_EXECUTION=debug npm run web:dev
```

This shows canonical stage logs (`tool.call.*`, `tool.continuation`) plus MCP execution boundary logs.

### 4. Did the turn complete and publish a final response?

Enable:

```bash
LOG_TURN_TRACE=debug LOG_MESSAGE_PUBLISH=debug npm run web:dev
```

You’ll see turn start/end markers with duration and publish events for final assistant output.

## Legacy Bridge Category

`llm.tool.bridge` is still available for migration and condensed handoff previews:

```bash
LOG_LLM_TOOL_BRIDGE=debug npm run web:dev
```

Use it when you want quick bridge-focused logs without enabling all canonical tool categories.

## Hierarchy and Overrides

MCP categories remain hierarchical:

```bash
LOG_MCP=debug npm run web:dev
```

Equivalent to enabling all `mcp.*` children at `debug`.

You can override specific categories:

```bash
LOG_MCP=debug LOG_MCP_LIFECYCLE=info LOG_LLM_REQUEST_RAW=debug npm run web:dev
```

## Practical Filtering

```bash
# Focus only on feature-path categories
LOG_TURN_TRACE=debug LOG_LLM_REQUEST_META=debug LOG_LLM_RESPONSE_META=debug LOG_TOOL_CALL_REQUEST=debug LOG_TOOL_CALL_RESPONSE=debug LOG_TOOL_CALL_ERROR=debug LOG_TOOL_CONTINUATION=debug LOG_MESSAGE_PUBLISH=debug npm run web:dev | grep -E "TURN\\.TRACE|LLM\\.|TOOL\\.CALL|TOOL\\.CONTINUATION|MESSAGE\\.PUBLISH"

# Focus on raw payloads only
LOG_LLM_REQUEST_RAW=debug LOG_LLM_RESPONSE_RAW=debug npm run web:dev | grep -E "LLM\\.REQUEST\\.RAW|LLM\\.RESPONSE\\.RAW"
```

## Notes

1. Debug-level logging can be verbose and adds overhead. Use targeted categories when possible.
2. Raw payload logging is opt-in via `LOG_LLM_REQUEST_RAW` and `LOG_LLM_RESPONSE_RAW`.
3. Sanitization reduces risk, but review logs as potentially sensitive in secure environments only.
4. Default log level is `error`; you must explicitly enable categories to see diagnostics.

## Related Documentation

- [Complete Logging Guide](./logging-guide.md) - Full category reference and troubleshooting scenarios
- [README Logging Section](../README.md#logging-and-debugging) - Quick-start commands

This enhanced scenario-based logging provides complete visibility into MCP server communication with granular control over what you see, making it much easier to debug issues and understand what's happening during tool execution.
