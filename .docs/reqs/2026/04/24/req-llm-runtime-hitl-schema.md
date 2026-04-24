# Requirement: Adopt `llm-runtime` Structured HITL Schema

**Date**: 2026-04-24  
**Type**: Runtime Contract Alignment / HITL Schema Migration  
**Component**: `core/llm-runtime.ts`, `core/hitl-tool.ts`, `core/hitl.ts`, `server/api.ts`, `web` HITL domain/UI, `electron` HITL client flow, `cli` HITL flow  
**Related**: `.docs/reqs/2026/04/16/req-remove-internal-llm-package.md`, `.docs/reqs/2026/03/06/req-hitl-message-authoritative-state.md`, `docs/hitl-approval-flow.md`

## Overview

Agent World must adopt the current built-in HITL contract owned by `llm-runtime` and use it as the single approval/HITL mechanism instead of continuing to expose a repository-defined flat question/options schema or a separate Agent World-owned approval prompt model.

The runtime package now defines `ask_user_input` as the preferred public HITL tool name, with `human_intervention_request` retained only as a legacy alias of the same schema. That schema is structured around:

- top-level `type` with values `single-select` or `multiple-select`,
- top-level `allowSkip`,
- top-level `questions[]`,
- stable machine-readable question IDs and option IDs,
- and package-owned validation that rejects legacy flat HITL fields such as `question`, `options`, `defaultOption`, `timeoutMs`, and `metadata` as tool-call parameters.

Agent World currently still contains host-side HITL assumptions and replay/client models shaped around one flat prompt with one flat option list and one selected `optionId`. That is no longer aligned with the runtime contract.

This requirement makes `llm-runtime` the schema authority for approval and HITL requests and requires Agent World to support the structured request and response lifecycle end to end without losing the repository's existing queue, persistence, world isolation, and message-authoritative guarantees.

## Problem Statement

The external runtime already owns the built-in HITL tool contract, but Agent World still models approval/HITL with a legacy flat shape:

- one `question`,
- one flat `options` list,
- one `defaultOption`,
- one response `optionId`,
- and client parsers/replay helpers that reconstruct pending prompts from flat tool arguments.

That split contract creates several concrete problems:

- Agent World can advertise or persist a different HITL schema than the one the runtime validates.
- Structured runtime features such as multiple questions, multiple-select prompts, and skip-capable prompts cannot be represented faithfully by the current host/client response flow.
- Message-authoritative replay logic cannot reconstruct the full runtime-owned HITL request when only flat prompt assumptions are available.
- Persisted or live HITL state can drift between `llm-runtime`, core persistence, server transport, and the web/Electron/CLI clients.

## Goals

- Make `llm-runtime` the single authority for the approval/HITL tool schema.
- Adopt the structured `questions[]` HITL request model across Agent World runtime, transport, persistence, and clients.
- Support the full runtime-owned choice model: `single-select`, `multiple-select`, and `allowSkip`.
- Preserve stable question IDs and option IDs through request emission, persistence, replay, UI rendering, and response submission.
- Keep existing message-authoritative HITL guarantees while upgrading the schema.
- Preserve world/chat isolation and turn-lifecycle integrity.
- Route Agent World approval flows through `ask_user_input` instead of maintaining a separate repo-owned approval prompt contract.

## Non-Goals

- Redesigning the overall visual style of HITL UI beyond what is necessary to support the new schema.
- Introducing free-text HITL prompts.
- Changing unrelated queue, SSE, autosave, or non-HITL tool behavior.
- Replacing the legacy alias name `human_intervention_request` for historical compatibility or replay; compatibility may remain, but new approval/HITL generation must prefer `ask_user_input`.

## Functional Requirements

### REQ-1: `llm-runtime` Owns The Approval/HITL Request Schema

- Agent World **MUST** treat the `llm-runtime` built-in HITL schema as the contract authority for all approval/HITL requests.
- Agent World **MUST NOT** expose or maintain a different parameter schema for approval/HITL under a repo-owned tool or prompt contract.
- The required public approval/HITL tool name for new product behavior, prompts, skills, harnesses, and internal approval producers **MUST** be `ask_user_input`.
- `human_intervention_request` **MAY** remain available only as a legacy alias of the exact same schema and behavior for backward compatibility with historical prompts, persisted transcripts, or external callers.

### REQ-2: Agent World Must Use The Structured HITL Request Shape

- New HITL requests emitted through the built-in runtime path **MUST** use the structured request shape defined by `llm-runtime`:
  - `type?: "single-select" | "multiple-select"`
  - `allowSkip?: boolean`
  - `questions: Array<{ header, id, question, options: Array<{ id, label, description? }> }>`
- Omitting `type` **MUST** be treated as `single-select`.
- Omitting `allowSkip` **MUST** be treated as `false`.
- Each question **MUST** keep its own stable `id`.
- Each option **MUST** keep its own stable `id` within its owning question.
- Agent World **MUST NOT** rely on flat HITL request parameters such as `question`, `options`, `defaultOption`, `timeoutMs`, or ad hoc approval-kind fields for new approval/HITL requests.

### REQ-2A: Internal Approval Producers Must Also Use `ask_user_input`

- Internal approval-producing flows such as tool approvals, skill approvals, and agent-management confirmations **MUST** emit approval/HITL requests through the same `ask_user_input` contract rather than a separate core-owned prompt shape.
- Agent World **MUST NOT** maintain a parallel approval prompt family for internal flows once this migration lands.
- Internal approval flows **MAY** attach host-owned metadata in adjacent transport or persistence envelopes, but the request shape presented to the model, replay logic, and clients **MUST** still be the `ask_user_input` structured schema.

### REQ-3: Host Validation And Tool Advertising Must Match Runtime Validation

- Tool descriptions, published parameter schemas, and runtime validation behavior for built-in HITL tools **MUST** match the `llm-runtime` contract.
- Unknown flat HITL request parameters that the runtime rejects **MUST NOT** be reintroduced as accepted host-side parameters for the built-in HITL tool names.
- Agent World **MUST NOT** document or suggest deprecated flat HITL request fields for new prompts, skills, or harness instructions.

### REQ-4: Pending HITL Artifacts Must Preserve The Structured Request Model

- The pending HITL artifact emitted into Agent World events, server payloads, and client read models **MUST** preserve the structured request semantics needed to render and answer the runtime-owned request correctly.
- Pending artifacts **MUST** preserve, at minimum:
  - `requestId`,
  - selection `type`,
  - `allowSkip`,
  - all `questions[]`,
  - all question IDs,
  - all option IDs and labels,
  - world/chat scoping metadata,
  - owning tool identity where required for persistence and replay.
- Agent World **MUST NOT** flatten a multi-question or multiple-select runtime request into a single message/options prompt in transport or client state.
- Agent World **MUST NOT** preserve separate pending-artifact schemas for built-in versus internal approval prompts once both are routed through `ask_user_input`.

### REQ-5: HITL Response Submission Must Support Structured Answers

- Agent World **MUST** support structured HITL response submission that can represent the full answer space of the runtime-owned request model.
- The response path **MUST** support:
  - one answer per question for `single-select`,
  - multiple selected option IDs per question for `multiple-select`,
  - explicit skip handling when `allowSkip` is true,
  - validation against the authoritative question IDs and option IDs of the pending request.
- A single global `optionId` response model **MUST NOT** remain the only built-in HITL response path once the structured schema is adopted.
- Invalid answers, unknown question IDs, unknown option IDs, and skip attempts when `allowSkip` is false **MUST** be rejected deterministically.

### REQ-6: Persistence And Replay Must Remain Message-Authoritative Under The New Schema

- Message-authoritative HITL reconstruction **MUST** support the structured `questions[]` request model.
- Persisted assistant tool-call arguments, pending prompt replay artifacts, and any durable response artifacts **MUST** preserve enough structured data to reconstruct the same pending request and validate the same answer set after restore or restart.
- Replay, restore, chat switching, and edit/resubmit flows **MUST** derive pending structured HITL state from authoritative messages rather than from competing runtime-only prompt formats.
- Pending HITL ordering **MUST** remain deterministic for chats with multiple unresolved structured requests.

### REQ-7: Cross-Client HITL Behavior Must Stay Aligned

- Web, Electron, CLI, and server HITL flows **MUST** support the same structured built-in HITL contract.
- No client **MUST** silently downgrade structured HITL requests into a narrower local-only schema.
- All supported clients **MUST** preserve stable question IDs and option IDs when presenting prompts and submitting answers.
- Existing send-blocking behavior while a HITL prompt is pending **MUST** remain effective for structured requests.
- Clients **MUST** treat internal approvals and model-initiated HITL as the same `ask_user_input` prompt family, differing only by host metadata or surrounding UX copy where necessary.

### REQ-8: Historical Compatibility Must Be Explicit

- The migration **MUST** define how previously persisted flat built-in HITL prompts are handled.
- Existing persisted chats and unresolved prompts created under the prior flat schema **MUST NOT** become silently unresolvable.
- Historical compatibility **MUST** be satisfied by one of the following approved approaches:
  - a deterministic migration to the new structured representation, or
  - an explicit compatibility parser/replay path limited to historical data.
- The chosen compatibility approach **MUST NOT** weaken the new runtime-owned schema for newly created HITL requests.

### REQ-9: Runtime Ownership Boundaries Must Stay Clear

- Agent World **MUST** continue to own world/chat scoping, queue lifecycle, persistence, replay, transport, and UI/client rendering responsibilities.
- Agent World **MUST NOT** re-take ownership of the approval/HITL tool schema away from `llm-runtime`.
- Host-side code **MAY** translate runtime-owned HITL requests into Agent World persistence and client artifacts, but that translation **MUST NOT** change the semantic meaning of the request or the answer space.
- Host-side approval producers **MUST** adapt themselves to the runtime-owned `ask_user_input` schema rather than inventing a host-owned schema and asking clients to support both.

## Non-Functional Requirements

### Consistency

- The same structured HITL request **MUST** mean the same thing across runtime validation, persisted messages, replay, server transport, and all clients.

### Determinism

- The same persisted structured HITL transcript **MUST** reconstruct the same pending request set and answer-validation rules after reload or restart.

### Safety

- Structured HITL answers **MUST** remain world-scoped and chat-scoped.
- No cross-chat or cross-world answer leakage **MUST** be introduced by the schema upgrade.

### Maintainability

- Built-in HITL schema rules **SHOULD** live in one place only, under `llm-runtime`.
- Agent World client and replay helpers **SHOULD** operate on one canonical structured HITL read model rather than separate flat and structured models for new requests.

## Scope

### In Scope

- Built-in HITL tool definitions and schema exposure
- Core HITL request emission and pending-request bookkeeping
- Message-authoritative reconstruction of pending HITL prompts
- Server HITL transport and response submission contracts
- Web, Electron, and CLI HITL prompt parsing and response handling
- Historical compatibility or migration for previously persisted flat HITL prompts

### Out of Scope

- Non-built-in application-specific approval UIs unrelated to the built-in HITL schema
- New free-text or form-like HITL modes outside the runtime-owned structured choice model
- Broad UI redesign unrelated to structured HITL support

## Acceptance Criteria

- [ ] Agent World exposes `ask_user_input` using the same structured schema that `llm-runtime` defines.
- [ ] `human_intervention_request` remains, if at all, only as a legacy alias of that same schema.
- [ ] New built-in HITL requests use `questions[]` and do not rely on flat `question/options/defaultOption` parameters.
- [ ] Internal approval flows also emit `ask_user_input`-shaped structured requests instead of a repo-owned approval prompt contract.
- [ ] Agent World can represent and submit answers for multi-question `single-select` prompts.
- [ ] Agent World can represent and submit answers for `multiple-select` prompts.
- [ ] Skip-capable prompts are supported only when `allowSkip` is true and are rejected otherwise.
- [ ] Pending HITL replay from authoritative messages preserves question IDs, option IDs, selection type, and skip semantics.
- [ ] Web, Electron, CLI, and server HITL flows remain behaviorally aligned on the structured schema.
- [ ] Historical flat-schema prompts are either migrated or remain explicitly replayable/resolvable through a compatibility path.
- [ ] The schema migration does not break existing world/chat isolation, queue ownership, or message-authoritative HITL guarantees.

## User Stories

### Story 1: Runtime integrator

**As a** runtime integrator  
**I want** Agent World to use the built-in HITL schema that `llm-runtime` already defines  
**So that** the host does not drift from runtime validation and tool semantics.

### Story 2: Client maintainer

**As a** web, Electron, or CLI maintainer  
**I want** one structured HITL request model with stable IDs  
**So that** prompt rendering, replay, and response submission stay consistent across clients.

### Story 3: Persistence maintainer

**As a** persistence and restore maintainer  
**I want** structured HITL requests and answers to survive save, replay, and restart  
**So that** message-authoritative HITL behavior remains correct after the schema migration.

### Story 4: Existing user

**As a** user with older chats  
**I want** previously persisted unresolved HITL prompts to remain recoverable or migrated  
**So that** the schema upgrade does not strand existing conversations.

## Open Questions

1. Resolved in AP/AR: use one structured answer envelope with top-level `answers[]`, plus request-level `skipped` for `allowSkip` prompts.
2. Resolved in AP/AR: keep historical flat-schema chats compatible through lazy replay/restore parsing instead of eager storage migration.
3. Resolved in AP/AR: use `ask_user_input` for internal approvals too; host-only metadata belongs in adjacent transport/read-model envelopes, not in a parallel prompt schema.

## Architecture Review Notes (AR)

### High-Priority Issues Found And Resolved

- Contract drift risk: Agent World still defines a flat built-in HITL shape while `llm-runtime` owns a structured one.
  - Resolution: require `llm-runtime` to be the single schema authority for built-in HITL tools.
- Parallel-contract risk: keeping internal approvals on a repo-owned prompt shape would preserve two approval/HITL contracts and continue drift.
  - Resolution: require internal approval flows to use `ask_user_input` too, with only host metadata remaining outside the runtime schema.
- Answer-shape insufficiency: a single submitted `optionId` cannot represent multi-question or multiple-select prompts.
  - Resolution: require a structured answer submission contract with top-level `answers[]`, preserving question IDs and one-or-many option IDs per question, plus request-level skip.
- Replay loss risk: current message-authoritative reconstruction logic relies on flat arguments and would lose structured question metadata.
  - Resolution: require persistence and replay to preserve `type`, `allowSkip`, `questions[]`, and stable IDs.
- Cross-client downgrade risk: one client could implement only a flattened subset and diverge from server/runtime behavior.
  - Resolution: require web, Electron, CLI, and server parity on the same structured HITL model.
- Legacy-chat break risk: previously persisted unresolved flat prompts could become unrecoverable after the migration.
  - Resolution: require an explicit historical compatibility strategy; AP resolves this as lazy replay/restore compatibility rather than eager transcript migration.

### Decision

- Adopt the structured `llm-runtime` built-in HITL schema as the authoritative contract for Agent World's built-in human-input flow.

### Tradeoffs

- Full structured-schema adoption (selected)
  - Pros: one source of truth, future-proof for multiple questions and multiple-select, clear runtime ownership, less contract drift.
  - Cons: requires coordinated changes across persistence, transport, and all clients.
- Partial adapter that keeps flat host/client semantics (rejected)
  - Pros: smaller short-term UI/API change.
  - Cons: still loses information, cannot represent the full runtime contract, and keeps contract drift alive.

### AR Exit Condition

- No unresolved major issue remains once Agent World can explain approval and HITL request validation, persistence, replay, rendering, and answer submission entirely in terms of the structured `llm-runtime` `ask_user_input` schema plus explicit host-side transport wrappers.