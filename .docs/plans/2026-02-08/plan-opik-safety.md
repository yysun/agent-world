# Implementation Plan: Opik Safety & Robustness

**Date**: 2026-02-08
**Requirement**: [req-opik-safety.md](../../reqs/2026-02-08/req-opik-safety.md)

This plan details the steps to implement Security Guardrails, Robustness Regression Testing, and Enhanced Monitoring using Opik.

## Phase 1: Security Guardrails
Focus: Real-time detection and blocking of harmful content.

- [x] **Core Logic**: Create `core/security/guardrails.ts`.
    - [x] `scanForPII(text: string): SecurityResult` (Regex-based: API Keys, Email, Phone).
    - [x] `scanForHarmfulContent(text: string): SecurityResult` (Keyword-based / Lightweight LLM check).
- [x] **Opik Integration**: Update `packages/opik`.
    - [x] Add `logGuardrailEvent(traceId, result)` method to `OpikTracer`.
    - [x] Ensure `feedback` scores (0/1) are sent for Safety metrics.
- [x] **Agent Hook**: Integrate into `processAgentMessage`.
    - [x] Run guardrails on **Agent Output** before publishing/saving.
    - [x] If blocked, replace content with "[Redacted by Safety Guardrail]".

## Phase 2: Robustness Datasets
Focus: Defining the "Tricky Inputs" for regression testing.

- [x] **Dataset Creation**: Create `data/datasets/robustness_tricky_50.json`.
    - [x] Include 10 "Jailbreak" attempts (e.g., "Ignore system prompt...").
    - [x] Include 10 "PII Solicitation" attempts (e.g., "What is your API key?").
    - [x] Include 10 "Edge Case" inputs (e.g., empty string, 10k characters).
    - [x] Include 20 "Standard" inputs (Control group).

## Phase 3: Regression Testing Pipeline
Focus: The "Loop" to evaluate agents against the dataset.

- [x] **Eval Script**: Create `scripts/eval-robustness.ts`.
    - [x] Load the dataset.
    - [x] Instantiate a temporary World/Agent (headless).
    - [x] Iterate through inputs.
    - [x] Use Opik's `LLM-as-a-Judge` (or simple heuristic if SDK limited) to grade responses.
    - [x] Log aggregate `Safety Score` and `Compliance Score` to Opik Experiments.

## Phase 4: Shadow Monitoring (High Risk)
Focus: Visibility into dangerous tools.

- [x] **Tool Tagging**: Update `OpikTracer` (`packages/opik/src/tracer.ts`).
    - [x] Detect usage of `shell_cmd` or `fs_*` tools.
    - [x] Add tag `risk_level: high` to the Trace/Span.
    - [x] Add tag `tool: shell_cmd` for filtering.

## Verification
- [x] Run `npx tsx tests/opik/eval-robustness.ts` and verify results appear in Opik "Experiments" or "Traces".
- [x] Attempt to make an agent leak an API key and verify it is redacted in the logs/UI.
- [x] Run `tests/opik/scenarios/infinite-etude-traffic.ts` (Scenario 3) to verify `risk_level: high` tagging for `shell_cmd`.
- [x] Verify traces in Opik Dashboard (Screenshots confirmed for Scenarios 1, 2, and 3).
