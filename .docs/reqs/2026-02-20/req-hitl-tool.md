# REQ: HITL Tool for Questions, Options, and Confirmation

## Summary
Add a built-in HITL (human-in-the-loop) interaction tool that an LLM can call to ask the user a question, present selectable options, and collect an explicit confirmation before the interaction is finalized.
The tool is intentionally options-only for simplicity and deterministic behavior.

## Problem Statement
Current tool interactions do not provide a single, standardized HITL flow that consistently supports all three steps in one lifecycle:
1) ask a human question,
2) offer choices,
3) confirm final intent.

Without this, model-driven workflows may proceed with ambiguous user intent or inconsistent UI/CLI behavior.

## Goals
- Provide one first-class HITL tool callable by LLMs for human clarification/decision points.
- Keep LLM-initiated HITL interactions options-only (no free-text path).
- Require explicit confirmation for flows that request confirmation.
- Return a structured result the LLM can reliably consume.
- Prevent new chat sends while a HITL prompt is pending in client UI.

## Non-Goals
- Redesigning unrelated approval UX or tool protocols.
- Changing unrelated world/agent lifecycle behavior.
- Introducing cross-app shared modules between web and electron apps.

## Requirements (WHAT)
1. The system MUST expose a built-in HITL tool callable by LLMs in supported runtimes.
2. The HITL tool MUST support a question prompt shown to the human.
3. The HITL tool MUST support presenting one or more selectable options.
4. The human MUST be able to select one option; invalid selections MUST be rejected.
5. The built-in `hitl_request` tool MUST require at least one option and MUST remain options-only.
6. The HITL tool MUST support confirmation behavior, where the human explicitly confirms or cancels before completion.
7. When confirmation is required, the interaction MUST NOT complete until the human confirms or cancels.
8. The tool result MUST include enough structured data for LLM continuation, including:
   - whether the interaction was confirmed or canceled,
   - selected option (if any).
9. If the user cancels, the tool MUST return a cancellation result and MUST NOT report success.
10. The HITL request/response lifecycle MUST be auditable in existing message/event history.
11. HITL interactions MUST be scoped to the initiating tool call and MUST NOT be fulfillable by unrelated calls.
12. Existing system-enforced approval flows (`create_agent`, `load_skill`) MUST remain behaviorally separate from LLM-initiated `hitl_request` calls while sharing common HITL runtime/UI plumbing.
13. While a HITL prompt is pending, clients MUST block sending new user chat messages until the prompt is resolved.
14. Existing non-HITL tool flows MUST remain backward compatible.

## Non-Functional Requirements
- Interaction outcomes MUST be deterministic for a single completed user action.
- Validation errors MUST be user-actionable and unambiguous.
- The behavior MUST be consistent across supported interfaces (at minimum web and CLI).

## Acceptance Criteria
- LLM can invoke HITL tool with a question prompt.
- HITL request can include selectable options, and valid option choice is captured.
- Invalid option input is rejected with a clear error.
- Unsupported free-text input fields are rejected by `hitl_request` with a clear validation error.
- Confirmation-required requests return either `confirmed` or `canceled` outcome explicitly.
- Canceled requests do not report success.
- Completed requests return structured payload containing confirmation status and selected option.
- HITL request/response is recorded in existing message/event audit trail.
- Existing system-enforced approvals and non-HITL behavior remain unchanged.
- Web and Electron composer paths do not send new messages while HITL prompt queue is non-empty.

## Architecture Review Notes (AR)

### High-Priority Issues Found and Resolved
- Ambiguity: "show confirmation" could mean informational display only vs mandatory explicit confirm/cancel.
  - Resolution: require explicit confirm/cancel semantics when confirmation is requested.
- Complexity risk: free-text mode increases ambiguity and downstream branching cost.
  - Resolution: enforce options-only policy in `hitl_request`.
- Concurrency risk: users can send unrelated chat messages while HITL decision is pending.
  - Resolution: block new sends while HITL prompt queue is non-empty.

### Decision
- Define `hitl_request` as options-only lifecycle with optional explicit confirmation/cancel outcome.

### Tradeoffs
- Single standardized HITL contract (selected)
  - Pros: predictable LLM orchestration and easier validation/auditing.
  - Cons: less flexibility for ad-hoc, unstructured human prompts.
- Separate tools for question/options/confirmation (rejected)
  - Pros: narrower tools.
  - Cons: fragmented flows and higher orchestration complexity.
