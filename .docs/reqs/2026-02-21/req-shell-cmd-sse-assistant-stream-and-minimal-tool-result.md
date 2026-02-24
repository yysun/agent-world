# REQ: Shell Command SSE Assistant Streaming and Minimal Tool Result

## Summary
Change shell command tool behavior so runtime output streams directly to clients as assistant SSE message chunks, while the post-execution tool result returned to the LLM is reduced to a minimal success/failure status contract.

## Problem Statement
Current shell command handling can blur two responsibilities:
- Live UX streaming to the client during command execution.
- Final tool-call result payload provided back to the LLM after execution.

This creates ambiguity in where rich output should live and can over-couple LLM tool-result payloads with large command output bodies.

## Goals
- Ensure live command output is delivered to the client in real time as assistant streaming content.
- Ensure the final tool result sent back to the LLM is compact and status-focused.
- Remove ambiguity between streaming transport data and final tool-call completion metadata.

## Non-Goals
- Redesigning command execution security/sandbox policy.
- Changing command parsing or argument validation behavior.
- Introducing new UI styling requirements beyond message-type routing.

## Requirements (WHAT)
1. During shell command execution, output chunks must be streamed to the client via SSE as assistant message stream content.
2. During execution, chunk data must not be emitted as tool message content for client display.
3. The client-visible stream must preserve chunk ordering from command execution.
4. After command completion, the tool-call result delivered to the LLM must contain only minimal completion status data.
5. The minimal completion status must include success/failure and completion code semantics (for example, exit code).
6. The tool-call result delivered to the LLM must not include full stdout/stderr transcript bodies.
7. Non-zero exit, timeout, or cancellation outcomes must be represented as failure in the final minimal status contract.
8. The change must apply specifically to shell command tool execution flow and must not regress unrelated tool result behavior.

## Acceptance Criteria
- Running a command that emits multiple output chunks causes the client to receive those chunks in assistant SSE stream events during execution.
- While execution is active, no chunk is surfaced to the client as a tool message payload.
- On exit code `0`, the LLM-facing tool result is a minimal success response with completion code metadata.
- On non-zero exit code, the LLM-facing tool result is a minimal failed response with completion code metadata.
- The LLM-facing tool result does not include full stdout/stderr body text for either success or failure.

## Architecture Review (AR)

### Review Summary
Approved. The requirement is narrowly scoped, internally consistent, and separates streaming transport concerns from tool-result contract concerns.

### Key Assumption Checks
- Streaming and final tool-result channels are treated as distinct responsibilities.
- Existing SSE assistant streaming paths remain the canonical client live-output channel.
- Minimal tool-result contracts reduce token overhead and coupling without changing command execution semantics.

### Risks and Mitigations
- Risk: Existing consumers may rely on verbose tool-result output text.
  - Mitigation: Require explicit status/exit-code semantics and validate downstream consumers against the new contract.
- Risk: Misrouting chunks as tool messages may persist if legacy branches remain.
  - Mitigation: Enforce acceptance criteria that chunk routing is assistant SSE stream only.
