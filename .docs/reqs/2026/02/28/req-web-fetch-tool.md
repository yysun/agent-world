# Requirement: Built-in `web_fetch` Tool for Lightweight Web Content Fetch as Markdown

**Date**: 2026-02-28  
**Type**: Feature Addition  
**Component**: Core built-in tools / web content retrieval

## Overview

Add a built-in tool named `web_fetch` that lets the agent fetch content from the web through lightweight HTTP retrieval and return extracted results as Markdown.

## Goals

- Enable the agent to reliably read public web content directly from tool calls.
- Keep implementation lightweight and fast without introducing heavy browser-rendering engines.
- Produce clean Markdown output suitable for summarization, analysis, and downstream agent processing.

## Functional Requirements

### REQ-1: Tool Availability

- The world toolset **MUST** include a built-in tool named `web_fetch`.
- `web_fetch` **MUST** be discoverable and invokable through the same built-in tool pathway used by other core tools.

### REQ-2: Input Contract

- `web_fetch` **MUST** accept a target URL as required input.
- `web_fetch` **MUST** reject missing or invalid URLs with clear, actionable validation errors.
- URL schemes other than `http` and `https` **MUST NOT** be fetched.

### REQ-3: Lightweight Fetch-Only Behavior

- `web_fetch` **MUST** use lightweight network retrieval only (no browser automation / no JavaScript runtime page rendering).
- The tool **MUST** extract content from directly fetched response payloads (for example HTML/text responses).
- For pages whose meaningful content depends on client-side JavaScript rendering, the tool **MUST** return a clear limitation notice instead of attempting heavy rendering.

### REQ-4: Markdown Output Contract

- `web_fetch` **MUST** return content in Markdown format.
- Output **MUST** preserve meaningful document structure when present (headings, paragraphs, lists, links, tables/code blocks when available).
- Output **MUST** remove or avoid non-content noise where feasible (navigation chrome, repeated boilerplate, script/style payloads).
- Tool result **SHOULD** include source metadata (at minimum resolved URL; title when available).

### REQ-5: Deterministic Limits and Safety

- `web_fetch` **MUST** enforce bounded runtime/resource limits (for example timeout and output-size constraints) to prevent unbounded execution.
- On limit exceedance, the tool **MUST** fail safely or return truncated/partial output with explicit reason.
- Fetching local-only or unsafe targets (for example loopback/private network paths) **MUST** be denied unless explicitly allowed by existing project policy.

### REQ-6: Error Handling

- Network failures, navigation failures, HTTP errors, render-time errors, and conversion errors **MUST** return clear error responses.
- Error responses **SHOULD** include enough context for user action (input URL, high-level failure category, retryability hint when meaningful).

## Non-Functional Requirements

### Compatibility

- Existing built-in tools and existing MCP tool behavior **MUST** remain unchanged.
- `web_fetch` **MUST** integrate without requiring changes to user prompts that do not invoke it.

### Reliability

- Behavior **SHOULD** be deterministic for the same URL under similar page state and network conditions, within declared limits.
- The tool **MUST** avoid hanging calls and return within configured timeout boundaries.

### Security

- The tool **MUST** treat fetched content as untrusted input.
- The tool **MUST NOT** execute downloaded scripts.

## Scope

### In Scope

- New built-in `web_fetch` tool registration and invocation.
- Lightweight web page retrieval from direct network responses.
- Conversion of extracted content into Markdown response payloads.
- Validation, limits, and error behavior for tool calls.

### Out of Scope

- Full website crawling/multi-page site map traversal.
- Authenticated session automation and credential management.
- Archival/snapshot storage of fetched pages beyond standard tool result payload.

## Acceptance Criteria

- [ ] `web_fetch` appears in built-in tools for a world with no MCP config.
- [ ] Calling `web_fetch` with a valid `https://` URL returns a Markdown payload.
- [ ] Calls to pages requiring client-side rendering return a clear limitation outcome.
- [ ] Invalid URL input is rejected with a clear validation error.
- [ ] Non-HTTP(S) schemes are rejected.
- [ ] Timeout/size limit scenarios return explicit limit-related outcomes.
- [ ] Errors are user-actionable and do not crash the runtime.
- [ ] Existing tool behavior remains backward compatible.

## Architecture Review Notes (AR)

### Decision

- Keep `web_fetch` as a built-in tool aligned with existing core tool registration and execution flow.
- Keep the tool fetch-only and lightweight; do not add heavy browser-rendering dependencies.
- Require normalized Markdown output as the canonical return format to improve downstream LLM/tool interoperability.

### Tradeoffs

- **Lightweight fetch-only behavior (selected)**:
  - Pros: fast, simple, and low dependency/runtime cost.
  - Cons: cannot resolve content rendered only after client-side JavaScript execution.
- **Markdown as canonical output (selected)**:
  - Pros: readable, portable, and model-friendly format.
  - Cons: may lose some presentation fidelity from original HTML.
