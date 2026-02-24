# Requirement: Main Agent Routing and Agent Auto Reply

## Overview
Add two configuration fields to control message routing and sender-reply behavior.

## Goals
- Allow worlds to optionally force user messages to one configured main agent.
- Allow per-agent control over whether agent messages auto-reply to the sender.

## Functional Requirements
- REQ-1: Add world configuration field `mainAgent` (nullable string).
- REQ-2: When `world.mainAgent` is set, each incoming human/user message is treated as directed to that agent by auto-prepending `@{mainAgent}` if no leading mention exists.
- REQ-3: When `world.mainAgent` is not set, existing behavior remains unchanged (user messages can be broadcast or mention-targeted as today).
- REQ-4: Add agent configuration field `autoReply` (boolean, default `true`).
- REQ-5: When an agent with `autoReply=false` produces a message, world must not auto-reply back to sender using auto-mention logic.
- REQ-6: Existing behavior remains for `autoReply=true`.
- REQ-7: Both fields persist through storage and retrieval APIs.
- REQ-8: Add tests for routing and reply behavior.
- REQ-9: Web app world edit form must expose `mainAgent` as an editable field and allow clearing it.
- REQ-10: Electron app world edit form must expose `mainAgent` as an editable field and allow clearing it.
- REQ-11: Web app agent edit form must expose `autoReply` as an editable boolean (default ON).
- REQ-12: Electron app agent edit form must expose `autoReply` as an editable boolean (default ON).
- REQ-13: Form save/update flows in both clients must submit and display persisted `mainAgent` and `autoReply` values.

## Non-Functional Requirements
- Backward compatibility with existing worlds/agents and old persisted rows.
- No breaking API changes for existing callers.

## Constraints
- Follow current event and orchestrator architecture.
- Preserve existing mention semantics unless explicitly changed by the new config.

## Acceptance Criteria
- [x] World supports optional `mainAgent` config.
- [x] Agent supports `autoReply` config defaulting to true.
- [x] User messages route to main agent when configured.
- [x] Auto-reply is disabled for agents with `autoReply=false`.
- [x] Persistence layer stores and loads both fields.
- [x] Unit tests validate behavior and defaults.
- [x] Web world edit form supports viewing/editing/clearing `mainAgent`.
- [x] Electron world edit form supports viewing/editing/clearing `mainAgent`.
- [x] Web agent edit form supports viewing/editing `autoReply`.
- [x] Electron agent edit form supports viewing/editing `autoReply`.
