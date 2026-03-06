# CurrentChatId Runtime Removal

## Summary

Removed the remaining runtime/control-flow dependence on `currentChatId` and left it as persisted client metadata for initial session selection only.

## Changes

- Core manager chat flows now use persisted chat-selection helpers instead of live `world.currentChatId`.
- `newChat`, `branchChatFromMessage`, `deleteChat`, and `restoreChat` no longer depend on runtime world chat selection state.
- CLI runtime state now carries an explicit `selectedChatId` and uses it for event scoping, message sends, and chat export.
- Plain CLI message sends now require explicit selected chat scope and no longer reconstruct it from the runtime world object.
- Removed the remaining non-client runtime `world.currentChatId` debug read from the tool-continuation memory path.
- Heartbeat jobs already require explicit `chatId` and are no longer auto-started from persisted current-chat state.

## Tests

- `npx vitest run tests/cli/process-cli-input.test.ts tests/core/restore-chat-validation.test.ts`
- `npm run check`
- `npm run integration`

## Notes

- `currentChatId` still exists in stored world data and API responses for frontend/client bootstrap.
- Integration still prints the existing `node-cron` sourcemap warning; it is unrelated to this change.
