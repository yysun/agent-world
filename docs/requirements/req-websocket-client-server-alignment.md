# WebSocket Client-Server Alignment Requirements

## Overview
Analysis of discrepancies between WebSocket client (`ws-api.js`) and server (`ws.ts`) implementations with fix requirements.

## Critical Discrepancies Identified

### 1. Command Response Tracking Mismatch
**Issue**: Client expects `response.requestId` but server sends `response.id`
- **Client Code**: `const requestId = response.requestId;`
- **Server Behavior**: Server generates response with `id` field, not `requestId`
- **Impact**: Command responses never resolve, causing timeouts

### 2. Success Response Message Structure
**Issue**: Client expects specific message format for subscription success
- **Client Code**: Looks for `data.message.includes('subscribed to world')`
- **Server Behavior**: Uses different success message structure via `sendSuccess()`
- **Impact**: Subscription promises never resolve

### 3. Error Response Handling Inconsistency
**Issue**: Different error message structures between client and server
- **Client Expected**: `response.error` property
- **Server Actual**: Varies by error type and context
- **Impact**: Poor error handling and user feedback

### 4. Connection Status Messages
**Issue**: Client expects 'connected' message type but server may send different format
- **Client Code**: Checks for specific connection message types
- **Server Behavior**: Sends connection confirmation but format may differ
- **Impact**: Connection status not properly detected

### 5. World Event Echo Prevention Logic
**Issue**: Server skips echoing user messages but client may not handle this correctly
- **Server Logic**: Skips messages from 'HUMAN' or users starting with 'user'
- **Client Sender**: Uses 'user1' as default sender
- **Impact**: User messages may be filtered out unexpectedly

## Requirements for Fixes

### R1: Standardize Command Response Format
- Server must send responses with `requestId` field matching client request `id`
- Response structure must include consistent `success`, `error`, `data`, and `type` fields
- Error responses must use standardized error message format

### R2: Fix Subscription Response Handling
- Server success messages must include recognizable subscription confirmation text
- Client subscription logic should handle server's actual success message format
- Implement proper subscription state synchronization

### R3: Align Connection Status Protocol
- Standardize connection status message types between client and server
- Ensure client can properly detect connection state changes
- Implement consistent reconnection logic

### R4: Unify Error Response Structure
- Create consistent error response format across all server endpoints
- Update client error handling to match server error structure
- Implement proper error propagation and user feedback

### R5: Fix Message Echo Logic
- Clarify sender identification rules between client and server
- Ensure user message echo prevention works correctly with client sender format
- Document message flow and filtering rules

### R6: Add Missing WebSocket URL Configuration
- Client hardcodes `ws://localhost:3000/ws` but should be configurable
- Support different environments (dev, prod) with proper WebSocket URLs
- Add WebSocket endpoint validation

### R7: Enhance Request Timeout Handling
- Align timeout values between client and server
- Implement proper cleanup for timed-out requests
- Add retry logic for failed commands

### R8: Fix Export Statement Issues
- Client has incomplete export statements at end of file
- Functions referenced in exports but some may be missing
- Clean up module exports for proper ES6 module compliance

## Implementation Priority
1. **Critical**: R1, R2 (Command responses and subscriptions)
2. **High**: R3, R4 (Connection status and error handling)
3. **Medium**: R5, R6 (Message echo and URL configuration)
4. **Low**: R7, R8 (Timeouts and exports)

## Success Criteria
- All WebSocket commands resolve properly with correct responses
- World subscription/unsubscription works reliably
- Error messages are consistent and informative
- Connection status is accurately reflected in client
- User messages flow correctly without unexpected filtering
- Module exports work properly for all API functions

## Testing Requirements
- Unit tests for command request/response correlation
- Integration tests for subscription lifecycle
- Error handling tests for various failure scenarios
- Connection management tests with reconnection
- Message flow tests with proper echo prevention

## Documentation Updates Needed
- WebSocket protocol specification document
- Client-server API alignment guide
- Error handling and troubleshooting guide
- Message flow and filtering rules documentation
