# Plan: Reasoning Token Support

## Architecture Summary

Implement unified reasoning-stream support as a first-class transport contract across core,
Electron, and web.

The stable internal contract will be:

- assistant answer chunks continue using SSE `type: "chunk"` + `content`
- assistant reasoning chunks use the same SSE lifecycle but carry `reasoningContent`
- a user turn may emit both answer and reasoning chunks for the same `messageId`
- provider adapters emit structured chunk payloads rather than a string-only callback contract
- transport serializers and client typings preserve optional `reasoningContent` end-to-end
- reasoning effort is a world-scoped env key `reasoning_effort=<low|medium|high>` stored in
  `world.variables`, updated by UI, and read by the LLM layer at request time

This avoids overloading final answer text with provider-native reasoning fields and keeps the
existing `start -> chunk -> end` lifecycle intact.

## Architecture Review

### Reviewed Risks

1. **Smuggling reasoning into `content`**
   - Rejected.
   - It would corrupt final answer rendering, break existing message assumptions, and make
     separate reasoning UI impossible.

2. **Adding a separate SSE event type for reasoning**
   - Rejected.
   - It would widen the lifecycle surface and force more branching in clients.
   - Keeping reasoning on normal `chunk` events with a dedicated `reasoningContent` field
     preserves ordering and minimizes transport churn.

3. **Renderer-only implementation**
   - Rejected.
   - The send path and streaming contract are shared across providers and clients.
   - A renderer-only patch would leave web and non-Electron send/runtime behavior inconsistent.

4. **Provider-specific UI state**
   - Rejected.
   - The UI will expose one normalized reasoning-effort selection and map it per provider.
   - Provider-specific request details remain in core provider adapters.

5. **Partial transport widening**
   - Rejected.
   - The current codebase has field-whitelisting and single-channel type boundaries in provider
     callbacks, SSE event types, Electron realtime serialization, and web/Electron chunk typings.
   - Updating only some of those layers would silently drop `reasoningContent` or force it back
     into `content`, defeating the contract.

6. **Piggybacking reasoning effort on global settings**
   - Rejected.
   - Existing process-level `systemSettings` are not the right source of truth for a world runtime
     policy.
   - The setting should follow the established `working_directory` / `tool_permission` pattern by
     persisting in `world.variables` and being consumed by core at request time.

7. **Per-turn send metadata for reasoning effort**
   - Rejected.
   - The requested behavior is not per-turn. It is a world-scoped setting controlled by UI and
     persisted with the world.
   - Reusing the existing world env pattern avoids widening queue payloads and keeps the behavior
     aligned with other LLM/runtime controls in this repo.

### Provider Mapping Decisions

- **Ollama / OpenAI-compatible stream parsing**
  - Accept `delta.thinking`, observed Ollama `delta.reasoning`, `delta.reasoning_content`, and `delta.thought` if present.
  - Continue using `delta.content` for the answer channel.
  - Treat `delta.reasoning` as a verified local Ollama/Qwen streaming field, not just a speculative compatibility alias.
- **Normalized effort levels**
  - The product-level values are exactly `low`, `medium`, and `high`.
  - Providers with coarser native controls may collapse adjacent levels gracefully.
- **OpenAI / ChatGPT effort control**
  - Map normalized effort to request fields such as `reasoning_effort` when supported.
- **Gemini effort control**
  - The current code uses the official Google SDK, not an OpenAI shim.
  - Internally map the normalized effort to Google thinking config while still accepting
    provider-native thought output as reasoning content.
- **Ollama effort control**
  - Map `low` to disabled thinking when supported.
  - Map `medium` / `high` to enabled thinking, collapsing levels gracefully if the provider only
    supports a boolean `think` toggle.

### Configuration Decision

Reasoning effort is world-scoped configuration, not queued turn metadata.

Because current runtime boundaries are partly typed and partly serializer-driven, the same is
true for reasoning chunks: the normalized `reasoningContent` field must be preserved through the
provider callback shape, `WorldSSEEvent`, server SSE forwarding, Electron realtime serialization,
and web/Electron stream event typings.

That means the change must propagate through:

- world `variables` env read/write helpers
- UI handlers that persist env-backed world settings
- LLM request preparation that reads `reasoning_effort` from `world.variables`
- provider chunk callbacks and SSE serializers
- provider request construction

Without that, the UI and runtime would drift and the selected effort would not reliably control
subsequent LLM requests.

## Implementation Phases

- [x] Extend provider chunk callbacks, core SSE contracts, and serializer-whitelisted realtime payloads with normalized reasoning fields.
- [x] Add a world-scoped `reasoning_effort` env setting with `low`, `medium`, and `high` values, following the existing `working_directory` / `tool_permission` UI-to-world-variables pattern.
- [x] Read `reasoning_effort` from `world.variables` during LLM request construction instead of introducing per-turn send metadata.
- [x] Parse provider-native reasoning deltas in OpenAI-compatible and Google streaming adapters.
- [x] Map normalized effort to provider request controls with graceful fallback behavior.
- [x] Update Electron streaming state and message rendering to show reasoning separately from answer text.
- [x] Update web SSE state and message rendering to show reasoning separately from answer text.
- [x] Add targeted regression tests for provider parsing, chat-event propagation, and composer env-setting persistence.
- [x] Run focused tests, `npm run integration`, and `npm run check`.
