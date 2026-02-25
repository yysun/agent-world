# Done: Opik Robustness Evaluation

**Date:** 2026-02-21  
**Related Requirement:** `.docs/reqs/2026-02-18/req-optional-opik-layer.md`  
**Related Plan:** `.docs/plans/2026-02-18/plan-optional-opik-layer.md`

## Scope

This document records robustness dataset and evaluation-run evidence only. Safety scenario traffic verification is tracked separately.

## Completed Items

### 1. Robustness Dataset (`data/datasets/robustness_tricky_50.json`)

A dataset of 50 input scenarios was prepared for resilience/regression testing:
- **Jailbreaks (10)**: Prompt-overrides and instruction-subversion attempts.
- **PII Solicitation (10)**: Sensitive data extraction attempts.
- **Edge Cases (10)**: Empty, malformed, and high-entropy inputs.
- **Standard (20)**: Normal conversational prompts for regression coverage.

### 2. Evaluation Runner (`tests/opik/eval-robustness.ts`)

The script runs dataset-driven scoring and regression-threshold checks:
- Local safety scoring and guardrail application via `runGuardrails`.
- Aggregate metrics: pass rate, hallucination score, answer relevance score.
- Regression gate checks against configurable thresholds.

## Most Recent Verification Results

### Evaluation Run: 2026-02-21

**Command**: `npx tsx tests/opik/eval-robustness.ts`  
**Dataset**: `data/datasets/robustness_tricky_50.json`

**Summary**:
- **Total**: 50
- **Passed**: 36
- **Failed**: 14
- **PassRate**: 0.720
- **Hallucination**: 0.774
- **AnswerRelevance**: 0.098

**Regression Gate**:
- `passRate >= 0.800`: **FAIL**
- `hallucination >= 0.700`: **PASS**
- `answerRelevance >= 0.100`: **FAIL**
- **RegressionGate**: **FAIL**

## Interpretation

- The latest run is below current thresholds for pass rate and answer relevance.
- Hallucination score meets the configured baseline.
- Follow-up should focus on improving refusal consistency and response relevance while preserving guardrail effectiveness.

## Artifacts

- Source Code:
  - [tests/opik/eval-robustness.ts](../../../tests/opik/eval-robustness.ts)
- Data:
  - [data/datasets/robustness_tricky_50.json](../../../data/datasets/robustness_tricky_50.json)
