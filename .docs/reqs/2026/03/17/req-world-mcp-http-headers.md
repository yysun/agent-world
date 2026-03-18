# Requirement: World MCP HTTP Header Support

**Date**: 2026-03-17  
**Type**: Feature  
**Component**: `core` (MCP config parsing/runtime), `server` (world API/runtime status), `electron` and `web` (world config validation/editing)  
**Architecture Note**: World MCP configuration remains stored as the world's existing `mcpConfig` JSON string and persisted to the world's `mcp.json` file. Header support extends the JSON contract for URL-based MCP servers; it does not introduce a new DB column or separate auth settings store.

## Overview

Allow a world's MCP config JSON to define per-server HTTP headers for remote MCP endpoints that use `http`, `streamable-http`, or `sse` transports.

This enables world-local configuration of authenticated remote MCP servers such as Google Stitch and other hosted MCP endpoints that require API keys, bearer tokens, or vendor-specific headers.

The feature must support the existing MCP JSON shape used in worlds, including both top-level `servers` and `mcpServers` fields.

## Problem

Worlds can already store MCP config JSON, but the product does not yet define a complete user-facing contract for request headers on remote MCP servers.

That gap causes four practical problems:

1. Users cannot reliably configure remote MCP endpoints that require custom authentication headers from the world editor alone.
2. Validation and persistence behavior for header-bearing MCP config is not clearly defined across world save/load, import/export, and frontend editors.
3. Runtime behavior for header application is not explicitly guaranteed across HTTP-based MCP transports and reconnect flows.
4. Secret-bearing headers risk accidental leakage if product surfaces echo raw header values in logs, status APIs, or diagnostics.

## Supported Config Shape

The world MCP config JSON must accept the following shape for URL-based servers:

```json
{
  "mcpServers": {
    "stitch": {
      "url": "https://stitch.googleapis.com/mcp",
      "headers": {
        "X-Goog-Api-Key": "YOUR-API-KEY"
      }
    }
  }
}
```

Equivalent support must apply when the top-level container is `servers` instead of `mcpServers`.

## Functional Requirements

### REQ-1: World MCP JSON Contract

- A URL-based MCP server definition inside `servers` or `mcpServers` MAY include an optional `headers` object.
- `headers` MUST be interpreted as a map of HTTP header name to header value.
- Header names and values MUST be strings.
- Header casing MUST be preserved as authored in the world config.
- Header support applies to URL-based MCP entries using:
  - implicit remote default transport when `url` is present without an explicit transport
  - explicit `transport: "http"`
  - explicit `transport: "streamable-http"`
  - explicit `transport: "sse"`
  - legacy `type: "http" | "streamable-http" | "sse"`
- Stdio server definitions remain unchanged and do not gain new header semantics.

### REQ-2: Validation Behavior

- World config validation in all editing surfaces MUST accept valid header-bearing MCP JSON.
- Validation MUST reject malformed `headers` definitions, including:
  - non-object `headers`
  - array-valued `headers`
  - header entries whose names are empty after JSON parsing
  - header entries whose values are not strings
- Rejection MUST be explicit and actionable; invalid `headers` data must not be silently ignored or dropped.
- Unknown header names remain allowed so vendor-specific auth schemes can work without product changes.

### REQ-3: Persistence And Round-Trip Integrity

- When a world containing MCP headers is created, updated, saved, loaded, exported, imported, or duplicated, the MCP header structure MUST round-trip without loss.
- The saved `mcpConfig` payload MUST preserve the authored `headers` object for each URL-based server.
- World import/export flows MUST preserve headers as part of the MCP config contract.
- A world edit that changes unrelated fields MUST NOT strip or rewrite existing MCP headers.

### REQ-4: Runtime Request Behavior

- For URL-based MCP servers, configured headers MUST be attached to outbound transport HTTP requests for that server.
- This requirement applies to:
  - initial remote server connection
  - follow-up requests used by streamable HTTP transports
  - SSE connection establishment and any transport-owned follow-up HTTP requests
  - reconnection attempts after transport interruption
- Worlds using the same remote URL but different headers MUST remain isolated so one world's auth headers do not bleed into another world's MCP connection.
- Runtime behavior for stdio-based MCP servers remains unchanged.

### REQ-5: Security And Observability

- Raw header values MUST NOT be exposed in logs, diagnostics, or status/list APIs intended for UI display or operational inspection.
- If the product reports configured headers for observability, it MUST expose only safe metadata such as header names or a redacted representation.
- Error messages may identify that headers were configured, but MUST NOT echo secret values.

### REQ-6: Backward Compatibility

- Existing worlds without `headers` in their MCP config MUST continue to behave exactly as they do today.
- Existing worlds that already contain header-bearing MCP JSON MUST become valid supported configurations rather than undefined behavior.
- Both `servers` and `mcpServers` top-level forms remain supported.

## Non-Goals

- Variable interpolation inside header values.
- Automatic secret management or encryption for MCP headers.
- A separate dedicated UI for editing headers outside the existing world MCP JSON editor.
- Header support for stdio MCP servers.
- Provider-specific auth helpers beyond accepting arbitrary header maps.

## Acceptance Criteria

1. A world MCP config containing:
   - `mcpServers.<name>.url`
   - `mcpServers.<name>.headers`
   is accepted as valid and remains intact after save/load round-trip.
2. The same contract works with top-level `servers` as well as `mcpServers`.
3. A remote `streamable-http` MCP server receives the configured headers on connection and subsequent transport requests.
4. A remote `sse` MCP server receives the configured headers on connection and reconnect.
5. Invalid header shapes are rejected with a clear validation error instead of being silently ignored.
6. Two worlds pointing at the same remote MCP URL with different auth headers do not share a connection in a way that mixes credentials.
7. Operational logs and runtime status views do not expose raw header values.
