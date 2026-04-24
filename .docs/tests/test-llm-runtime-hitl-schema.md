# Test Spec: `llm-runtime` Structured HITL Schema

**Date:** 2026-04-24  
**Related Requirement:** [req-llm-runtime-hitl-schema.md](/Users/esun/Documents/Projects/agent-world/.docs/reqs/2026/04/24/req-llm-runtime-hitl-schema.md)  
**Related Plan:** [plan-llm-runtime-hitl-schema.md](/Users/esun/Documents/Projects/agent-world/.docs/plans/2026/04/24/plan-llm-runtime-hitl-schema.md)

## Goal

Verify that Agent World uses `llm-runtime`'s `ask_user_input` schema as the single approval/HITL contract across core runtime behavior, persistence/replay, server transport, and clients.

The resulting system should no longer depend on a repo-owned flat approval/HITL prompt shape for new requests, and it should keep older flat-schema transcripts replayable through explicit compatibility behavior.

## Scope

- runtime-owned `ask_user_input` request schema exposure
- alias compatibility for `human_intervention_request`
- internal approval flows migrating onto `ask_user_input`
- structured pending prompt artifacts
- structured answer submission contract
- message-authoritative replay and restart safety
- web, Electron, and CLI prompt parsing/submission behavior
- historical flat-schema compatibility for persisted chats

## Scenarios

### 1. Runtime-exposed HITL tool schema matches `llm-runtime`

Given Agent World resolves tools for a world with built-in HITL enabled  
When the resolved tool catalog exposes `ask_user_input`  
Then its description and parameter schema should match the `llm-runtime` structured contract  
And the schema should use `type`, `allowSkip`, and `questions[]` rather than flat `question/options/defaultOption` fields.

### 2. Legacy alias remains equivalent but is not the preferred generation path

Given Agent World exposes both `ask_user_input` and `human_intervention_request` for compatibility  
When the tool catalog is inspected  
Then `human_intervention_request` should be only a legacy alias of the same structured schema  
And new prompts, harness instructions, and internal approval producers should prefer `ask_user_input`.

### 3. Model-initiated structured single-select request becomes a pending prompt

Given an assistant tool call to `ask_user_input` with one or more `single-select` questions  
When Agent World persists and emits the pending request  
Then the pending artifact should preserve `requestId`, `type`, `allowSkip`, `questions[]`, question IDs, and option IDs  
And clients should render the same structure without flattening it into one global option list.

### 4. Internal approval producers emit `ask_user_input`-shaped requests too

Given an internal approval-producing flow such as `shell_cmd`, `load_skill`, or `create_agent`  
When that flow requests human approval  
Then the emitted pending prompt should use the same structured `ask_user_input` request family  
And any approval-specific origin details should appear only as adjacent host metadata, not as a separate prompt schema.

### 5. Structured single-select answers validate one answer per question

Given a pending structured `single-select` request with one or more questions  
When the client submits a structured answer envelope  
Then each question must have exactly one selected option ID  
And core validation should reject missing question answers, duplicate answers for the same question, or multiple selected options for a `single-select` question.

### 6. Structured multiple-select answers preserve one-or-many option IDs per question

Given a pending structured `multiple-select` request  
When the client submits answers with one or more option IDs per question  
Then the submission should be accepted if all option IDs belong to that question  
And the turn should resume using the validated structured answer set.

### 7. Skip is allowed only when `allowSkip` is true

Given a pending request with `allowSkip: true`  
When the client submits a structured response with `skipped: true` and no answers  
Then the request should be accepted as a valid skip outcome.

Given a pending request with `allowSkip: false`  
When the client submits `skipped: true`  
Then the request should be rejected with a deterministic validation error.

### 8. Invalid structured answers are rejected deterministically

Given a pending structured request  
When the client submits:
- an unknown `questionId`,
- an unknown `optionId`,
- an answer for the wrong chat,
- or an answer for a request that is no longer pending  
Then Agent World should reject the submission with a stable, user-actionable error result  
And should not mutate unrelated pending requests.

### 9. Message-authoritative replay reconstructs structured pending requests

Given a persisted chat transcript containing unresolved `ask_user_input` tool calls  
When the chat is restored or activated  
Then the pending prompt set should be reconstructed from authoritative messages  
And the reconstructed prompts should preserve `type`, `allowSkip`, `questions[]`, and stable IDs  
And the pending ordering should remain deterministic.

### 10. Historical flat-schema built-in requests remain replayable

Given a persisted chat transcript containing older unresolved built-in HITL tool calls that still use flat `question/options/defaultOption` arguments  
When the chat is restored or replayed after the migration  
Then Agent World should reconstruct a compatible structured pending request from those historical messages  
And the request should remain resolvable through the new structured answer path  
And no new prompt generation path should continue emitting that legacy flat schema.

### 11. Restart-safe response flow remains intact with structured prompts

Given a server restart occurs after a pending structured HITL request is persisted in chat messages but before the runtime pending map is reactivated  
When a client submits a structured answer to `/worlds/:worldName/hitl/respond`  
Then the API should provide the same restart-safe activation guidance or recovery path as today  
And, after activation, the same structured answer should be accepted without schema loss.

### 12. Chat switch and edit/resubmit flows do not leak or orphan structured prompts

Given multiple chats or edited message branches produce pending structured HITL requests  
When the user switches chats or edits/resubmits a message chain  
Then only prompts supported by the authoritative messages of the active chat should remain pending  
And stale prompts from superseded branches should be removed without affecting surviving requests.

### 13. Web client renders and submits structured prompts without flattening

Given the web client receives a pending structured HITL prompt  
When it renders the prompt and the user answers it  
Then the UI should preserve the question grouping and option IDs  
And the API payload should use the structured answer envelope rather than a single `optionId`.

### 14. Electron client renders and submits structured prompts without flattening

Given the Electron renderer receives a pending structured HITL prompt via IPC or realtime events  
When it renders the prompt and submits an answer  
Then the IPC payload should use the structured answer envelope  
And the renderer should preserve the same question grouping and skip semantics as web.

### 15. CLI client collects structured answers deterministically

Given the CLI receives a pending structured HITL prompt  
When the user responds through the CLI  
Then the CLI should collect answers per question using stable IDs  
And submit the same structured answer envelope used by the other clients  
And invalid or incomplete answers should be rejected before submission when possible.

### 16. Send-blocking behavior remains effective for structured prompts

Given a pending structured approval/HITL prompt exists for the active chat  
When the user attempts to send a new chat message before resolving it  
Then the web and Electron composers should continue blocking the send flow  
And the CLI interactive flow should continue isolating the pending HITL interaction.

### 17. Reserved-name host collisions do not reappear

Given Agent World integrates with `llm-runtime` built-ins  
When runtime tool resolution occurs  
Then Agent World should not redefine `ask_user_input` or `human_intervention_request` under host-owned schemas  
And the runtime should not encounter reserved built-in name collisions caused by repo-owned HITL schema registration.

## Validation Notes

- Prefer focused unit tests at the host boundary for:
  - structured prompt registration,
  - structured answer validation,
  - message-authoritative replay,
  - API/IPC payload shape,
  - and internal approval adaptation onto `ask_user_input`.
- Keep storage, LLM calls, and external tool execution mocked or in-memory.
- Add at least one regression per client boundary that proves the old single-`optionId` contract is no longer the only supported response path.
- Run integration coverage because server/runtime transport paths are changing.