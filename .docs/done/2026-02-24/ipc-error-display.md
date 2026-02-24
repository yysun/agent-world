# IPC Error Display in Status Bar

## Summary

Editing operations (create/update/delete agent, world CRUD, message edits) that fail in the Electron main process now surface their error messages in the UI status bar instead of being silently swallowed.

## Problem

`setStatusText` in `App.tsx` was a no-op placeholder. All error paths in action handlers (`onCreateAgent`, `onUpdateAgent`, `onDeleteAgent`, etc.) called it, but nothing appeared in the UI. Additionally, Electron wraps IPC handler rejections with its own prefix: `"Error occurred in handler for 'channel': Error: actual message"`, making raw error messages noisy even if they had been displayed.

## Changes

### `electron/main-process/ipc-registration.ts`
- `registerIpcRoutes` now wraps every handler in a try/catch.
- On error, returns `{ __ipcError: message }` as a normal response value instead of throwing, preventing Electron from prepending its IPC channel prefix.

### `electron/preload/invoke.ts`
- `invokeDesktopChannel` inspects the resolved value for `{ __ipcError }` and throws a clean `Error(message)` in the renderer.
- Error messages the caller sees are exactly the original messages from the main process, with no wrapper text.

### `electron/renderer/src/App.tsx`
- Replaced the no-op `setStatusText` with real state: `notification: { text, kind }`.
- `setStatusText` sets the notification and schedules a 5-second auto-clear via `notificationTimerRef`.
- Timer is cancelled on unmount via a cleanup `useEffect`.
- `notification` is passed down to `WorkingStatusBar`.

### `electron/renderer/src/components/WorkingStatusBar.tsx`
- Added optional `notification` prop.
- When a notification is present, renders the message in the status bar slot (red for `error`, green for `success`, muted for `info`), taking priority over working/complete/idle indicators.
- Clears automatically after 5 seconds; working/complete state resumes normally.

## Design Decisions

- **Status bar over toast**: Errors are shown inline at the bottom of the workspace, consistent with the existing working/done indicators, rather than an overlay toast.
- **Return-value error protocol over stripping**: Instead of stripping Electron's prefix on the renderer side, errors are returned as values (`{ __ipcError }`) so they never trigger Electron's wrapping in the first place. This is cleaner and doesn't rely on fragile string parsing.
- **5-second auto-dismiss**: Keeps the status bar uncluttered without requiring user interaction to clear transient errors.
