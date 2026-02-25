# Done: Opik Isolation Audit

**Date:** 2026-02-19

## What Was Done

Audited all changes in the PR (feature/opik-safety-robust-ui-demo vs main) for proper Opik isolation across three categories.

## Isolation Categories

### Category 1: New Files in Opik Directories ✅

All new Opik files are properly isolated in dedicated directories:

- `packages/opik/` — `package.json`, `tsconfig.json`, `src/client.ts`, `src/guardrails.ts`, `src/index.ts`, `src/tracer.ts`
- `core/optional-tracers/opik-runtime.ts`
- `core/security/guardrails.ts`
- `tests/core/opik/runtime.test.ts`, `tests/core/opik/tracer.test.ts`
- `tests/opik/` — `eval-robustness.ts`, `eval-simple-safety.ts`, `scenarios/*`
- `tests/core/security/guardrails.test.ts`
- `scripts/opik-export-world-storage.ts`

### Category 2: New Files with `opik` in Name ✅

All match Category 1 — no stray Opik-named files outside expected directories.

### Category 3: Changes to Existing Files Commented with "Opik" — Mostly Compliant

| File | Opik Comment | Status |
|------|-------------|--------|
| `cli/index.ts` | `// Opik integration: optional tracer attach...` | ✅ |
| `server/api.ts` | `// Opik integration: optional tracer attach...` | ✅ |
| `core/types.ts` | `// Opik integration: risk tags for high-risk tool tracing/filtering.` | ✅ |
| `core/events/orchestrator.ts` — imports | `// Opik integration: safety checks and runtime gate consumption...` | ✅ |
| `core/events/orchestrator.ts` — `classifyToolRisk` function | `// Opik integration: classify tool risk level for trace span tagging.` | ✅ (fixed) |
| `core/events/orchestrator.ts` — `classifyToolRisk` call site (line ~699) | `// Opik integration: tag tool-start event with risk metadata...` | ✅ (fixed) |
| `core/events/orchestrator.ts` — guardrail check block in `processAgentMessage` | `// Opik integration: run safety guardrails on LLM output...` | ✅ (fixed) |

## Gaps Found

Three locations in `core/events/orchestrator.ts` are missing `// Opik integration:` comment markers:

1. The `classifyToolRisk` function definition (~line 329)
2. The `classifyToolRisk` call site and risk metadata in `publishToolEvent` (~line 699)
3. The guardrail check block (`resolveOpikRuntimeConfig` + `runGuardrails`) inside `processAgentMessage`

## Status

Audit complete. All three gaps fixed with `// Opik integration:` comments in `core/events/orchestrator.ts`.
