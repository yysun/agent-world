# REQ: `create_agent` Post-Create HITL Info Notice + Refresh Flag

## Summary
After `create_agent` successfully creates an agent, the system must present a HITL informational message confirming creation (including details), and include a boolean flag that instructs the client to auto-refresh world display/subscription after the confirmation is dismissed.

## Problem Statement
Today, users can encounter stale world/agent UI state immediately after `create_agent` success, and there is no guaranteed post-create confirmation interaction that carries a refresh intent signal tied to dismissal.

## Goals
- Show a post-create HITL informational confirmation after successful `create_agent` execution.
- Include agent creation details in that confirmation.
- Provide an explicit refresh-intent flag so clients can refresh world display/subscription after dismissal.

## Non-Goals
- Changing how pre-create approval works.
- Changing agent creation input schema for required/optional create fields.
- Redesigning general HITL UI patterns unrelated to this flow.

## Requirements (WHAT)
1. On successful `create_agent`, the system MUST emit/show a HITL informational message after creation is complete.
2. The informational message MUST include the text pattern: `Agent <name> has been created`.
3. The informational message MUST include creation details sufficient for user confirmation (at minimum: created agent name and key effective settings used for creation).
4. The informational message MUST be dismissible using the existing HITL interaction model.
5. The HITL informational payload MUST include a boolean flag indicating whether the client should auto-refresh world display/subscription when the message is dismissed.
6. For `create_agent` success confirmations, this refresh-after-dismiss flag MUST be set to `true`.
6. When the flag is `true` and the user dismisses the confirmation, the client/runtime flow MUST trigger refresh behavior for world display and active subscription state.
7. When the flag is `false`, dismissal MUST NOT trigger auto-refresh from this mechanism.
8. If agent creation fails, this post-create informational confirmation MUST NOT be shown.
9. Existing create failure/denial semantics MUST remain unchanged.
10. The post-create informational confirmation MUST be emitted at most once per successful `create_agent` call.
11. Refresh behavior triggered by this mechanism MUST be idempotent (no harmful duplicate world/subscription state transitions if dismissal handling runs more than once).

## Acceptance Criteria
- A successful `create_agent` run produces a post-create HITL info confirmation.
- The confirmation contains `Agent <name> has been created` and includes creation details.
- The confirmation payload includes the refresh-after-dismiss boolean flag.
- For successful `create_agent`, the refresh-after-dismiss flag value is `true`.
- Dismissing confirmation with flag `true` refreshes world display and subscription state.
- Dismissing confirmation with flag `false` does not auto-refresh.
- Denied/timed-out/failed `create_agent` flows do not produce this post-create info confirmation.
- A successful `create_agent` flow emits only one post-create informational confirmation.

## Architecture Review Notes (AR)

### High-Priority Issues Found and Resolved

- Ambiguity: the original REQ did not define the expected flag value for the `create_agent` success path.
	- Resolution: require `refreshAfterDismiss = true` for successful `create_agent` confirmations.
- Ambiguity: duplicate confirmation or duplicate dismissal handling could trigger redundant refresh.
	- Resolution: require at-most-once confirmation emission and idempotent refresh behavior.

### Decision

- Keep refresh execution client-driven on dismissal, with explicit server/tool payload intent via boolean flag.
- Keep this feature additive to existing approval and failure semantics.

### Tradeoffs

- Client-driven refresh after dismissal (selected)
	- Pros: aligns refresh timing with user acknowledgement; avoids pre-dismiss UI jumps.
	- Cons: requires consistent dismissal handling across clients.
- Immediate refresh on create success (rejected)
	- Pros: simpler trigger point.
	- Cons: can race with confirmation UX and causes refresh before acknowledgement.
