# TUI WebSocket Reconnection Handling

**Date:** 2025-11-02  
**Type:** Enhancement  
**Component:** TUI (Terminal User Interface)

## Summary

Implemented proper error handling for WebSocket connection drops in the TUI. Instead of exiting when the connection is lost, the TUI now displays the connectivity status and automatically attempts to reconnect with exponential backoff.

## Changes Made

### 1. App.tsx
- **Updated comment block**: Added entry for reconnection handling
- **Modified initial connection logic**: Only show loading screen on initial connection, not during reconnection
- **Removed error exit screen**: No longer exits to error screen when connection drops
- **Added reconnecting prop**: Pass `reconnecting` state to TopPanel component
- **UI stays visible during reconnection**: Users can see their message history and connection status while reconnecting

### 2. TopPanel.tsx
- **Added reconnecting prop**: New boolean prop to track reconnection state
- **Pass reconnecting to ConnectionStatus**: Forward reconnecting state to connection status component

### 3. ConnectionStatus.tsx
- **Updated comment block**: Document reconnecting state display
- **Added reconnecting prop**: New boolean prop for reconnecting state
- **Added reconnecting UI**: Display yellow spinner with "Reconnecting..." message
- **Priority order**: connected → reconnecting → connecting → error → disconnected

## Behavior

### Before
- When WebSocket connection dropped, TUI would show error message and effectively freeze
- User had to exit and restart the TUI
- Lost context of what they were doing

### After
1. **Connection Drop**: UI remains visible with all message history
2. **Status Display**: TopPanel shows "Reconnecting..." with yellow spinner
3. **Automatic Reconnection**: WebSocketClient automatically attempts reconnection with exponential backoff (1s → 1.5s → 2.25s... up to 30s)
4. **Successful Reconnection**: Status changes to "Connected" (green), UI remains functional
5. **Failed Reconnection**: Continues trying with increasing delays, status shows error message
6. **User Control**: User can still exit with Ctrl+C at any time

## Technical Details

### Reconnection Logic (from ws-client.ts)
- **Initial delay**: 1000ms (1 second)
- **Backoff multiplier**: 1.5x
- **Max delay**: 30000ms (30 seconds)
- **Auto-resubscribe**: Automatically resubscribes to world/chat after reconnection

### Connection States
1. `disconnected`: Not connected, not trying
2. `connecting`: Initial connection attempt
3. `connected`: Successfully connected
4. `reconnecting`: Attempting to reconnect after disconnect
5. `closing`: Gracefully closing connection

## User Experience Improvements

1. **No data loss**: Message history remains visible during reconnection
2. **Clear feedback**: Visual indicator shows connection status at all times
3. **Automatic recovery**: No manual intervention needed for temporary network issues
4. **Graceful degradation**: Input is disabled during disconnection but UI remains usable
5. **Context preservation**: Users don't lose their place in the conversation

## Files Modified

- `tui/src/App.tsx`
- `tui/src/components/TopPanel.tsx`
- `tui/src/components/ConnectionStatus.tsx`

## Notes

- Pre-existing TypeScript errors related to Ink/React version compatibility remain but don't affect runtime functionality
- The underlying WebSocketClient already had reconnection logic; this change makes it visible and useful in the TUI
- No changes needed to ws-client.ts - it already emits 'reconnecting' events properly
