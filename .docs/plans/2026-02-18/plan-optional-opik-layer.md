# Architecture Plan: Optional Opik Reimplementation (Main Branch)

**Date:** 2026-02-18  
**Requirement:** [req-optional-opik-layer.md](../../reqs/2026-02-18/req-optional-opik-layer.md)  
**Status:** Proposed

Related demo-track plan (separate scope):
- [plan-infinite-etude-demo.md](./plan-infinite-etude-demo.md)

## Overview

Implement Optional Opik Layer as one feature with one implementation scope that includes integration and safety/eval under the same optional gating model.

## Feature Model and Gating

- One feature: **Optional Opik Layer**
- One implementation scope: **Integration + Safety/Eval**
- One gating rule: **everything Opik-related is off unless enabled**

### Config Shape

- `OPIK_ENABLED=false` (master gate)
- `OPIK_SAFETY_ENABLED=false` (guardrails)
- `OPIK_EVAL_ENABLED=false` (eval pipeline)
- `OPIK_API_KEY` (required when Opik is enabled)
- `OPIK_WORKSPACE` (required when Opik is enabled)
- `OPIK_PROJECT` (optional; default target allowed)

### Runtime Rules

- If `OPIK_ENABLED=false`, all Opik functionality is inert.
- If `OPIK_ENABLED=true`, safety/eval runs only when sub-flags are enabled.

## Implementation Plan (Required Scope)

### Step 1: Workspace and Runtime Gate Baseline
Focus: Optional package isolation and safe runtime attach path.

- [x] **Checkpoint 1**: Optional package + runtime gate baseline complete.
  - [x] Port `packages/opik` as a standalone workspace package.
  - [x] Ensure workspace/build scripts include it without forcing runtime dependency.
  - [x] Configure dynamic optional dependency loading compatibility.
  - [x] Implement `OPIK_ENABLED` precedence resolution:
        - CLI override: --opik-enabled <true|false> (from index.ts)
        - config: OPIK_ENABLED in world variables text
        - env: process.env.OPIK_ENABLED
        - default: false
  - [x] Wire dynamic Opik attach in startup paths (CLI and server/world lifecycle).
  - [x] Add warning-only fallback for enabled+missing dependency.
  - [x] Add warning-only fallback for enabled+missing `OPIK_API_KEY` and/or `OPIK_WORKSPACE`.
  - [x] Verify disabled mode initializes no Opik tracer/listener instances.

### Step 2: Tracing Baseline
Focus: Baseline observability for message/LLM/tool flow.

- [x] **Checkpoint 2**: Tracing baseline complete.
  - [x] Attach trace lifecycle to current main-branch event model.
  - [x] Emit message lifecycle spans/events.
  - [x] Emit LLM spans/events with usage/latency when available.
  - [x] Emit tool spans/events for start/result/error.
  - [x] Tag high-risk tool spans for filtering/auditing (`risk_level`, tool tags).

### Step 3: Safety Guardrails
Focus: Real-time detection, blocking/redaction policy, and circuit-breaker behavior.

- [x] **Checkpoint 3**: Safety guardrails complete.
  - [x] Add guardrail checks in main output publication path.
  - [x] Implement `core/security/guardrails.ts` with explicit checks:
        - [x] `checkPII(content: string)`
        - [x] `checkJailbreak(content: string, inputs: string)`
  - [x] Implement explicit detectors for API keys, credit card numbers, and phone numbers.
  - [x] Add non-exhaustive risk-based coverage for other high-risk leakage/misuse patterns with policy-aligned block/redact behavior and trace signals.
  - [x] Implement explicit jailbreak and restricted-topic detection.
  - [x] Implement Opik guardrail wrapper in `packages/opik/src/guardrails.ts`.
  - [x] Emit guardrail outcomes to trace tags/feedback metrics.
  - [x] Implement mandatory circuit-breaker behavior for high-severity triggers.
  - [x] Keep redact/block behavior configurable.

### Step 4: Robustness Datasets
Focus: Define and maintain the tricky/adversarial dataset baseline.

- [x] **Checkpoint 4**: Robustness datasets complete.
  - [x] Use dataset convention `data/datasets/robustness_tricky_50.json` (or versioned compatible successor).
  - [x] Ensure dataset schema remains compatible with eval pipeline.
  - [x] Keep dataset content isolated as test/eval artifact (non-production by default).

### Step 5: Regression Testing Pipeline
Focus: Repeatable evaluation loop and regression reporting.

- [ ] **Checkpoint 5**: Regression testing pipeline complete.
  - [x] Add evaluation script `tests/opik/eval-robustness.ts`.
  - [ ] Support LLM-as-a-Judge scoring in robustness evaluation pipeline.
  - [x] Require named metrics in outputs: `Hallucination`, `AnswerRelevance`.
  - [x] Implement trace-to-dataset export CLI path (`--save-to-dataset`).
  - [x] Track aggregate metrics and regression thresholds.
  - [x] Verify guardrail leak scenario (mock secret) for block/redaction + trace signal.
  - [ ] Verify high-risk tool scenario for risk tags (`risk_level: high`, tool tags).
  - [x] Verify concrete multi-turn user-agent traffic scenario equivalent to prior `infinite-etude` traffic test.

#### Scenario Verification Run (2026-02-19)

- Command run:
  - `npx tsx tests/opik/scenarios/infinite-etude-traffic.ts --world infinite-etude`
- Output summary:
  - `normalHasAgentResponse`: `PASS`
  - `safetyShowsRefusalOrGuardrail`: `PASS`
  - `riskyHasHighRiskTag`: `FAIL`
- Interpretation:
  - Guardrail leak scenario shows refusal-path evidence, but trace-signal proof remains incomplete.
  - High-risk tool scenario is not yet verified as passing for risk-tag evidence.
  - Concrete multi-turn fixture scenario is runnable and produces checkable outputs.

#### Guardrail Leak Verification Run (2026-02-19)

- Command run:
  - `npx tsx tests/opik/eval-simple-safety.ts`
- Result summary:
  - `blocked`: `true`
  - `redacted`: `true`
  - `traceTriggered`: `true`
  - `traceBlocked`: `true`
  - `traceSeverityHigh`: `true`

### Step 6: Validation and Documentation
Focus: Matrix coverage, demo/isolation validation, and operational docs.

- [ ] **Checkpoint 6**: Validation and documentation complete.
  - [ ] Add tests for matrix:
    - disabled + installed
    - disabled + missing
    - enabled + installed
    - enabled + missing
    - enabled + missing `OPIK_API_KEY` and/or `OPIK_WORKSPACE`
  - [ ] Add tests for safety/eval sub-flag behavior when `OPIK_ENABLED=true`.
  - [ ] Validate setup flow for both storage types (`sqlite`, `file`) for demo scope.
  - [x] Ensure data-directory fixtures and demo UI assets remain non-production by default.
  - [x] Update `.env.example` and `README.md`.
  - [x] Document required env vars (`OPIK_API_KEY`, `OPIK_WORKSPACE`) and optional `OPIK_PROJECT`.
  - [ ] Document missing dependency/config fallback behavior.
  - [x] Add integration verification script or explicit manual verification flow.
  - [ ] Confirm exit criteria and acceptance criteria are fully checked.

Future-work backlog for policy/promotion/optional tracer expansion (out of this plan scope):
- `.docs/next/2026-02-18/next-opik-policy-promotion.md`

## File Targets

### Required Scope

- `package.json`
- `package-lock.json`
- `.env.example`
- `README.md`
- `cli/index.ts`
- `server/api.ts` (if startup attach path requires it)
- `packages/opik/**`
- `core/security/**` (or equivalent main-branch location)
- `tests/opik/eval-robustness.ts`
- `data/datasets/robustness_tricky_50.json`
- `tests/opik/scenarios/**` (including concrete multi-turn fixture scenario)
- demo-only UI assets/components under appropriate `web`/`react` demo paths (if used)
- CLI command wiring for trace-to-dataset export (`--save-to-dataset`)
- `tests/**` and `scripts/**` for integration/safety/eval coverage

### Future Backlog Reference

- Runtime policy modules, decisioning policy/tests, and promotion workflow/reporting are tracked in:
  - `.docs/next/2026-02-18/next-opik-policy-promotion.md`

## Risks and Mitigations

- Risk: startup/runtime failure when optional dependency is absent.
  - Mitigation: strict dynamic import guard + warning-only fallback.
- Risk: hidden behavior changes when disabled.
  - Mitigation: disabled-mode regression tests and no-op instrumentation checks.
- Risk: over-scoping single implementation pass.
  - Mitigation: enforce required-scope acceptance criteria; keep Policy/Promotion as next steps.
- Risk: Opik-specific logic bleeding into unrelated core paths.
  - Mitigation: isolate Opik-only modules and enforce file-boundary review checks.

## Exit Criteria

### Required Scope

- Requirement required-scope acceptance criteria all pass.
- Build and tests pass in enabled and disabled modes.
- Optional dependency missing path is verified non-fatal.
- Guardrails and eval signals function only behind sub-flags.
- Circuit breaker behavior is verified for high-severity guardrail triggers.
- Robustness eval runs with LLM-as-a-Judge and publishes aggregate metrics.
- Robustness eval explicitly reports `Hallucination` and `AnswerRelevance`.
- Trace-to-dataset export CLI path (`--save-to-dataset`) is implemented and documented.
- Guardrail leak scenario and high-risk tool scenario pass verification.
- Concrete multi-turn user-agent fixture scenario is verified.
- Data-directory user-agent fixtures and UI demo assets are explicitly marked and remain non-production by default.

### Future Backlog

- Future policy/promotion/tracer-expansion exit goals are tracked in:
  - `.docs/next/2026-02-18/next-opik-policy-promotion.md`
