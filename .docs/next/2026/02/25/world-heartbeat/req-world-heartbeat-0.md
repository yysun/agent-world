# REQ: Configurable world heartbeat messages

**Last Updated:** 2026-02-25

## Summary
Add a configurable heartbeat mechanism for worlds so a world can periodically inject a predefined prompt as a message with `sender='world'` into the world’s currently active chat.

## Problem
Some workflows need autonomous, periodic nudges or status prompts without manual user input. Today, worlds only receive messages when explicitly submitted, so there is no built-in periodic trigger mechanism.

## Requirements (WHAT)
1. A world must support heartbeat configuration that includes:
   - whether heartbeat is enabled,
   - a cron-style schedule,
   - a user-defined prompt message.
2. When heartbeat is enabled, the system must periodically emit a message into the world’s current active chat according to the configured schedule.
3. Heartbeat-emitted messages must use `sender='world'`.
4. Each emitted heartbeat message must be routed through the same world message flow as regular messages for that chat.
5. If heartbeat is disabled, no scheduled heartbeat messages are emitted.
6. If a world has no active chat at an execution tick, the heartbeat must not emit a message for that tick.
7. Heartbeat behavior must be world-scoped; enabling or changing one world’s heartbeat must not affect other worlds.
8. Heartbeat configuration must be updateable after world creation.
9. Invalid or missing heartbeat schedule/prompt configuration must not result in undefined behavior (for example, no silent malformed emissions).

## Acceptance Criteria
- Given a world with heartbeat enabled, a valid cron-style schedule, and a configured prompt, when a scheduled tick occurs and the world has an active chat, then one message is emitted into that active chat with `sender='world'` and the configured prompt content.
- Given a world with heartbeat disabled, when scheduled time passes, then no heartbeat messages are emitted.
- Given a world with heartbeat enabled but no current active chat at tick time, then no heartbeat message is emitted for that tick.
- Given two worlds with different heartbeat configurations, when ticks occur, then each world emits only according to its own configuration.
- Given heartbeat configuration is updated, subsequent ticks reflect the updated enablement/schedule/prompt settings.

## Out of Scope
- Defining or changing agent response policies to heartbeat messages.
- Adding new UI/UX beyond configuration exposure needed to set heartbeat fields.
- Backfilling or replaying missed heartbeat ticks while the runtime is unavailable.

## Notes
This REQ defines expected behavior only and intentionally does not prescribe implementation details.

## Implementation Status
- Planned (not yet implemented).
