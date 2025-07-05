# World Subscription and Message Processing Template

A comprehensive template for API endpoints that need to subscribe to worlds, send messages, and process streaming chunks with proper delay handling.

## Overview

This template provides the standardized steps for:
1. World subscription with proper client connection handling
2. Message sending with success/error feedback
3. Streaming chunk processing with visual feedback
4. Delay logic to ensure complete streaming
5. Proper cleanup and resource management

## Core Components

### 1. Streaming State Management

```typescript
interface StreamingState {
  isActive: boolean;
  content: string;
  sender?: string;
  messageId?: string;
  wait?: (delay: number) => void;
  stopWait?: () => void;
}

function createStreamingState(): StreamingState {
  return {
    isActive: false,
    content: '',
    sender: undefined,
    messageId: undefined,
    wait: undefined,
    stopWait: undefined
  };
}
```

### 2. Client Connection Interface

```typescript
interface ClientConnection {
  send: (data: string) => void;
  isOpen: boolean;
  onWorldEvent: (eventType: string, eventData: any) => void;
  onError: (error: string) => void;
}
```

### 3. Timer Management

```typescript
interface TimerState {
  timer?: ReturnType<typeof setTimeout>;
}

function setupTimer(
  timerState: TimerState,
  callback: () => void,
  delay: number = 2000
): void {
  clearTimer(timerState);
  timerState.timer = setTimeout(callback, delay);
}

function clearTimer(timerState: TimerState): void {
  if (timerState.timer) {
    clearTimeout(timerState.timer);
    timerState.timer = undefined;
  }
}
```

## Step-by-Step Implementation

### Step 1: Initialize State and Connection

```typescript
// Initialize streaming state
const streaming = createStreamingState();
const timerState: TimerState = {};

// Setup timer callbacks
streaming.wait = (delay: number) => {
  setupTimer(timerState, () => {
    if (streaming.isActive) {
      console.log('Streaming appears stalled - timing out...');
      resetStreamingState(streaming);
      handleStreamingComplete();
    } else {
      handleStreamingComplete();
    }
  }, delay);
};

streaming.stopWait = () => {
  clearTimer(timerState);
};
```

### Step 2: Create Client Connection

```typescript
const client: ClientConnection = {
  send: (data: string) => {
    // Implementation depends on transport (WebSocket, HTTP, etc.)
    // For HTTP APIs, this might queue responses
    // For WebSocket, this sends directly
  },
  isOpen: true,
  onWorldEvent: (eventType: string, eventData: any) => {
    handleWorldEvent(eventType, eventData, streaming, timerState);
  },
  onError: (error: string) => {
    console.error(`World error: ${error}`);
    handleError(error);
  }
};
```

### Step 3: Subscribe to World

```typescript
async function subscribeToWorld(
  worldName: string,
  rootPath: string,
  client: ClientConnection
): Promise<any> {
  try {
    const subscription = await subscribeWorld(worldName, rootPath, client);
    if (!subscription) {
      throw new Error(`Failed to subscribe to world: ${worldName}`);
    }
    return subscription;
  } catch (error) {
    console.error('World subscription failed:', error);
    throw error;
  }
}
```

### Step 4: Event Processing with Streaming

```typescript
function handleWorldEvent(
  eventType: string,
  eventData: any,
  streaming: StreamingState,
  timerState: TimerState
): void {
  // Handle streaming events first
  if (handleStreamingEvents(eventType, eventData, streaming)) {
    return;
  }

  // Skip user messages to prevent echo
  if (eventData.sender && ['HUMAN', 'CLI', 'user'].includes(eventData.sender)) {
    return;
  }

  // Filter out success messages
  if (eventData.content && eventData.content.includes('Success message sent')) {
    return;
  }

  // Handle system messages
  if ((eventType === 'system' || eventType === 'world') && eventData.message) {
    console.log(`System: ${eventData.message}`);
  }

  // Handle regular messages
  if (eventType === 'message' && eventData.content) {
    console.log(`${eventData.sender || 'agent'}: ${eventData.content}`);
    
    // Setup completion timer for non-streaming messages
    if (streaming.wait) {
      streaming.wait(3000);
    }
  }
}
```

### Step 5: Streaming Event Handling

```typescript
function handleStreamingEvents(
  eventType: string,
  eventData: any,
  streaming: StreamingState
): boolean {
  if (eventType !== 'sse') return false;

  // Handle chunk events
  if (eventData.type === 'chunk' && eventData.content) {
    if (!streaming.isActive) {
      streaming.isActive = true;
      streaming.content = '';
      streaming.sender = eventData.agentName || eventData.sender;
      streaming.messageId = eventData.messageId;
      
      console.log(`${streaming.sender} is responding...`);
      
      if (streaming.stopWait) {
        streaming.stopWait();
      }
    }

    if (streaming.messageId === eventData.messageId) {
      streaming.content += eventData.content;
      process.stdout.write(eventData.content);

      // Reset stall timer with each chunk
      if (streaming.wait) {
        streaming.wait(500);
      }
    }
    return true;
  }

  // Handle end events
  if (eventData.type === 'end' && 
      streaming.isActive && 
      streaming.messageId === eventData.messageId) {
    console.log(''); // New line after streaming
    resetStreamingState(streaming);

    // Set completion timer
    if (streaming.wait) {
      streaming.wait(2000);
    }
    return true;
  }

  // Handle error events
  if (eventData.type === 'error' && 
      streaming.isActive && 
      streaming.messageId === eventData.messageId) {
    console.error(`Stream error: ${eventData.error || eventData.message}`);
    resetStreamingState(streaming);

    // Set completion timer
    if (streaming.wait) {
      streaming.wait(2000);
    }
    return true;
  }

  return false;
}
```

### Step 6: Message Sending

```typescript
async function sendMessage(
  world: World,
  message: string,
  sender: string = 'HUMAN'
): Promise<{ success: boolean; message: string; data?: any }> {
  try {
    publishMessage(world, message, sender);
    return {
      success: true,
      message: 'Message sent to world',
      data: { sender }
    };
  } catch (error) {
    return {
      success: false,
      message: 'Failed to send message',
      data: { error: error instanceof Error ? error.message : String(error) }
    };
  }
}
```

### Step 7: Delay Logic Implementation

```typescript
// Delay configurations based on operation type
const DELAY_CONFIG = {
  COMMAND_RESPONSE: 1000,     // Commands get immediate response
  MESSAGE_RESPONSE: 3000,     // Messages wait for agent responses
  STREAMING_STALL: 500,       // Streaming stall detection
  STREAMING_COMPLETE: 2000,   // Wait after streaming ends
  PIPELINE_EXIT: 5000,        // Pipeline mode exit delay
  LONG_RESPONSE: 8000         // Long operations (stdin, complex messages)
};

function getDelayForOperation(operationType: string, isStreaming: boolean): number {
  if (isStreaming) {
    return DELAY_CONFIG.STREAMING_STALL;
  }

  switch (operationType) {
    case 'command':
      return DELAY_CONFIG.COMMAND_RESPONSE;
    case 'message':
      return DELAY_CONFIG.MESSAGE_RESPONSE;
    case 'streaming_complete':
      return DELAY_CONFIG.STREAMING_COMPLETE;
    case 'pipeline_exit':
      return DELAY_CONFIG.PIPELINE_EXIT;
    case 'long_response':
      return DELAY_CONFIG.LONG_RESPONSE;
    default:
      return DELAY_CONFIG.MESSAGE_RESPONSE;
  }
}
```

### Step 8: Cleanup and Resource Management

```typescript
function cleanup(
  subscription: any,
  streaming: StreamingState,
  timerState: TimerState
): void {
  // Stop timers
  if (streaming.stopWait) {
    streaming.stopWait();
  }
  clearTimer(timerState);

  // Reset streaming state
  resetStreamingState(streaming);

  // Unsubscribe from world
  if (subscription) {
    subscription.unsubscribe();
  }
}

function resetStreamingState(streaming: StreamingState): void {
  streaming.isActive = false;
  streaming.content = '';
  streaming.sender = undefined;
  streaming.messageId = undefined;
}
```

## Complete Pipeline Example

### For REST API Endpoints

```typescript
async function handleWorldMessageAPI(
  worldName: string,
  message: string,
  rootPath: string
): Promise<{
  success: boolean;
  message: string;
  data?: any;
  streamingData?: string;
}> {
  const streaming = createStreamingState();
  const timerState: TimerState = {};
  let subscription: any = null;
  let streamingData = '';

  return new Promise((resolve) => {
    let hasResolved = false;

    const resolveOnce = (result: any) => {
      if (!hasResolved) {
        hasResolved = true;
        cleanup(subscription, streaming, timerState);
        resolve(result);
      }
    };

    // Setup streaming callbacks
    streaming.wait = (delay: number) => {
      setupTimer(timerState, () => {
        resolveOnce({
          success: true,
          message: 'Operation completed',
          streamingData: streamingData
        });
      }, delay);
    };

    streaming.stopWait = () => {
      clearTimer(timerState);
    };

    // Create client connection
    const client: ClientConnection = {
      send: (data: string) => { /* No-op for REST */ },
      isOpen: true,
      onWorldEvent: (eventType: string, eventData: any) => {
        if (handleStreamingEvents(eventType, eventData, streaming)) {
          // Accumulate streaming data
          if (eventData.type === 'chunk' && eventData.content) {
            streamingData += eventData.content;
          }
          return;
        }

        // Handle other events
        if (eventType === 'message' && eventData.content) {
          if (streaming.wait) {
            streaming.wait(getDelayForOperation('message', false));
          }
        }
      },
      onError: (error: string) => {
        resolveOnce({
          success: false,
          message: `World error: ${error}`,
          data: { error }
        });
      }
    };

    // Subscribe and send message
    (async () => {
      try {
        subscription = await subscribeToWorld(worldName, rootPath, client);
        const result = await sendMessage(subscription.world, message);
        
        if (!result.success) {
          resolveOnce(result);
          return;
        }

        // Set timeout for long operations
        setTimeout(() => {
          resolveOnce({
            success: true,
            message: 'Operation timed out',
            streamingData: streamingData
          });
        }, DELAY_CONFIG.LONG_RESPONSE);

      } catch (error) {
        resolveOnce({
          success: false,
          message: 'Failed to process request',
          data: { error: error instanceof Error ? error.message : String(error) }
        });
      }
    })();
  });
}
```

### For WebSocket Endpoints

```typescript
function handleWorldMessageWebSocket(
  ws: WebSocket,
  worldName: string,
  message: string,
  rootPath: string
): void {
  const streaming = createStreamingState();
  const timerState: TimerState = {};
  let subscription: any = null;

  // Setup streaming callbacks
  streaming.wait = (delay: number) => {
    setupTimer(timerState, () => {
      ws.send(JSON.stringify({
        type: 'complete',
        message: 'Operation completed'
      }));
    }, delay);
  };

  streaming.stopWait = () => {
    clearTimer(timerState);
  };

  // Create client connection
  const client: ClientConnection = {
    send: (data: string) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(data);
      }
    },
    isOpen: ws.readyState === WebSocket.OPEN,
    onWorldEvent: (eventType: string, eventData: any) => {
      if (handleStreamingEvents(eventType, eventData, streaming)) {
        // Forward streaming events to client
        if (eventData.type === 'chunk' && eventData.content) {
          ws.send(JSON.stringify({
            type: 'chunk',
            content: eventData.content,
            sender: eventData.agentName || eventData.sender,
            messageId: eventData.messageId
          }));
        }
        return;
      }

      // Forward other events
      ws.send(JSON.stringify({
        type: eventType,
        data: eventData
      }));
    },
    onError: (error: string) => {
      ws.send(JSON.stringify({
        type: 'error',
        message: error
      }));
    }
  };

  // Cleanup on WebSocket close
  ws.on('close', () => {
    cleanup(subscription, streaming, timerState);
  });

  // Subscribe and send message
  (async () => {
    try {
      subscription = await subscribeToWorld(worldName, rootPath, client);
      const result = await sendMessage(subscription.world, message);
      
      ws.send(JSON.stringify({
        type: 'response',
        success: result.success,
        message: result.message,
        data: result.data
      }));

    } catch (error) {
      ws.send(JSON.stringify({
        type: 'error',
        message: 'Failed to process request',
        data: { error: error instanceof Error ? error.message : String(error) }
      }));
    }
  })();
}
```

## Key Patterns and Best Practices

### 1. Timer Management
- Use different delays for different operation types
- Always clear timers before setting new ones
- Handle both streaming and non-streaming scenarios

### 2. State Management
- Initialize streaming state before use
- Reset state after each operation
- Track message IDs for proper streaming correlation

### 3. Error Handling
- Provide meaningful error messages
- Clean up resources on errors
- Handle both synchronous and asynchronous errors

### 4. Resource Cleanup
- Always unsubscribe from world events
- Clear all timers
- Reset streaming state

### 5. Event Filtering
- Skip user messages to prevent echo
- Filter out system success messages
- Handle streaming events separately from regular events

This template provides a solid foundation for implementing world subscription, message sending, and streaming in any API endpoint or application interface.
