# Next: Opik Policy and Promotion

**Date**: 2026-02-18
**Scope**: Consolidated future work (out of current req/plan scope)

Related current artifacts:
- Requirement: `.docs/reqs/2026-02-18/req-optional-opik-layer.md`
- Plan: `.docs/plans/2026-02-18/plan-optional-opik-layer.md`

Related future architecture:
- `.docs/next/2026-02-18/next-cost-efficient-orchestration.md`

## Purpose

Track future enhancements in one place until each item is promoted into a dedicated requirement and plan.

## Future Items

1. Runtime policy
- Add runtime routing policy support for low-cost path selection.
- Define policy inputs and thresholds (latency, token usage/cost, failure/fallback rates).
- Ensure policy can run with and without Opik (Opik-enabled vs Opik-independent path).

2. Code-vs-skill decisioning
- Add explicit decision policy for "generate code vs reuse skill".
- Define deterministic fallback behavior and explainability fields.
- Add scenario coverage for policy outcomes.

3. Promotion pipeline
- Define experiment-to-stable promotion criteria.
- Add measurable gates and reporting workflow.
- Add release gating integration for promotion decisions.

4. Optional tracer framework expansion
- Generalize optional tracer runtime contract, keeping implementations isolated.
- Reference implementation: `core/optional-tracers/opik-runtime.ts`.
- Candidate tracers:
  - `opik`
  - `open-telemetry`
  - `console-tracer`
  - `jsonl-file-tracer`
  - `noop`
- Require consistent span taxonomy (`message`, `llm`, `tool`, `guardrail`) across tracers.
- Require graceful fallback behavior per tracer (missing dependency/config, disabled gate).

5. Optional runtime-feature consolidation (non-tracer)
- Evaluate whether to standardize toggles for existing optional feature domains:
  - Streaming CLI/runtime toggle and core switches
  - MCP tool enablement path
  - Skill-source toggles
  - Server auto-open behavior
  - Logging category controls

## Linkages and Prerequisites

These future items depend on current implementation outputs:

1. Current tracing fields + span taxonomy
- Prerequisite for runtime policy and cross-tracer comparability.

2. Current guardrail/eval metrics
- Prerequisite for promotion gates and regression thresholds.

3. Current Opik runtime contract
- `core/optional-tracers/opik-runtime.ts` is the reference contract for future tracer backends.

4. Current trace-to-dataset path
- `--save-to-dataset` is a prerequisite for experiment-to-regression promotion flow.

## Promotion Rule

When any future item is selected for execution:
- Create a dedicated requirement file under `.docs/reqs/<date>/`.
- Create a dedicated plan file under `.docs/plans/<date>/`.
- Keep this file as the consolidated backlog, with links to promoted items.
