# REQ: Web Shell Stream Parity

**Date:** 2026-03-12
**Status:** Implemented

## Summary

Bring the web chat shell command streaming experience to parity with the Electron app so live `shell_cmd` output renders through the tool message UI instead of plain assistant text.

## Functional Requirements

1. Shell stdout streaming in the web app must render as a live tool-output surface, not as a normal assistant streaming bubble.
2. Live shell tool output must use the same visual styling family as completed tool output.
3. Live and completed plain-text shell output must be constrained to a compact viewport with scrolling instead of expanding the transcript indefinitely.
4. Shell tool stream rows must preserve enough metadata to identify the tool and command while the stream is active.
5. When a shell tool call completes, the orange running request card must turn into the terminal completed state immediately in the active chat without requiring navigation away and back.
6. The live web runtime may synthesize a terminal shell completion row before persisted message refresh arrives, but that synthetic row must be replaced by the later persisted tool message instead of duplicating the result.
7. The change must preserve existing SSE ordering and chat scoping behavior.

## Non-Goals

1. Redesigning non-shell tool streaming behavior.
2. Changing the canonical persisted shell tool-result contract.
3. Changing Electron behavior.

## Acceptance Criteria

1. A live `shell_cmd` stdout stream in web renders through the tool message box path.
2. Long live shell output is scrollable within a bounded viewport.
3. Completed shell output uses the same bounded output viewport styling.
4. Reply-linked or tool-call-linked shell completion rows merge into the corresponding request row in web transcript reconstruction.
5. Focused web unit tests cover the shell-stream state/merge regression.
6. A live `tool-result` event alone is sufficient to flip a merged shell request card from `running` to `done`.
7. Tool completions for another chat do not appear in the currently selected chat.
