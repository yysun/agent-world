# Message Display Alignment and CR Fixes

**Date**: 2026-02-14  
**Type**: Enhancement

## Overview
Implemented cross-app message-stream display alignment with a bias toward Electron simplicity, then completed a CR pass and applied a high-priority correctness fix.

Primary outcomes:
- Simplified web message rendering by extracting message-body logic into a dedicated domain module.
- Added parity improvements for tool output visibility, accessibility status semantics, and multi-agent queue display.
- Improved Electron cross-agent message display while fixing false-positive detection during code review.

## Implementation
- Web chat simplification:
  - Removed legacy 3-tier tool-call reconstruction from the web message display path.
  - Extracted message-body rendering into a dedicated module:
    - `renderMessageContent(...)`
    - `isToolResultMessage(...)`
  - Wired `world-chat` to use domain rendering.
- Web multi-agent parity:
  - Added `AgentQueueDisplay` in chat header (active + queued avatars).
  - Added queue styles in `styles.css`.
- Web accessibility updates:
  - Added `role="status"` + `aria-live="polite"` to activity pulse and tool execution status containers.
- Electron parity updates:
  - Added tool-output truncation warning in message content UI for output beyond 50K chars.
  - Added markdown utility parity helper `hasMarkdown(...)`.
- CR fix (high-priority):
  - Reworked Electron cross-agent detection logic to avoid false positives when comparing `fromAgentId` and sender display names.
  - Cross-agent detection now uses reply/context-aware checks.
  - Updated sender label generation to prefer parent sender display when available.

## Files Changed
- `electron/renderer/src/App.jsx`
- `electron/renderer/src/utils/markdown.ts`
- `web/src/components/world-chat.tsx`
- `web/src/domain/message-content.tsx`
- `web/src/components/agent-queue-display.tsx`
- `web/src/components/activity-indicators.tsx`
- `web/src/components/tool-execution-status.tsx`
- `web/src/styles.css`
- `.docs/reqs/2026-02-14/req-message-display-alignment.md`
- `.docs/plans/2026-02-14/plan-message-display-alignment.md`

## Testing
- Full test suite passed after implementation and after CR fix:
  - `npm test`
  - Result: 75 test files passed, 765 tests passed.

## Related Work
- `.docs/reqs/2026-02-14/req-message-display-alignment.md`
- `.docs/plans/2026-02-14/plan-message-display-alignment.md`
