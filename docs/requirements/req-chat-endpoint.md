# Requirements: Chat Endpoint with World Subscription

## Overview
Implement a `/chat` endpoint that subscribes to worlds, handles streaming messages, and provides Server-Sent Events (SSE) to clients. The endpoint should use the world subscription template pattern and delay processing until all streaming is complete.

## Functional Requirements

### 1. Endpoint Definition
- **Route**: `POST /worlds/:worldName/chat`
- **Method**: POST with SSE streaming response
- **Content-Type**: `text/event-stream` for SSE
- **Input**: JSON body with `message` and optional `sender` (defaults to "HUMAN")

### 2. World Subscription
- Use `subscribeWorld` directly without `getFullWorld`
- Subscribe to world events before sending messages
- Handle world not found errors gracefully
- Maintain subscription throughout the request lifecycle

### 3. Message Processing
- Send user message to world using `publishMessage`
- Handle both streaming and non-streaming agent responses
- Filter out echo messages from same sender
- Track message IDs for proper streaming correlation

### 4. SSE Streaming
- Establish SSE connection with proper headers
- Stream real-time events to client as they occur
- Handle streaming chunks with proper buffering
- Send completion events when streaming ends

### 5. Delay Logic
- Wait for streaming completion before closing connection
- Use different delays based on operation type:
  - Streaming stall detection: 500ms
  - Streaming completion: 2000ms
  - Message response: 3000ms
  - Long operations: 8000ms
- Reset timers on each streaming chunk

### 6. Error Handling
- Handle world not found (404)
- Handle subscription failures (500)
- Handle message sending failures
- Provide meaningful error messages via SSE

### 7. Resource Management
- Clean up subscriptions on connection close
- Clear all timers when request ends
- Reset streaming state after each operation
- Handle client disconnections gracefully

## Technical Requirements

### 1. Streaming State Management
- Track streaming status (active/inactive)
- Accumulate streaming content
- Store sender and message ID for correlation
- Provide timer management functions

### 2. Client Connection Interface
- Implement SSE-compatible send function
- Handle connection state tracking
- Process world events with proper filtering
- Forward streaming events to client

### 3. Timer Management
- Setup and clear timers for different scenarios
- Handle stall detection for streaming
- Implement completion timeouts
- Prevent timer leaks

### 4. Event Processing
- Handle different event types (message, sse, system)
- Process streaming chunks separately
- Skip user messages to prevent echo
- Filter system success messages

## Implementation Constraints

### 1. Architecture
- Use functional approach, not classes
- Follow world subscription template pattern
- Integrate with existing core subscription system
- Maintain compatibility with current API structure

### 2. Dependencies
- Use existing `subscribeWorld` function
- Leverage `publishMessage` for sending
- Import `ClientConnection` interface
- Use existing validation schemas

### 3. Error Boundaries
- Do not break existing API endpoints
- Maintain backward compatibility
- Handle edge cases gracefully
- Provide fallback behavior

## Success Criteria

### 1. Functionality
- Successfully subscribe to worlds without `getFullWorld`
- Stream real-time messages to clients
- Handle both streaming and non-streaming responses
- Properly delay until streaming completion

### 2. Performance
- Efficient resource usage
- Proper cleanup on connection close
- Minimal memory leaks
- Responsive streaming

### 3. Reliability
- Graceful error handling
- Proper timeout management
- Connection state tracking
- Resource cleanup

### 4. Integration
- Works with existing world system
- Compatible with current client code
- Follows established patterns
- Maintains API consistency

## Non-Functional Requirements

### 1. Scalability
- Handle multiple concurrent connections
- Efficient subscription management
- Minimal resource overhead per connection

### 2. Maintainability
- Clear separation of concerns
- Reusable components
- Comprehensive error handling
- Good logging and debugging

### 3. Testability
- Unit testable components
- Integration test compatibility
- Mock-friendly interfaces
- Deterministic behavior

## Integration Testing Requirements

### 1. Core Functionality Tests
- **World Subscription Tests**
  - Subscribe to existing world successfully
  - Handle world not found with proper error response
  - Verify subscription cleanup on completion
  - Test subscription with malformed world names
  - Validate subscription event handling

- **Message Processing Tests**
  - Send message and receive streaming response
  - Handle non-streaming agent responses
  - Verify message ID correlation in streaming
  - Test echo message filtering (skip user messages)
  - Validate message publishing to world

- **SSE Streaming Tests**
  - Establish SSE connection with proper headers
  - Stream real-time events in correct format
  - Handle streaming chunks in proper sequence
  - Verify completion events sent correctly
  - Test SSE connection state management

### 2. Delay Logic Integration Tests
- **Streaming Completion Tests**
  - Detect streaming completion after 2000ms silence
  - Reset timer on each streaming chunk
  - Handle stall detection (500ms timeout)
  - Test long operation timeout (8000ms)
  - Verify timer cleanup on completion

- **Connection Management Tests**
  - Handle client disconnection during streaming
  - Test connection close event handling
  - Verify resource cleanup on disconnect
  - Test connection state tracking

### 3. Error Handling Integration Tests
- **World Error Scenarios**
  - World not found error via SSE
  - Subscription failure error handling
  - Invalid world name error response
  - Subscription timeout scenarios

- **Message Error Scenarios**
  - Message sending failure handling
  - Invalid message content errors
  - Empty message handling
  - Message publishing errors

- **Connection Error Scenarios**
  - Client disconnection during streaming
  - Server-side connection failures
  - Network interruption handling
  - SSE connection errors

### 4. End-to-End Integration Tests
- **Complete Chat Flow Tests**
  - Full chat flow with streaming response
  - Multi-message conversation scenarios
  - Different world types and configurations
  - Agent response variations

- **Concurrent Connection Tests**
  - Multiple clients to same world
  - Concurrent streaming scenarios
  - Resource sharing and isolation
  - Connection cleanup verification

### 5. Test Implementation Requirements
- **Test Environment Setup**
  - Use test world configurations
  - Mock LLM responses for predictable testing
  - Create test data for different scenarios
  - Implement test cleanup procedures

- **Test Data Management**
  - Create test worlds with known agents
  - Prepare test messages and expected responses
  - Mock streaming and non-streaming scenarios
  - Handle test data isolation

- **Test Execution Framework**
  - Create integration test files under `integration-tests/`
  - Use `npx tsx` for test execution
  - Implement proper test setup and teardown
  - Add test result validation

- **Test Coverage Requirements**
  - Cover all major success paths
  - Test all error scenarios
  - Verify resource cleanup in all cases
  - Test edge cases and boundary conditions

### 6. Test Scenarios Specification
- **Basic Chat Test**: Subscribe, send message, receive response, cleanup
- **Streaming Test**: Subscribe, send message, receive streaming chunks, verify completion
- **Error Test**: Subscribe to non-existent world, verify error handling
- **Disconnection Test**: Establish connection, disconnect client, verify cleanup
- **Concurrent Test**: Multiple clients, verify isolation and proper handling
- **Long Operation Test**: Send complex message, verify timeout handling

## Validation Requirements

### 1. Input Validation
- Validate world name format
- Validate message content
- Validate sender parameter
- Handle malformed requests

### 2. State Validation
- Verify subscription success
- Check streaming state consistency
- Validate timer state
- Confirm resource cleanup

### 3. Output Validation
- Proper SSE event format
- Correct streaming chunk handling
- Appropriate error responses
- Complete event sequences
