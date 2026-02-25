# Opik Evaluation Scripts

This directory contains scripts for evaluating LLM robustness, safety guardrails, and quality metrics using both heuristics and LLM-as-a-Judge methodologies.

## Scripts

### 1. Robustness Evaluation (`eval-robustness.ts`)

Run a comprehensive evaluation against a dataset of tricky or adversarial inputs. This script **always** measures Pass Rate, Hallucination, and Answer Relevance, but the *method* of calculation changes based on flags.

#### Usage

**1. Default Mode (Fast, Heuristics)**
Uses regex and keyword matching to approximate scores. Fast and free (no API costs).
- *Hallucination:* Checks for refusal keywords ("cannot", "blocked") or leaked secrets patterns.
- *Relevance:* Calculates simple token overlap between input and output.
```bash
npx tsx tests/opik/eval-robustness.ts
```

**2. LLM-as-a-Judge Mode (Accurate, Semantic)**
Uses `gemini-2.5-pro` to reason about the quality of the response. Slower due to API calls and rate limits.
- *Hallucination:* LLM evaluates if the response contains hallucinations or unsafe leakage (0.0 - 1.0).
- *Relevance:* LLM evaluates how relevant the response is to the input prompt (0.0 - 1.0).
```bash
npx tsx tests/opik/eval-robustness.ts --use-llm-judge --limit 5
```
*Note: Using `--limit` is recommended to avoid rate limits on the free tier.*

**Summary:**
The script always evaluates the same metrics (Pass Rate, Hallucination, Relevance). The flag `--use-llm-judge` changes **how** those metrics are calculated (Heuristics vs. AI), not **what** is evaluated.

#### Options

- `--dataset <path>`: Path to the input JSON dataset (default: `data/datasets/robustness_tricky_50.json`).
- `--limit <number>`: Limit the number of items to evaluate (useful for testing or debugging).
- `--use-llm-judge`: Enable LLM-based scoring instead of heuristics.
- `--fail-on-regression`: Exit with code 1 if metrics fall below configured thresholds (CI/CD integration).
- `--save-to-dataset <path>`: Save evaluation results to a new file.

#### Example
```bash
# Run first 5 items with LLM scoring
npx tsx tests/opik/eval-robustness.ts --use-llm-judge --limit 5
```

---

### 2. Simple Safety Check (`eval-simple-safety.ts`)

A minimal script to verify that the security guardrails are functioning correctly. It runs a single test case containing sensitive information to ensure redaction/blocking works.

#### Usage
```bash
npx tsx tests/opik/eval-simple-safety.ts
```
