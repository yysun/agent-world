# DD: World Message Queueing and Heartbeat Logging

**Date:** 2026-03-14  
**Status:** Done  
**Related REQ:** None  
**Related AP:** None

## Summary

Updated world-originated messages so they follow the same queue-backed ingress and mention-targeting behavior as human messages, rather than bypassing queue processing as immediate dispatch. This applies to API/tool/runtime ingress and to heartbeat-generated world prompts.

Also replaced heartbeat cron `console` output with categorized structured logger events so diagnostics can be enabled via environment configuration, for example `LOG_HEARTBEAT=debug`.

During CR, one metadata inconsistency was found and fixed before close-out: persisted event metadata still marked `world` messages as non-human even though routing had already been changed to treat them as human-like ingress.

## Root Cause

- World messages previously took a special immediate-response path instead of the canonical queued ingress path used by human messages.
- That meant world-originated prompts did not share queue ordering and queue preflight behavior with human sends.
- Agent response logic also treated `world` as a blanket always-respond sender, so it did not honor the same paragraph-beginning mention rules used for human messages.
- Heartbeat cron diagnostics were emitted directly with `console.log`, which bypassed the repo's category/env logger controls.
- After the runtime change, persistence metadata still used the old `human|user` check and drifted from the new semantics.

## Implemented Changes

### Queue-backed world ingress

- Expanded queue-eligible sender classification so `world` goes through the same queue-backed ingress path as human/user sends.
- Updated:
  - `core/queue-manager.ts`
  - `core/send-message-tool.ts`
  - `server/api.ts`

### Human-like world routing

- Removed the unconditional `world` auto-respond branch from agent orchestration.
- `world` messages now follow the same human-like routing rules:
  - no mentions => public/broadcast
  - paragraph-beginning mention => targeted
  - mid-paragraph mention only => no response
- Extended main-agent auto-routing so `world` messages also get `@mainAgent` prepended when configured and when no leading mention is already present.

### Heartbeat queueing and logger diagnostics

- Heartbeat ticks now enqueue a queued `world` message instead of publishing directly.
- Added `heartbeat` category logger events for:
  - cron tick
  - skip because world is already processing
  - skip because chat is busy or queued
  - successful enqueue
  - enqueue failure
- This keeps heartbeat diagnostics behind env-based logger control rather than always printing to stdout.

### Persistence alignment fix from CR

- Updated persistence metadata so stored `isHumanMessage` is also true for `world` senders.
- Updated default metadata generation so `createDefaultMessageMetadata('world')` matches the new runtime semantics.

## Regression Coverage

Added or updated targeted tests for:

- queued world sender dispatch in `send_message`
- queued world sender dispatch through API non-streaming ingress
- queue-manager acceptance of `world` sender
- world mention behavior in `shouldAgentRespond`
- main-agent routing for `world` messages
- heartbeat queueing and heartbeat logger diagnostics
- persisted metadata for world messages
- default event metadata generation for `world`

## Verification

Passed:

- `npm test -- tests/core/send-message-tool.test.ts tests/core/queue-manager.test.ts tests/core/agents/agent-response-logic.test.ts tests/core/events/main-agent-routing.test.ts tests/core/heartbeat.test.ts tests/api/messages-nonstreaming-collection.test.ts tests/core/event-persistence-enhanced.test.ts`
- `npm run integration`
- `npm test -- tests/core/heartbeat.test.ts`
- `npm test -- tests/core/event-persistence-enhanced.test.ts tests/core/event-validation.test.ts tests/core/heartbeat.test.ts`

## Result

- World-originated prompts now participate in queue ordering the same way human prompts do.
- World message response targeting now supports the same mention semantics as human messages.
- Heartbeat-generated prompts no longer bypass queue processing.
- Heartbeat diagnostics are env-controlled through the structured logger.
- Persisted metadata now matches the updated runtime semantics for `world` messages.
