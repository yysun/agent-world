# DD: `llm-runtime` Structured HITL Schema

**Date:** 2026-04-24  
**Status:** Complete  
**Related REQ:** `.docs/reqs/2026/04/24/req-llm-runtime-hitl-schema.md`  
**Related AP:** `.docs/plans/2026/04/24/plan-llm-runtime-hitl-schema.md`  
**Related AT:** `.docs/tests/test-llm-runtime-hitl-schema.md`

## Summary

Aligned Agent World's HITL flow with the `llm-runtime` structured `ask_user_input` contract.

Completed changes include:
- core HITL runtime migrated from flat `question/options/defaultOption` prompts to structured `type`, `allowSkip`, and `questions[]`,
- built-in and internal approval producers now emit `ask_user_input`-shaped requests while preserving the legacy alias for compatibility,
- server, web, Electron, and CLI response paths now accept structured answers and explicit request-level skip,
- replay and message-authoritative reconstruction keep historical flat-schema prompts resolvable through compatibility adapters,
- focused web/Electron/CLI test and harness coverage updated to the new contract.

## Implemented Scope

### 1) Core HITL contract and runtime

Updated the core HITL model in `core/hitl.ts` and `core/hitl-tool.ts` to:
- represent pending prompts as structured requests,
- validate structured answers and request-level skip,
- keep legacy single-option helpers for internal compatibility,
- replay unresolved `ask_user_input` and legacy `human_intervention_request` calls from persisted messages.

### 2) Internal approval producers

Migrated internal approval producers to the structured runtime-owned contract:
- `core/load-skill-tool.ts`
- `core/tool-approval.ts`

These flows now persist assistant tool-call messages as `ask_user_input`, keep host metadata in adjacent payloads, and record structured answer envelopes in resolution artifacts.

### 3) Transport and client updates

Updated structured response handling across boundaries:
- `server/api.ts` now validates `answers[]`, optional `optionId`, and `skipped`,
- `web/src/api.ts` and web runtime/UI paths submit structured HITL payloads,
- Electron IPC contracts, preload bridge, main-process handlers, renderer state, and UI now support structured/skip responses,
- CLI parsing and interactive handling now support `allowSkip`, explicit skip selection, and structured submission mapping.

### 4) Compatibility and visibility cleanup

Updated compatibility layers and UX filters to preserve a stable migration path:
- legacy flat tool arguments normalize into structured prompt models,
- assistant placeholder rows for `ask_user_input` are hidden in web and Electron transcript views,
- seeded test harness prompts now instruct agents to call `ask_user_input` instead of the legacy flat alias contract.

### 5) Tests and focused validation

Added or updated focused coverage for:
- core structured HITL schema behavior,
- core tool argument normalization,
- server/web-domain/Electron transport and prompt parsing,
- Electron skip UI and IPC handling,
- CLI skip parsing and interactive submission mapping.

## Requirement Coverage

1. **REQ-1 runtime-owned HITL schema:** implemented. New product-facing flows prefer `ask_user_input`; legacy alias compatibility remains.
2. **REQ-2 structured request shape:** implemented across core, server, web, Electron, CLI, and harness prompts.
3. **REQ-2A internal approval producers:** implemented for tool approval and load-skill approval flows.
4. **REQ-4 structured pending artifacts:** implemented through core prompt registry and client read models.
5. **REQ-5 structured response submission:** implemented with `answers[]` and `skipped` support, while keeping bounded option compatibility.
6. **REQ-6 message-authoritative replay:** implemented with structured replay plus lazy compatibility for historical flat prompts.
7. **REQ-7 cross-client alignment:** implemented for web, Electron, and CLI.
8. **REQ-8 historical compatibility:** implemented through read-time normalization rather than eager transcript migration.
9. **REQ-9 runtime ownership boundaries:** implemented by moving product behavior to the runtime-owned schema while keeping host lifecycle logic in Agent World.

## Files in Scope

- `.docs/reqs/2026/04/24/req-llm-runtime-hitl-schema.md`
- `.docs/plans/2026/04/24/plan-llm-runtime-hitl-schema.md`
- `.docs/tests/test-llm-runtime-hitl-schema.md`
- `core/hitl.ts`
- `core/hitl-tool.ts`
- `core/load-skill-tool.ts`
- `core/tool-approval.ts`
- `core/tool-utils.ts`
- `server/api.ts`
- `web/src/api.ts`
- `web/src/domain/hitl.ts`
- `web/src/domain/message-visibility.ts`
- `web/src/features/world/update/runtime.ts`
- `web/src/features/world/views/world-chat.tsx`
- `web/src/features/world/views/world-dashboard.tsx`
- `web/src/types/events.ts`
- `web/src/types/index.ts`
- `electron/shared/ipc-contracts.ts`
- `electron/preload/payloads.ts`
- `electron/preload/bridge.ts`
- `electron/main-process/ipc-handlers.ts`
- `electron/renderer/src/app/RendererWorkspace.tsx`
- `electron/renderer/src/features/chat/components/MessageListPanel.tsx`
- `electron/renderer/src/hooks/useChatEventSubscriptions.ts`
- `electron/renderer/src/utils/app-layout-props.ts`
- `electron/renderer/src/utils/message-utils.ts`
- `cli/hitl.ts`
- `cli/index.ts`
- targeted tests and harness support files under `tests/core`, `tests/web-domain`, `tests/web-e2e`, `tests/electron`, and `tests/cli`

## Verification

### Commands / Runs

1. Focused Electron HITL tests via `runTests`
2. Focused CLI test slice via `runTests`
3. Targeted web Playwright case for HITL-after-chat-switch flow
4. Full web Playwright run

### Results

- Electron HITL-focused suite passed: `61 passed, 0 failed`.
- CLI-focused suite passed after the submission-helper test addition: `80 passed, 0 failed`.
- Targeted web Playwright case completed successfully.
- Full web Playwright run completed successfully.

## Notes

- An unrelated local dependency override was present in `package.json` / `package-lock.json` (`llm-runtime` -> `../llm-runtime3`). It was not changed as part of this story and should be treated separately before shipping if reproducible installs are required.