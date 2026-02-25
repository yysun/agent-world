# Implementation: Opik LLM-as-a-Judge Evaluation

**Date:** 2026-02-21  
**Requirement:** [req-optional-opik-layer.md](../../reqs/2026-02-18/req-optional-opik-layer.md)  
**Plan:** [plan-optional-opik-layer.md](../../plans/2026-02-18/plan-optional-opik-layer.md)

## Summary

Implemented authentic "LLM-as-a-Judge" scoring for the robustness evaluation pipeline, replacing heuristic placeholders with actual LLM calls. Switched from OpenAI to Google Gemini (`gemini-2.5-pro`) to mitigate strict rate limits and quota issues encountered with OpenAI's ephemeral tokens.

## Changes

### 1. Robustness Evaluation Pipeline
- Updated `tests/opik/eval-robustness.ts` to support a `--use-llm-judge` flag.
- Implemented `scoreHallucination` and `scoreAnswerRelevance` functions using `GoogleGenerativeAI`.
- Added robust retry logic with exponential backoff to handle `429 Too Many Requests` errors from the Gemini API free tier.

### 2. Dependency Management
- Added `@google/generative-ai` to `package.json` for direct SDK access.
- Replaced `openai` usage in `eval-robustness.ts` with `GoogleGenerativeAI` to use Gemini 2.5 Pro.

### 3. Model Configuration
- Selected `gemini-2.5-pro` as the judge model for better reasoning capabilities compared to Flash models.
- Configured evaluation limits (e.g., `--limit 5`) to allow partial runs without hitting long rate-limit pauses.

## Verification

- **Command:** `npx tsx tests/opik/eval-robustness.ts --use-llm-judge --limit 5`
- **Result:** Successfully scores items for `Hallucination` and `AnswerRelevance`, printing aggregate metrics and individual failures.
- **Handling:** Gracefully handles rate limits by pausing execution (up to ~60s) when the API returns a 429 with a valid `Retry-After` header.

## Next Steps

- Proceed with full dataset evaluation runs (50+ items) in CI/CD pipelines, noting the extended execution time due to rate limits.
- Consider upgrading to a paid Gemini plan or implementing batching if faster evaluation is required.
