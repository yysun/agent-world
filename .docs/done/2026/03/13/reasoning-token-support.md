# Reasoning Token Support - Implementation Complete

**Date:** 2026-03-13  
**Status:** Completed  
**Requirement:** [req-reasoning-token-support.md](../../../../reqs/2026/03/13/req-reasoning-token-support.md)  
**Plan:** [plan-reasoning-token-support.md](../../../../plans/2026/03/13/plan-reasoning-token-support.md)

---

## Summary

Implemented world-scoped reasoning-effort support and transport-safe reasoning token streaming across the validated provider paths.

The runtime now:

- reads `reasoning_effort=low|medium|high` from `world.variables`
- maps that setting into provider-specific request controls for supported providers
- preserves streamed reasoning tokens as a separate `reasoningContent` channel instead of mixing them into normal assistant answer text
- forwards that channel through core SSE publication, Electron realtime serialization, and both client renderers

## Completed Scope

### Core Provider Runtime

- OpenAI-compatible runtime updated to:
  - read `reasoning_effort` from `world.variables`
  - send `reasoning_effort` only for validated provider paths
  - parse streamed reasoning from `delta.reasoning_content`, `delta.reasoning`, and `delta.thinking`
- Google runtime updated to:
  - map normalized effort into Gemini `thinkingConfig`
  - parse thought-marked streamed parts into `reasoningContent`
  - preserve plain text streaming fallback when chunks expose text without `content.parts`

### Transport And Client State

- Core SSE payloads widened with optional `reasoningContent`
- Electron realtime serialization widened with optional `reasoningContent`
- Electron streaming state now accumulates answer text and reasoning text independently
- Web SSE state now accumulates answer text and reasoning text independently
- Electron and web message renderers now show reasoning in a separate muted block under the main answer content

### Probe And Regression Coverage

- Extended the provider probe to support one-run comparison across `low`, `medium`, and `high`
- Added targeted regression tests for:
  - Google streaming fallback and reasoning separation
  - OpenAI/Ollama request-shape guards
  - Electron SSE serialization of `reasoningContent`
  - Electron streaming accumulation of `reasoningContent`
  - Web SSE state preservation of `reasoningContent`
  - Probe argument parsing and streamed chunk summarization

## Code Review Outcome

The CR pass found two implementation issues and both were fixed before completion:

1. Google streaming had regressed to reading only `content.parts`, which could drop normal text chunks from SDK responses that still expose text via `chunk.text()`.
2. Generic `openai-compatible` providers were being sent `reasoning_effort` unconditionally, which could break third-party compatible servers that do not implement that field.

After those fixes, the final review pass found no remaining high-priority issues in the completed patch set.

## Provider Observations

### Ollama

- Local streaming probe confirmed `reasoning_effort: "medium"` is accepted
- Observed reasoning tokens on streamed `choices[0].delta.reasoning`

### Azure OpenAI

- Env-backed Azure probe accepted `low`, `medium`, and `high`
- In the tested environment, sampled stream chunks exposed `content`, `refusal`, and `role`
- No streamed reasoning delta was observed in that sample set
- Each sampled run ended with `finishReason: "length"`

### Google Gemini

- Env-backed Google probe accepted `low`, `medium`, and `high`
- Streamed reasoning appeared as content parts with `thought: true`
- Final answer text arrived as normal non-thought parts
- Each sampled run ended with `finishReason: "MAX_TOKENS"`

## Validation

### Targeted Tests

Passed:

```bash
npx vitest run tests/core/google-direct-streaming.test.ts tests/core/llm-providers/openai-direct-ollama-tools.test.ts tests/web-domain/stream-reasoning-content.test.ts tests/debug/provider-reasoning-probe.test.ts tests/electron/main/message-serialization.test.ts tests/electron/renderer/streaming-state.test.ts
```

### Integration

Passed:

```bash
npm run integration
```

### Type/Build Check

Passed:

```bash
npm run check
```

### Live Probes

Passed:

```bash
npx tsx tests/debug/provider-reasoning-probe.ts --provider azure --all-efforts --max-chunks 6
npx tsx tests/debug/provider-reasoning-probe.ts --provider google --all-efforts --max-chunks 6
```

## Files Changed

### Core

- `core/openai-direct.ts`
- `core/google-direct.ts`
- `core/llm-manager.ts`
- `core/types.ts`
- `core/events/publishers.ts`

### Electron

- `electron/main-process/message-serialization.ts`
- `electron/renderer/src/streaming-state.ts`
- `electron/renderer/src/domain/chat-event-handlers.ts`
- `electron/renderer/src/hooks/useStreamingActivity.ts`
- `electron/renderer/src/components/MessageContent.tsx`

### Web

- `web/src/utils/sse-client.ts`
- `web/src/types/index.ts`
- `web/src/domain/message-content.tsx`

### Tests And Probe Tooling

- `tests/core/google-direct-streaming.test.ts`
- `tests/core/llm-providers/openai-direct-ollama-tools.test.ts`
- `tests/web-domain/stream-reasoning-content.test.ts`
- `tests/debug/provider-reasoning-probe.ts`
- `tests/debug/provider-reasoning-probe.test.ts`
- `tests/electron/main/message-serialization.test.ts`
- `tests/electron/renderer/streaming-state.test.ts`

## Follow-Up Notes

- The runtime and live renderers now preserve reasoning separately, but persisted assistant history does not yet store `reasoningContent` as durable chat message content.
- Azure acceptance of `reasoning_effort` is validated in this environment, but reasoning delta visibility remains model and API-version dependent.