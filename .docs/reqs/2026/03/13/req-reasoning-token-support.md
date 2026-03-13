# Unified Reasoning Token Support And World-Scoped Effort Control

## Problem

Agent World currently treats streamed assistant output as a single visible content channel.
That is insufficient for modern reasoning-capable providers, because their streaming payloads
separate "thinking" from the final answer using provider-specific fields.

Today this creates three product gaps:

1. Provider-native reasoning tokens are not handled consistently across Ollama, OpenAI/ChatGPT,
   and Gemini.
2. The UI cannot render reasoning in a distinct surface from the final answer stream.
3. The product does not expose a user-facing reasoning-effort control that persists like other
   world runtime settings, so users cannot reliably choose how much reasoning to request.

## Goal

Support provider-native reasoning token streaming for Ollama, OpenAI/ChatGPT, and Gemini,
and expose a message-composer dropdown that lets the user control a world-scoped reasoning
effort setting.

## Supported Provider Contracts

The system must recognize the following provider-specific reasoning/answer contracts.

| Feature | Ollama (Qwen 3.5 / R1) | ChatGPT / OpenAI (5.x / o-series) | Gemini (2.5 / 3.x series) |
|---|---|---|---|
| Thinking field | `delta.thinking` and observed `delta.reasoning` | `delta.reasoning_content` | `candidates[].content.parts[]` where `part.thought === true` and text is in `part.text` |
| Answer field | `delta.content` | `delta.content` | `candidates[].content.parts[]` where `part.thought` is absent/false and text is in `part.text` |
| Effort control | normalized `low|medium|high` mapped to provider support | normalized `low|medium|high` mapped to provider support | normalized `low|medium|high` mapped to provider support |
| Logic type | Raw chain-of-thought stream | Hidden or summarized reasoning stream | Thought summary stream |
| Overthink fix | `presence_penalty: 1.5` | Managed by OpenAI | Managed by Google |

## Requirements

1. The streaming pipeline MUST recognize provider-native reasoning fields for:
   - Ollama: `choices[].delta.thinking`
   - Ollama (observed Qwen stream via local OpenAI-compatible endpoint): `choices[].delta.reasoning`
   - OpenAI/ChatGPT: `choices[].delta.reasoning_content`
   - Gemini: `candidates[].content.parts[]` entries where `part.thought === true`
2. The streaming pipeline MUST continue to treat final-answer text as:
   - `choices[].delta.content` for Ollama and OpenAI/ChatGPT
   - `candidates[].content.parts[]` entries where `part.thought` is absent or false for Gemini
3. Reasoning tokens MUST remain distinct from final-answer tokens throughout the runtime and UI
   pipeline.
4. The UI MUST be able to render reasoning tokens in a separate bubble or secondary container
   while answer tokens continue streaming in the normal assistant chat bubble.
5. The product MUST support interleaved chunks where a turn may emit reasoning tokens first,
   answer tokens later, or a mixture across the same assistant response.
6. Reasoning-only chunks MUST NOT create empty, duplicate, or corrupted answer bubbles.
7. Existing streaming lifecycle guarantees MUST remain intact:
   `start -> chunk -> end`, error signaling, chat scoping, and assistant-turn identity must
   remain deterministic.
8. The system MUST NOT rely on literal inline `<think>` tags in answer text as the primary
   protocol for these providers when structured reasoning fields are present.
9. If a client does not yet render reasoning separately, it MUST preserve the reasoning payload
   without corrupting or appending it directly into the final-answer stream by default.
10. The normalized reasoning field MUST survive every typed and serialized transport boundary,
    including provider stream callbacks, core SSE payloads, server SSE forwarding, Electron
    realtime serialization, and web/Electron client chunk typings. Field-whitelisting layers
    MUST NOT silently drop `reasoningContent`.

## Reasoning Effort Setting

1. The message composer MUST include a visible reasoning-effort dropdown for user turns.
2. The dropdown MUST expose exactly three normalized values: `low`, `medium`, and `high`.
3. The selected value MUST be stored as an env key `reasoning_effort=<value>` inside the
   world's existing `variables` text field, following the same pattern as `working_directory`
   and `tool_permission`.
4. No dedicated DB column, queue-row column, or send-payload schema field is required for the
   setting itself; the LLM runtime MUST read it from `world.variables` when preparing a request.
5. If the key is absent, the product MUST treat the effective value as `medium`.
6. The control MUST support provider-appropriate mapping:
   - Ollama: map `low` to disabled thinking when supported; map `medium`/`high` to enabled
     thinking, with graceful collapsing of levels when the provider exposes only boolean control.
   - OpenAI/ChatGPT: map normalized effort to provider request fields such as
     `reasoning_effort` when supported.
   - Gemini: map normalized effort to Google thinking configuration when supported.
    - Generic third-party `openai-compatible` providers are NOT required to receive
       `reasoning_effort` until that request field is validated against the specific target server.
7. The UI MUST make it clear that reasoning effort is a world-scoped setting persisted in the
   current world's env text, not a transcript mutation.
8. Providers that do not support the currently selected effort mode MUST degrade gracefully
   without breaking normal message sending.

## Unified Handling Requirement

The product should support a unified reasoning-stream interpretation equivalent to:

```ts
for await (const chunk of stream) {
  const delta = chunk.choices[0]?.delta;
   if (delta) {
      const thinkingToken =
         (delta as any).thinking
         || (delta as any).reasoning
         || (delta as any).reasoning_content;

      if (thinkingToken) {
         // route to reasoning UI/state
      }

      if (delta.content) {
         // route to answer UI/state
      }
  }

   const parts = chunk.candidates?.[0]?.content?.parts || [];
   for (const part of parts) {
      if (part?.thought === true && part.text) {
         // route to reasoning UI/state
      } else if (part?.text) {
         // route to answer UI/state
      }
  }
}
```

This snippet is illustrative of the required behavior, not a mandated implementation.

## Non-Goals

1. Do not require all providers to expose reasoning under the same raw field name.
2. Do not require raw reasoning content to be persisted as ordinary assistant answer text.
3. Do not require the same reasoning visibility policy across providers beyond supporting a
   separate reasoning UI surface.
4. Do not require literal `<think>` tag parsing as the primary reasoning protocol for these
   providers.

## Acceptance Criteria

1. When Ollama streams `delta.thinking` or observed `delta.reasoning`, the product exposes that as
   a reasoning stream separate from `delta.content`.
2. When OpenAI/ChatGPT streams `delta.reasoning_content`, the product exposes that as a reasoning
   stream separate from `delta.content`.
3. When Gemini streams thought-marked `content.parts`, the product exposes those parts as a
   reasoning stream separate from non-thought answer parts.
4. A UI client can render reasoning in a dedicated secondary bubble while the answer continues
   streaming in the main assistant bubble for the same turn.
5. The message composer shows a reasoning-effort dropdown with `low`, `medium`, and `high`
   options.
6. Changing the dropdown persists `reasoning_effort` into world `variables`, and the LLM request
   path uses that stored value in a provider-appropriate form.
7. Generic third-party `openai-compatible` providers are not assumed to support
   `reasoning_effort` unless explicitly validated.
8. Existing field-whitelisting transport layers do not drop `reasoningContent` before the UI can
   consume it.
9. Existing non-reasoning streaming behavior remains unchanged for providers that do not emit
   reasoning fields.
