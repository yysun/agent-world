# DD: Built-in web_fetch Tool (Fetch-Only + Shared HITL Approval)

**Date:** 2026-02-28  
**Status:** Complete  
**Related REQ:** `.docs/reqs/2026/02/28/req-web-fetch-tool.md`  
**Related AP:** `.docs/plans/2026/02/28/plan-web-fetch-tool.md`  

## Summary

Implemented a new built-in `web_fetch` tool that performs lightweight HTTP retrieval and returns normalized Markdown with metadata, explicit limits, and deterministic error handling.

The final implementation intentionally avoids heavy browser rendering and instead:
- converts HTML/text/json responses into structured markdown output,
- extracts common SPA bootstrap JSON payloads when available,
- blocks local/private targets by default,
- allows local/private access only through HITL approval,
- reuses a shared approval helper used by multiple sensitive tools.

## Implemented Scope

### 1) New built-in tool: `web_fetch`

Added `core/web-fetch-tool.ts` with:
- schema-backed tool definition via `createWebFetchToolDefinition()`,
- required `url` input and optional controls (`timeoutMs`, `maxChars`, `includeLinks`, `includeImages`),
- deterministic output payload fields:
  - `url`, `resolvedUrl`, `status`, `ok`, `contentType`, `title`,
  - `mode` (`html`/`text`/`json`/`spa-data`/`unsupported`),
  - `markdown`, `limitationReason`, `truncated`, `timingMs`,
- deterministic error format: `Error: web_fetch failed - ...`.

### 2) Safety and local/private access control

Implemented URL and target protections in `core/web-fetch-tool.ts`:
- allow only `http`/`https`,
- reject malformed URLs,
- block loopback/private/link-local/internal targets via hostname/IP checks and DNS resolution,
- when blocked target is requested and world context exists, request HITL approval,
- deny with explicit `blocked_target` reason when approval is denied/timeout.

### 3) Fetch-only content extraction and markdown conversion

Implemented content handling paths:
- `application/json` -> fenced JSON markdown,
- `text/plain` -> fenced text markdown,
- `text/html` -> noise stripping + Turndown conversion (GFM plugin),
- SPA bootstrap extraction heuristics:
  - `__NEXT_DATA__`
  - `window.__NUXT__`
  - `window.__INITIAL_STATE__`
- bounded output truncation with explicit `truncated` flag.

### 4) Built-in registration and parameter normalization

Updated:
- `core/mcp-server-registry.ts` to register `web_fetch` in built-ins,
- `core/tool-utils.ts` alias normalization for `web_fetch` (`uri`/`href` -> `url`).

### 5) Shared approval consolidation for future tools

Added shared helper `core/tool-approval.ts` and refactored tool approval callsites to use it:
- `core/web-fetch-tool.ts`
- `core/create-agent-tool.ts`
- `core/load-skill-tool.ts`

This unifies approval mapping semantics (`approved`, `reason`, `optionId`, `source`) and reduces duplicated HITL mapping logic.

### 6) Dependency and typing updates

Added markdown conversion dependencies:
- `turndown`
- `turndown-plugin-gfm`

Updated declarations in `core/globals.d.ts` for package typing compatibility.

## Tests Added/Updated

### Added
- `tests/core/web-fetch-tool.test.ts`
- `tests/core/tool-approval.test.ts`

### Updated
- `tests/core/mcp-server-registry.test.ts`
- `tests/core/shell-cmd-integration.test.ts`
- `tests/core/tool-utils.test.ts`

## Requirement Coverage

1. **REQ-1 Tool availability:** `web_fetch` is registered in built-in toolset.
2. **REQ-2 Input contract:** URL validation + scheme restrictions enforced.
3. **REQ-3 Fetch-only behavior:** no JS runtime rendering; SPA limitation/data extraction behavior implemented.
4. **REQ-4 Markdown contract:** normalized markdown output with source metadata.
5. **REQ-5 Limits and safety:** timeout/size bounds and local/private target controls implemented.
6. **REQ-6 Error handling:** deterministic, actionable error categories/messages returned.

## Verification

### Targeted tests (latest)

1. `npm test -- tests/core/tool-approval.test.ts tests/core/web-fetch-tool.test.ts tests/core/load-skill-tool.test.ts tests/core/create-agent-tool.test.ts tests/core/mcp-server-registry.test.ts tests/core/tool-utils.test.ts`

Result:
- 6 files passed
- 58 tests passed

### Previously executed full validation in this delivery thread

1. `npm test`
2. `npm run integration`

Result:
- unit suite passed
- integration suite passed

## Files in Scope

- `.docs/plans/2026/02/28/plan-web-fetch-tool.md`
- `.docs/reqs/2026/02/28/req-web-fetch-tool.md`
- `core/create-agent-tool.ts`
- `core/globals.d.ts`
- `core/load-skill-tool.ts`
- `core/mcp-server-registry.ts`
- `core/package.json`
- `core/tool-approval.ts`
- `core/tool-utils.ts`
- `core/web-fetch-tool.ts`
- `package.json`
- `package-lock.json`
- `tests/core/mcp-server-registry.test.ts`
- `tests/core/shell-cmd-integration.test.ts`
- `tests/core/tool-approval.test.ts`
- `tests/core/tool-utils.test.ts`
- `tests/core/web-fetch-tool.test.ts`
