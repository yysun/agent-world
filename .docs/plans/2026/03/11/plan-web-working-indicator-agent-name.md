# Plan: Web Working Indicator Agent Name

**Date:** 2026-03-11  
**Req:** `.docs/reqs/2026/03/11/req-web-working-indicator-agent-name.md`

## Approach

- [ ] Update web world-activity handling to derive `activeAgent` from `activeAgentNames` and `source`, resolving agent IDs/names against the loaded world roster.
- [ ] Remove the transcript waiting-label fallback that currently guesses with `agents[0]`.
- [ ] Add targeted unit tests for activity-driven active-agent selection and waiting-label fallback behavior.
- [ ] Run the affected vitest coverage for the updated web handlers/components.

## AR Notes

- `core/activity-tracker.ts` already emits `activeAgentNames` in chat-scoped world activity payloads, so no backend contract change is needed.
- The existing web bug comes from two issues together: `handleWorldActivity` only toggles `isWaiting`, and `world-chat.tsx` falls back to the first agent in the world when no active agent is set.
- For concurrent activity, the web indicator should prefer a single resolved active agent only when one can be identified; otherwise it should avoid claiming a specific agent.
