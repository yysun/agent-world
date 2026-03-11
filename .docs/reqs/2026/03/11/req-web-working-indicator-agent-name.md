# REQ: Web Working Indicator Agent Name

**Date:** 2026-03-11  
**Status:** Reviewed  
**Scope:** `web/`

## Overview

Fix the web chat waiting indicator so it shows the correct working agent instead of an unrelated fallback agent name.

## Requirements

1. The waiting indicator in the web chat transcript must display the agent that is actively processing the current chat turn.
2. Agent selection for the waiting indicator must derive from authoritative runtime activity data already emitted by the backend (`activeAgentNames` and related world-activity payload fields), not from static world agent order.
3. When the active agent cannot be resolved confidently, the waiting indicator must avoid showing a misleading agent name.
4. The fix must preserve existing chat-scoped waiting behavior and must not leak agent activity across chats.

## Tests

Add targeted unit tests that verify:

1. `handleWorldActivity` records the active agent from activity payload data when processing starts.
2. `handleWorldActivity` can switch the active agent while processing remains in progress.
3. The waiting indicator avoids falling back to the first world agent when no active agent is known.
