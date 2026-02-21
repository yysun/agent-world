# Optional Opik Layer Reimplementation Progress

Date: 2026-02-19
Requirement: `.docs/reqs/2026-02-18/req-optional-opik-layer.md`
Plan: `.docs/plans/2026-02-18/plan-optional-opik-layer.md`

## Summary

Implemented the first end-to-end reimplementation pass of Optional Opik Layer for main-branch architecture with optional gating, dynamic attach behavior, safety guardrails, eval scaffolding, and baseline tests.

## Implemented

1. Optional tracer runtime wiring
- Added Opik runtime module at `core/optional-tracers/opik-runtime.ts`.
- Added dynamic optional dependency loading with graceful fallback when missing.
- Added required config validation (`OPIK_API_KEY`, `OPIK_WORKSPACE`) with warning-only fallback.
- Added precedence support: CLI override > world/config variables > env > default.

2. Optional package isolation
- Added workspace package `packages/opik` with isolated source modules:
  - `packages/opik/src/client.ts`
  - `packages/opik/src/tracer.ts`
  - `packages/opik/src/guardrails.ts`
  - `packages/opik/src/index.ts`
- Added workspace build/check wiring in root `package.json`.

3. CLI and server attach points
- Attached optional tracer in CLI world subscription flow (`cli/index.ts`).
- Attached optional tracer in server API world subscription flows (`server/api.ts`).
- Added CLI override flag: `--opik-enabled <true|false>`.

4. Safety and circuit-break path
- Added core guardrail module `core/security/guardrails.ts` with explicit checks:
  - `checkPII(content: string)`
  - `checkJailbreak(content: string, inputs: string)`
- Added explicit detections for API keys, credit cards, phone numbers, jailbreak, restricted topics.
- Added high-severity circuit-break behavior in orchestrator path.
- Added guardrail signal emission and high-risk tool tagging metadata.

5. Eval scaffolding and dataset
- Added robustness eval script `tests/opik/eval-robustness.ts`.
- Added dataset `data/datasets/robustness_tricky_50.json`.
- Added trace-to-dataset export option `--save-to-dataset` in eval script.
- Added script `data/worlds/infinite-etude/setup-agents.ts` for demo user-agent setup with both storage types (`sqlite`, `file`).
- Added migration helper scaffold `scripts/opik-export-world-storage.ts`.

6. Tests
- Added runtime gating tests: `tests/core/opik/runtime.test.ts`.
- Added guardrail tests: `tests/core/security/guardrails.test.ts`.
- Added scenario/eval stubs under `tests/opik/**`.

7. Documentation updates
- Updated env and README for Optional Opik Layer gates and required variables.
- Added checkpoint section in plan.
- Added optional tracer framework enhancement section in requirement Phase 3.

## Validation Status

Validated:
- `tsc --noEmit --project tsconfig.build.json`
- `npm run check --workspace=core`
- `npm run check --workspace=packages/opik`
- `npx vitest run tests/core/opik/runtime.test.ts tests/core/security/guardrails.test.ts`

Not fully validated in sandbox:
- Full root `npm run check` blocked by Electron type-resolution in this sandbox.
- `tsx` script execution for eval runtime hit sandbox IPC permission issue.

## Follow-up Items

1. Upgrade eval script from heuristic judge to strict LLM-as-a-Judge path with provider-configured execution.
2. Complete bidirectional storage migration helper for full chat/message replay.
3. Expand scenario coverage for guardrail leak + high-risk tool audit verification to fully satisfy acceptance checklist.
