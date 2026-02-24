# Requirement: Opik Integration for Pi-Agent

## Context
The `agent-world` project has migrated to the `pi` branch architecture, utilizing `@mariozechner/pi-agent-core` for its cognitive engine. To ensure this new agent architecture is robust and optimized, we need to integrate **Opik** (by Comet) for comprehensive observability, evaluation, and optimization.

## Goals
1.  **Observability**: Gain deep visibility into the execution traces of `pi-agent-core`, including LLM calls, tool usage, and internal "thinking" steps (Clawdbot style).
2.  **Robustness**: Implement automated evaluations (LLM-as-a-judge) to detect hallucinations and ensure answer relevance during development.
3.  **Optimization**: Enable dataset collection from traces to refine prompts and build regression test suites.

## Functional Requirements

### 1. Opik SDK Integration
- **Dependency**: Add `opik` Python SDK (via python-bridge if necessary) or prefer the **Typescript/Node.js SDK** if available.
    - *Note*: Opik has a `typescript` SDK referenced in docs. We should prioritize using the native Node.js SDK.
- **Configuration**:
    - Support standard Opik env vars: `OPIK_API_KEY`, `OPIK_WORKSPACE`.
    - Add `OPIK_ENABLED` feature flag to `core/utils/config.ts`.

### 2. Tracing The "Pi" Agent
- **Wrap `pi-agent-core`**: The `pi-agent-core` likely has a main execution loop or LLM calling mechanism. We must wrap these entry points with Opik's tracers.
    - Trace the **User Input** -> **Agent Response** lifecycle.
    - Trace individual **LLM Calls** (input tokens, output tokens, latency).
    - Trace **Tool Executions** (tool name, inputs, outputs).
    - *Specific to Pi/Clawdbot*: Ensure the "thinking" stream (if existing) is captured as a span or event within the trace.

### 3. Automated Evaluations (Robustness)
- Implement an **Offline Evaluation Script** (`tests/eval/opik-eval.ts`).
- Use Opik's **LLM-as-a-Judge** metrics:
    - `Hallucination`: Check if the agent's output is supported by its context/tools.
    - `AnswerRelevance`: Ensure the agent answers the user's actual question.
- **Trigger**: Run these evaluations on a subset of traces or via a dedicated command (e.g., `npm run eval`).

### 4. Dataset Management (Optimization)
- **Trace-to-Dataset**: Implement a CLI command or flag (e.g., `--save-to-dataset`) that pushes the current session's successful interactions to an Opik Dataset.
- This creates a "Golden Dataset" for regression testing future agent versions.

## Technical approach
- **`pi-agent-core` Middleware**: Check if `pi-agent-core` supports middleware or event listeners to hook in tracing without modifying the core library code directly.
- **Span Mapping**:
    - `Trace`: Entire User Interaction.
    - `Span`: Agent `step` or `think` cycle.
    - `Span`: LLM API request.
    - `Span`: Tool execution.

## Reference
- **Opik TS SDK**: https://www.npmjs.com/package/opik (Verify existence/maturity, fallback to REST API if TS SDK is immature).
- **Pi Agent**: `@mariozechner/pi-agent-core` definitions.
