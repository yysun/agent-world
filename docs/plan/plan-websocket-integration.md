# WebSocket Integration Implementation Plan

## Overview
Integrate WebSocket communication into the home page component to enable real-time messaging with the agent world system. This plan focuses on functionality and user experience without optimization concerns.

## Current State Analysis
- Home page has conversation area UI but no messaging functionality
- WebSocket API module (ws-api.js) is implemented as function-based module
- Message input field exists but has no working event handlers
- Conversation display area exists but shows placeholder content
- No WebSocket connection management in the component

## Implementation Steps

### Step 1: Import WebSocket API Module
- [x] Add import statement for ws-api.js in home.js
- [x] Verify the import works correctly with the function-based API

### Step 2: Add WebSocket State Properties
- [x] Add WebSocket connection state properties to initial state
- [x] Add connection status tracking (connected, connecting, disconnected, error)
- [x] Add messages array to state for storing conversation history
- [x] Add current message input value to state
- [x] Do NOT initialize connection in state - wait for world selection

### Step 3: Create WebSocket Event Handlers
- [x] Create handleWebSocketMessage function to process incoming messages
- [x] Create handleWebSocketConnection function to track connection status
- [x] Create handleWebSocketError function for error handling
- [x] Register these handlers with the WebSocket API during initialization

### Step 4: Implement Message Input Handling
- [x] Create updateMessage function to handle input field changes
- [x] Fix the message input value binding in the template
- [x] Ensure input field updates state correctly on user typing

### Step 5: Implement Send Message Functionality
- [x] Create sendMessage function to send messages via WebSocket
- [x] Validate message input before sending (non-empty, world selected)
- [x] Clear input field after successful message send
- [x] Handle send errors gracefully with user feedback
- [x] Add message to local state immediately for better UX

### Step 6: Implement Message Display
- [x] Update conversation area to display messages from state
- [x] Format messages with proper styling (user vs agent messages)
- [x] Add timestamps to messages for better context
- [x] Implement auto-scroll to latest message
- [x] Handle different message types (user, agent, system)

### Step 7: Add Connection Status Indicator
- [x] Add connection status display in the UI
- [x] Show connecting/connected/disconnected states
- [x] Provide visual feedback for connection issues
- [x] Add reconnection handling and user feedback

### Step 8: Handle World Selection Changes and WebSocket Connection
- [x] Modify selectWorld function to connect/reconnect WebSocket after world is selected
- [x] Clear messages when switching worlds
- [x] Disconnect existing WebSocket connection before connecting to new world
- [x] Handle edge cases where no world is selected (disconnect WebSocket)
- [x] Ensure WebSocket connection only happens when a valid world is selected
- [x] Update connection status during world switching process

### Step 9: Add Message Input Enhancements
- [ ] Implement Enter key press handling for message sending
- [ ] Add send button click handling
- [ ] Disable send functionality when not connected
- [ ] Add input validation and user feedback

### Step 10: Error Handling and Edge Cases
- [ ] Handle WebSocket connection failures gracefully
- [ ] Manage reconnection attempts with user feedback
- [ ] Handle empty message submissions
- [ ] Handle messages received when no world is selected
- [ ] Add proper error display in the UI

### Step 11: Component Lifecycle Management
- [ ] Do NOT connect WebSocket when component initializes
- [ ] WebSocket connection should only be established after world selection
- [ ] Clean up WebSocket connections when component unmounts
- [ ] Handle page refresh scenarios properly
- [ ] Ensure proper cleanup when switching between worlds

### Step 12: Testing and Validation
- [ ] Test message sending functionality
- [ ] Test message receiving functionality
- [ ] Test connection status changes
- [ ] Test world switching scenarios
- [ ] Test error scenarios and recovery
- [ ] Validate UI updates correctly with state changes

## Technical Requirements

### State Structure Updates
```javascript
// Additional state properties needed:
{
  // Existing properties...
  connectionStatus: 'disconnected', // 'connecting', 'connected', 'disconnected', 'error'
  messages: [], // Array of message objects
  currentMessage: '', // Current input field value
  wsError: null // WebSocket error information
}
```

### Message Object Structure
```javascript
{
  id: 'unique-id',
  type: 'user' | 'agent' | 'system',
  sender: 'user1' | 'agent-name' | 'system',
  text: 'message content',
  timestamp: 'ISO-8601-timestamp',
  worldName: 'current-world'
}
```

### New Event Handlers Needed
- `updateMessage(state, value)` - Update current message input
- `sendMessage(state)` - Send message via WebSocket
- `handleWebSocketMessage(state, messageData)` - Process incoming messages
- `handleConnectionStatus(state, status)` - Update connection status
- `handleWebSocketError(state, error)` - Handle WebSocket errors
- `connectToWorld(state, worldName)` - Connect WebSocket when world is selected
- `disconnectFromWorld(state)` - Disconnect WebSocket when switching worlds

### Template Updates Required
- Fix message input event binding
- Update conversation display to use state.messages
- Add connection status indicator
- Update send button to use proper event handler
- Add proper Enter key handling for input field

## Dependencies
- ws-api.js module (already implemented)
- Existing AppRun framework and component structure
- Current HTML template structure for conversation area

## Success Criteria
- [ ] User can type messages in the input field
- [ ] Messages are sent via WebSocket when user presses Enter or clicks send
- [ ] Incoming WebSocket messages are displayed in conversation area
- [ ] Connection status is visible and accurate
- [ ] World switching clears conversation and maintains connection
- [ ] Error states are handled gracefully with user feedback
- [ ] Message history persists during session
- [ ] UI is responsive and provides immediate feedback

## Risk Mitigation
- Implement proper error boundaries for WebSocket failures
- Add fallback UI states for connection issues
- Ensure graceful degradation when WebSocket is unavailable
- Add comprehensive logging for debugging
- Implement proper cleanup to prevent memory leaks

## Notes
- Follow function-based approach as per coding guidelines
- Use AppRun's event handling patterns with run() for local events
- Maintain immutable state updates
- Focus on functionality first, optimization later
- Hard-code userId as 'user1' as specified in requirements
- **WebSocket connection only after world selection, not during initialization**
- Ensure proper cleanup when switching between worlds
- Connection status should reflect world-specific connection state

## WebSocket Connection Flow

### Connection Timing
1. **Component Initialization**: No WebSocket connection established
2. **World Selection**: WebSocket connection initiated after world is selected
3. **World Switching**: Disconnect from previous world, connect to new world
4. **No World Selected**: Ensure WebSocket is disconnected

### selectWorld Function Updates
The existing `selectWorld` function needs to be enhanced:
```javascript
const selectWorld = async (state, worldName) => {
  if (worldName === state.worldName) return state;
  
  // Disconnect from previous world
  if (state.worldName && wsApi.isConnected()) {
    wsApi.disconnect();
  }
  
  // Clear messages when switching worlds
  const newState = {
    ...state,
    worldName,
    messages: [],
    connectionStatus: 'disconnected'
  };
  
  if (worldName) {
    // Connect to new world
    newState.connectionStatus = 'connecting';
    wsApi.connect();
  }
  
  const agents = await api.getAgents(worldName);
  return { ...newState, agents };
};
```
