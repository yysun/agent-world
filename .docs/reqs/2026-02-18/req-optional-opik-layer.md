# Requirement: Optional Opik Integration (Main-Branch Reimplementation)

## Context

`agent-world.opik` contains prior Opik integration and safety work, but that branch included architecture paths that are no longer the target direction. We need a clean reimplementation for the current `agent-world` main-branch architecture, keeping Opik optional and preserving default behavior when disabled.

This requirement is derived from:
- `.docs/plans/2026-02-07/plan-opik-integration.md`
- `.docs/reqs/2026-02-08/req-opik-safety.md`
- `.docs/plans/2026-02-08/plan-opik-safety.md`

Related demo-track requirement (separate scope):
- `.docs/reqs/2026-02-18/req-demo-infinite-etude.md`

## Objectives

1. Add optional Opik tracing integration to the main-branch architecture without introducing runtime coupling when disabled.
2. Preserve current behavior and stability when Opik is disabled or unavailable.
3. Define a staged path for safety/robustness capabilities that build on Opik, without blocking Stage 1 integration.

## Feature Model

- One feature: **Optional Opik Layer**
- One implementation scope:
  - Integration + Safety/Eval
- One gating rule: **everything Opik-related is off unless enabled**

### Required Config Shape

- `OPIK_ENABLED=false` (master gate)
- `OPIK_SAFETY_ENABLED=false` (guardrails)
- `OPIK_EVAL_ENABLED=false` (eval pipeline)
- `OPIK_API_KEY` (required for enabled Opik connectivity)
- `OPIK_WORKSPACE` (required for workspace routing)
- `OPIK_PROJECT` (optional project target; default allowed)

### Gating Rules

- If `OPIK_ENABLED=false`, all Opik functionality is inert.
- If `OPIK_ENABLED=true`, safety/eval capabilities run only when their sub-flags are enabled.

## Scope Boundaries

### In Scope

- Optional Opik package integration with runtime feature flag control.
- Dynamic loading and graceful degradation when optional dependency is missing.
- Main-architecture wiring through existing CLI/server/world-event entry points.
- Staged follow-up requirements for safety/robustness based on guardrails and regression evaluation.
- Development-time isolation of Opik-specific code paths and artifacts.
- Verification scenarios adapted from prior integration/safety plans.

### Out of Scope

- Copying or reviving abandoned branch-specific architecture.
- Migrating legacy demo/scenario artifacts as product requirements.
- Introducing unrelated storage redesigns or auth redesigns.

## Functional Requirements

### Required Implementation Scope

1. **Feature Flag and Config Precedence**
   - Provide `OPIK_ENABLED` (default `false`).
   - Resolve precedence as: CLI override > config entry > env var > default.

2. **Optional Dependency Behavior**
   - Opik dependency must be optional at install/runtime.
   - Opik code must be dynamically loaded only when enabled.
   - If enabled but dependency is missing, log a clear warning and continue startup.
   - If enabled but `OPIK_API_KEY` or `OPIK_WORKSPACE` is missing, log a clear warning and continue startup without tracer attachment.

3. **Main-Architecture Integration Points**
   - Attach Opik tracer through current startup and world/event lifecycles.
   - Do not require architecture-specific adapters outside main-branch design.
   - When disabled, no Opik tracer/listener instances should be created.

4. **Tracing Baseline**
   - Capture at least:
     - message lifecycle start/end
     - LLM call spans (with latency and token usage when available)
     - tool execution spans
   - Keep trace payloads bounded and non-blocking.

5. **Development Isolation and Opik-Specific Artifacts**
   - Keep Opik-only logic isolated in Opik-specific modules/files as much as possible.
   - Include explicit artifacts (or clearly documented equivalent paths) for Opik safety/eval:
     - `core/security/guardrails.ts`
     - `tests/opik/eval-robustness.ts`
     - `packages/opik/src/guardrails.ts`
   - Guardrail core API must include explicit checks:
     - `checkPII(content: string)`
     - `checkJailbreak(content: string, inputs: string)`
   - Circuit breaker behavior is mandatory: halt agent execution on high-severity guardrail triggers.
   - Use dataset naming convention `data/datasets/robustness_tricky_50.json` (or versioned successor with compatible schema).
   - Evaluation flow must support LLM-as-a-Judge scoring for robustness runs.
   - Data-directory content remains compliant with isolation only when it is user-agent/test fixture material kept out of product code paths (for example under `.gitignore`).
   - UI assets/components used only for demonstrations are compliant when clearly marked as demo-only and not wired into production flows by default.

6. **Safety and Robustness**
   - Add output scanning hooks with explicit detectors for:
     - API keys
     - credit card numbers
     - phone numbers
  - Add non-exhaustive risk-based coverage for other high-risk leakage/misuse patterns, with policy-aligned block/redact behavior and trace signals when triggered.
   - Add explicit jailbreak detection and restricted-topic detection.
   - Record guardrail outcomes to traces/feedback signals.
   - Implement circuit-breaker enforcement: halt agent execution on high-severity guardrail triggers.
   - Keep blocking/redaction behavior explicitly configurable.
   - Add repeatable dataset-driven eval script for tricky/adversarial inputs.
   - Produce aggregate metrics and publish results for regression tracking.
   - Required named metrics include `Hallucination` and `AnswerRelevance`.
   - Tag traces/spans for high-risk tool usage for dashboard filtering and auditing.

7. **Documentation and Testing**
   - Document enablement, config precedence, and missing-dependency behavior.
   - Document required Opik env vars (`OPIK_API_KEY`, `OPIK_WORKSPACE`) and optional `OPIK_PROJECT`.
   - Add automated coverage for:
     - disabled + dependency present
     - disabled + dependency missing
     - enabled + dependency present
     - enabled + dependency missing
     - enabled + missing `OPIK_API_KEY` and/or `OPIK_WORKSPACE`

8. **Verification Scenarios (Required)**
   - Include automated and manual checks adapted from prior Opik integration/safety plans:
     - Run robustness evaluation script and verify results are recorded.
     - Run a guardrail leak scenario (mock secret) and verify redaction/blocking and trace signal.
     - Run high-risk tool scenario and verify risk tags (for example `risk_level: high`, tool tags).
   - Include one concrete multi-turn scenario using the user-agent fixture path in data/test assets:
     - Scenario equivalent to prior traffic test (`tests/opik/scenarios/infinite-etude-traffic.ts`) is allowed when treated as test/user-agent fixture content.
   - Verification artifacts must remain isolated from production runtime by default.

## Acceptance Criteria

### Required Scope

- [ ] `OPIK_ENABLED` defaults to `false`.
- [ ] Enabled+installed path initializes and emits traces.
- [ ] Enabled+missing dependency path logs warning and continues.
- [ ] Enabled+missing `OPIK_API_KEY` and/or `OPIK_WORKSPACE` logs warning and continues without tracer attachment.
- [ ] Disabled paths create no Opik tracer/listener instances.
- [ ] Config precedence is documented and covered by tests.
- [ ] Main-branch behavior remains unchanged when disabled.
- [ ] `OPIK_ENABLED=false` guarantees all Opik behavior is inert.
- [ ] `OPIK_SAFETY_ENABLED` and `OPIK_EVAL_ENABLED` control their subsystems independently when `OPIK_ENABLED=true`.
- [ ] Guardrail signals are emitted into traces for blocked/flagged outputs.
- [ ] Safety checks explicitly cover API keys, credit cards, and phone numbers.
- [ ] Safety checks explicitly cover jailbreak and restricted-topic detection.
- [ ] Robustness eval can run against a dataset and produce aggregate metrics.
- [ ] Robustness evaluation explicitly reports `Hallucination` and `AnswerRelevance`.
- [ ] High-risk tool traces are filterable by tags/metadata.
- [ ] Opik-only development artifacts are isolated and documented (guardrails module, eval script, Opik guardrails wrapper).
- [ ] Circuit-breaker behavior halts execution on high-severity guardrail triggers.
- [ ] Robustness dataset follows `robustness_tricky_50` naming/schema convention.
- [ ] Robustness evaluation supports LLM-as-a-Judge scoring.
- [ ] Guardrail leak scenario is verified (redaction/block + trace signal).
- [ ] High-risk tool scenario is verified with risk tags in traces.
- [ ] Concrete multi-turn user-agent scenario is verified as test fixture flow.
- [ ] Data-directory user-agent fixtures and UI demo assets are explicitly marked and remain non-production by default.
