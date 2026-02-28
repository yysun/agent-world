# Next: Cost-Efficient Agent Orchestration

**Date**: 2026-02-18  
**Scope**: Consolidated future architecture (out of current req/plan scope)

Related current artifacts:
- Requirement: `.docs/reqs/2026-02-18/req-optional-opik-layer.md`
- Plan: `.docs/plans/2026-02-18/plan-optional-opik-layer.md`
- Future backlog: `.docs/next/2026-02-18/next-opik-policy-promotion.md`

## Purpose

Capture the unified 4-pillar design for low-cost, high-reliability agent execution so it can be split into dedicated requirements and plans later.

## Pillar 1: Intelligent Dispatcher (Routing + Context)

1. Tiered routing model
- Tier A (Fast Path): existing skill/template only, handled by low-cost model.
- Tier B (Parameterizer): skill selection plus parameter extraction, handled by low-cost model.
- Tier C (Generator): new code/integration generation, escalated to heavy model only when novelty is high and no viable skill exists.

2. Dynamic schema/context injection
- Inject only relevant MCP tool schemas into prompts (instead of full registry) based on retrieval/search.
- Reduce prompt token overhead while preserving tool-call correctness.

## Pillar 2: Acceleration Layer (Caching + Pruning)

1. Resolution-graph caching
- Cache integration plans (tool/skill execution graph), not only final text output.
- Composite cache key: `[normalized_intent + modality + constraints]`.
- On hit, execute cached plan directly without new reasoning pass.

2. Context pruning
- Maintain rolling conversation summaries.
- Trim or compress bulky tool payloads (for example large JSON/stdout) before model calls.
- Keep model context focused on current decision-critical state.

## Pillar 3: Runtime Execution + Guardrails (Safety + Speed)

1. Pre-execution checkpoints
- Enforce schema validation, tool allowlists, and token/time budgets before Tier C side effects.

2. Controlled execution boundary
- Require HITL approval or sandboxed execution for generated side-effect operations.

3. Circuit breakers and deterministic fallback
- Fast-fail on guardrail/timeout/validation violations.
- Abort sibling parallel tasks when critical failure occurs.
- Route to deterministic fallback skill when available.

## Pillar 4: Evaluation + Telemetry Loop (Self-Improvement)

1. Per-request telemetry
- Capture route and execution metadata per request/message:
  - `route_tier`
  - `tokens_consumed`
  - `latency_ms`
  - `tool_errors`
  - `fallback_used`
  - `user_correction_flags`

2. Nightly benchmark loop
- Maintain a golden prompt suite grouped by complexity/risk.
- Run nightly regressions for success rate, latency, and cost.

3. Promotion/demotion pipeline
- Promote stable Tier C outputs into reusable Tier A skills after sustained benchmark success.
- Demote degraded Tier A skills back to regeneration path when retry/failure signals rise.

## Dependency Linkages to Current Work

1. Current tracing fields and span taxonomy
- Prerequisite for route-tier and latency/cost policy evaluation.

2. Current guardrail and robustness metrics
- Prerequisite for promotion gates and quality thresholds.

3. Current optional tracer runtime contract
- `core/optional-tracers/opik-runtime.ts` is the reference contract for future tracer backends and policy instrumentation.

4. Current trace-to-dataset flow
- Dataset export path is a prerequisite for experiment-to-regression promotion workflows.

## Decomposition Rule

When implementation starts for any pillar item:
- Create a dedicated requirement file under `.docs/reqs/<date>/`.
- Create a dedicated plan file under `.docs/plans/<date>/`.
- Keep this file as the architecture-level backlog and index.
