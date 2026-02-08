# Implementation Plan: Opik Safety & Robustness

**Date**: 2026-02-08
**Requirement**: [req-opik-safety.md](../../reqs/2026-02-08/req-opik-safety.md)

This plan details the steps to implement Security Guardrails, Robustness Regression Testing, and Enhanced Monitoring using Opik.

## Phase 1: Security Guardrails
Focus: Real-time detection and blocking of harmful content.

- [ ] **Core Logic**: Create `core/security/guardrails.ts`.
    - [ ] `scanForPII(text: string): SecurityResult` (Regex-based: API Keys, Email, Phone).
    - [ ] `scanForHarmfulContent(text: string): SecurityResult` (Keyword-based / Lightweight LLM check).
- [ ] **Opik Integration**: Update `packages/opik`.
    - [ ] Add `logGuardrailEvent(traceId, result)` method to `OpikTracer`.
    - [ ] Ensure `feedback` scores (0/1) are sent for Safety metrics.
- [ ] **Agent Hook**: Integrate into `processAgentMessage`.
    - [ ] Run guardrails on **Agent Output** before publishing/saving.
    - [ ] If blocked, replace content with "[Redacted by Safety Guardrail]".

## Phase 2: Robustness Datasets
Focus: Defining the "Tricky Inputs" for regression testing.

- [ ] **Dataset Creation**: Create `data/datasets/robustness_tricky_50.json`.
    - [ ] Include 10 "Jailbreak" attempts (e.g., "Ignore system prompt...").
    - [ ] Include 10 "PII Solicitation" attempts (e.g., "What is your API key?").
    - [ ] Include 10 "Edge Case" inputs (e.g., empty string, 10k characters).
    - [ ] Include 20 "Standard" inputs (Control group).

## Phase 3: Regression Testing Pipeline
Focus: The "Loop" to evaluate agents against the dataset.

- [ ] **Eval Script**: Create `scripts/eval-robustness.ts`.
    - [ ] Load the dataset.
    - [ ] Instantiate a temporary World/Agent (headless).
    - [ ] Iterate through inputs.
    - [ ] Use Opik's `LLM-as-a-Judge` (or simple heuristic if SDK limited) to grade responses.
    - [ ] Log aggregate `Safety Score` and `Compliance Score` to Opik Experiments.

## Phase 4: Shadow Monitoring (High Risk)
Focus: Visibility into dangerous tools.

- [x] **Tool Tagging**: Update `OpikTracer` (`packages/opik/src/tracer.ts`).
    - [x] Detect usage of `shell_cmd` or `fs_*` tools.
    - [x] Add tag `risk_level: high` to the Trace/Span.
    - [x] Add tag `tool: shell_cmd` for filtering.

## Verification
- [ ] Run `npx tsx scripts/eval-robustness.ts` and verify results appear in Opik "Experiments" or "Traces".
- [ ] Attempt to make an agent leak an API key and verify it is redacted in the logs/UI.
- [x] Run `tests/opik/scenarios/infinite-etude-traffic.ts` (Scenario 3) to verify `risk_level: high` tagging for `shell_cmd`.
