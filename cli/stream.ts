/**
 * CLI Streaming Module - Real-time Agent Response Display
 * 
 * Manages streaming display for CLI interface with real-time chunk accumulation,
 * visual feedback, and comprehensive event processing.
 *
 * FEATURES:
 * - Real-time streaming with visual feedback and state tracking
 * - Comprehensive event processing (chunk, end, error)
 * - Color-coded streaming indicators and status messages
 * - Modular design for reuse across CLI components
 * - Event-driven display (no timer dependencies)
 * - Tool call detection for approval and HITL (Human-in-the-Loop) requests
 * 
 * CHANGES:
 * - 2025-02-06: Track last streamed message to prevent duplicate MESSAGE events after streaming output
 * - 2025-11-14: Extended handleToolCallEvents() to detect client.humanIntervention (HITL)
 */

// Color helpers
const gray = (text: string) => `\x1b[90m${text}\x1b[0m`;
const boldGreen = (text: string) => `\x1b[1m\x1b[32m${text}\x1b[0m`;
const cyan = (text: string) => `\x1b[36m${text}\x1b[0m`;
const yellow = (text: string) => `\x1b[33m${text}\x1b[0m`;
const green = (text: string) => `\x1b[32m${text}\x1b[0m`;
const error = (text: string) => `\x1b[1m\x1b[31m✗\x1b[0m ${text}`;

// Streaming state interface
export interface StreamingState {
  isActive: boolean;
  content: string;
  sender?: string;
  messageId?: string;
  lastStreamedMessageId?: string;
  lastStreamedContent?: string;
  lastStreamedSender?: string;
  lastStreamedAt?: number;
}

export function createStreamingState(): StreamingState {
  return {
    isActive: false,
    content: '',
    sender: undefined,
    messageId: undefined,
    lastStreamedMessageId: undefined,
    lastStreamedContent: undefined,
    lastStreamedSender: undefined,
    lastStreamedAt: undefined
  };
}

// Streaming event handlers
export function handleStreamingEvents(
  eventData: any,
  streaming: StreamingState
): void {
  // Handle chunk events
  if (eventData.type === 'chunk' && eventData.content) {
    if (!streaming.isActive) {
      streaming.isActive = true;
      streaming.content = '';
      streaming.sender = eventData.agentName || eventData.sender;
      streaming.messageId = eventData.messageId; // Set new messageId for this stream
      process.stdout.write(`\n${boldGreen(`● ${streaming.sender}`)} ${gray('is responding...')}`);
    }

    if (streaming.messageId === eventData.messageId) {
      // Clear the "is responding..." line on first content
      if (streaming.content === '') {
        // Move cursor to beginning of line and clear it
        process.stdout.write('\r\x1b[K');
        process.stdout.write(`${boldGreen(`● ${streaming.sender}:`)} `);
      }

      streaming.content += eventData.content;
      process.stdout.write(eventData.content);
    }
    return;
  }

  // Handle end events - finish streaming but keep messageId to prevent duplicate display
  if (eventData.type === 'end') {
    if (streaming.isActive && streaming.messageId === eventData.messageId) {
      streaming.lastStreamedMessageId = streaming.messageId;
      streaming.lastStreamedContent = streaming.content;
      streaming.lastStreamedSender = streaming.sender;
      streaming.lastStreamedAt = Date.now();
      process.stdout.write('\n\n'); // End the streaming line with extra newline for spacing
      streaming.isActive = false;
      streaming.content = '';
      streaming.sender = undefined;
      // Keep messageId temporarily to prevent duplicate display of the final message event
    }
    return;
  }

  // Handle error events
  if (eventData.type === 'error') {
    if (streaming.isActive && streaming.messageId === eventData.messageId) {
      const errorMsg = eventData.error || 'Unknown error';
      process.stdout.write(`\n${error(`Error: ${errorMsg}`)}\n`);
      streaming.isActive = false;
      streaming.content = '';
      streaming.sender = undefined;
      // Keep messageId temporarily to prevent duplicate display
    }
    return;
  }

}

// PHASE 2.2 ENHANCEMENT: Handle tool execution events (from world channel)
export function handleToolEvents(eventData: any): void {
  if (eventData.type === 'tool-start' && eventData.toolExecution) {
    // Tool start events are now implicit - no console output needed
    return;
  }

  if (eventData.type === 'tool-progress' && eventData.toolExecution) {
    const toolName = eventData.toolExecution.toolName;
    const agentName = eventData.agentName || eventData.sender || 'agent';
    console.log(`${cyan(agentName)} ${gray('continuing tool -')} ${yellow(toolName)} ${gray('...')}`);
    return;
  }

  if (eventData.type === 'tool-result' && eventData.toolExecution) {
    const { toolName, duration, resultSize } = eventData.toolExecution;
    const durationText = duration ? `${Math.round(duration)}ms` : 'completed';
    const sizeText = resultSize ? `, ${resultSize} chars` : '';
    const agentName = eventData.agentName || eventData.sender || 'agent';
    console.log(`${cyan(agentName)} ${gray('tool finished -')} ${yellow(toolName)} ${gray(`(${durationText}${sizeText})`)}`);
    return;
  }

  if (eventData.type === 'tool-error' && eventData.toolExecution) {
    const { toolName, error: toolError } = eventData.toolExecution;
    const agentName = eventData.agentName || eventData.sender || 'agent';
    console.log(`${error(`${agentName} tool failed - ${toolName}: ${toolError}`)}`);
    return;
  }
}

// Handle world activity events (processing/idle states)
export function handleActivityEvents(eventData: any): void {
  // Check for valid event types
  if (!eventData || (eventData.type !== 'response-start' && eventData.type !== 'response-end' && eventData.type !== 'idle')) {
    return;
  }

  const source = eventData.source || '';
  const pending = eventData.pendingOperations || 0;
  const activityId = eventData.activityId || 0;
  const activeSources = eventData.activeSources || [];
  const sourceName = source.startsWith('agent:') ? source.slice('agent:'.length) : source;

  // Display activity events with same format as web: [World] message | pending: N | activityId: N | source: name
  if (eventData.type === 'response-start') {
    const message = sourceName ? `${sourceName} started processing` : 'started';
    console.log(`${gray('[World]')} ${message} ${gray(`| pending: ${pending} | activityId: ${activityId} | source: ${sourceName}`)}`);
  } else if (eventData.type === 'idle' && pending === 0) {
    console.log(`${gray('[World]')} All processing complete ${gray(`| pending: ${pending} | activityId: ${activityId} | source: ${sourceName}`)}`);
  } else if (eventData.type === 'response-end' && pending > 0) {
    // Show ongoing activity when one source finishes but others are still active
    if (activeSources.length > 0) {
      const activeList = activeSources.map((s: string) => s.startsWith('agent:') ? s.slice('agent:'.length) : s).join(', ');
      console.log(`${gray('[World]')} Active: ${activeList} (${pending} pending) ${gray(`| pending: ${pending} | activityId: ${activityId} | source: ${sourceName}`)}`);
    }
  }
}

export function handleWorldEventWithStreaming(
  eventType: string,
  eventData: any,
  streaming: StreamingState
): boolean {
  // Skip user messages to prevent echo
  if (eventData.sender && (eventData.sender === 'human' || eventData.sender.startsWith('user'))) {
    return false;
  }

  // Handle streaming events
  if (eventType === 'sse') {
    handleStreamingEvents(eventData, streaming);
    return true;
  }

  return false;
}

// Utility functions
export function resetStreamingState(streaming: StreamingState): void {
  streaming.isActive = false;
  streaming.content = '';
  streaming.sender = undefined;
  streaming.messageId = undefined;
  streaming.lastStreamedMessageId = undefined;
  streaming.lastStreamedContent = undefined;
  streaming.lastStreamedSender = undefined;
  streaming.lastStreamedAt = undefined;
}

export function isStreamingActive(streaming: StreamingState): boolean {
  return streaming.isActive;
}

/**
 * Handle tool call events in assistant messages
 * Returns approval request data if client.requestApproval is detected
 * Returns HITL request data if client.humanIntervention is detected
 */
export function handleToolCallEvents(
  eventData: any
): { isApprovalRequest: boolean; approvalData?: any; isHITLRequest?: boolean; hitlData?: any } | null {
  // Check for null or undefined eventData
  if (!eventData) {
    return null;
  }

  // Check for assistant messages with tool_calls
  if (eventData.role === 'assistant' &&
    eventData.tool_calls &&
    Array.isArray(eventData.tool_calls) &&
    eventData.tool_calls.length > 0) {

    // Look for client.requestApproval calls
    for (const toolCall of eventData.tool_calls) {
      if (toolCall.function?.name === 'client.requestApproval') {
        try {
          const args = JSON.parse(toolCall.function.arguments || '{}');
          return {
            isApprovalRequest: true,
            approvalData: {
              toolCallId: toolCall.id,
              originalToolCall: args.originalToolCall,
              toolName: args.originalToolCall?.name || 'Unknown tool',
              toolArgs: args.originalToolCall?.args || {},
              message: args.message || 'This tool requires approval to execute.',
              options: args.options || ['deny', 'approve_once', 'approve_session'],
              agentId: eventData.sender || eventData.agentName
            }
          };
        } catch (err) {
          console.error(`${error('Failed to parse approval request:')} ${err}`);
          return null;
        }
      }
    }

    // Look for client.humanIntervention calls (HITL)
    for (const toolCall of eventData.tool_calls) {
      if (toolCall.function?.name === 'client.humanIntervention') {
        try {
          const args = JSON.parse(toolCall.function.arguments || '{}');
          return {
            isApprovalRequest: false,
            isHITLRequest: true,
            hitlData: {
              toolCallId: toolCall.id,
              originalToolCall: args.originalToolCall,
              prompt: args.prompt || 'Please make a selection.',
              options: Array.isArray(args.options) && args.options.length > 0
                ? args.options
                : ['Cancel'],
              context: args.context,
              agentId: eventData.sender || eventData.agentName
            }
          };
        } catch (err) {
          console.error(`${error('Failed to parse HITL request:')} ${err}`);
          return null;
        }
      }
    }

    // Display other tool calls (non-approval, non-HITL)
    for (const toolCall of eventData.tool_calls) {
      if (toolCall.function?.name &&
        toolCall.function.name !== 'client.requestApproval' &&
        toolCall.function.name !== 'client.humanIntervention') {
        console.log(`${cyan('🔧')} ${yellow('Tool:')} ${toolCall.function.name}`);
      }
    }

    return { isApprovalRequest: false };
  }

  return null;
}
