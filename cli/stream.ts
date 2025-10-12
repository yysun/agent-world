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
 * - Callback-based timer management for flexibility
 */

// Color helpers
const gray = (text: string) => `\x1b[90m${text}\x1b[0m`;
const boldGreen = (text: string) => `\x1b[1m\x1b[32m${text}\x1b[0m`;
const error = (text: string) => `\x1b[1m\x1b[31m✗\x1b[0m ${text}`;

// Streaming state interface
export interface StreamingState {
  isActive: boolean;
  content: string;
  sender?: string;
  messageId?: string;
  wait?: (delay: number) => void;
  stopWait?: () => void;
}

export function createStreamingState(): StreamingState {
  return {
    isActive: false,
    content: '',
    sender: undefined,
    messageId: undefined,
    wait: undefined,
    stopWait: undefined
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
      streaming.messageId = eventData.messageId;
      process.stdout.write(`\n${boldGreen(`● ${streaming.sender}`)} ${gray('is responding...')}`);
      if (streaming.stopWait) {
        streaming.stopWait();
      }
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

      if (streaming.wait) {
        streaming.wait(500);
      }
    }
    return;
  }

  // PHASE 2.2 ENHANCEMENT: Handle tool execution events
  if (eventData.type === 'tool-start' && eventData.toolExecution) {
    const toolName = eventData.toolExecution.toolName;
    console.log(`\n${gray('🔧')} ${boldGreen('Tool:')} ${toolName} ${gray('starting...')}`);
    return;
  }

  if (eventData.type === 'tool-progress' && eventData.toolExecution) {
    const toolName = eventData.toolExecution.toolName;
    console.log(`${gray('⚙️  Tool:')} ${toolName} ${gray('executing...')}`);
    return;
  }

  if (eventData.type === 'tool-result' && eventData.toolExecution) {
    const { toolName, duration, resultSize } = eventData.toolExecution;
    const durationText = duration ? `${Math.round(duration)}ms` : 'completed';
    const sizeText = resultSize ? `, ${resultSize} chars` : '';
    console.log(`${gray('✅ Tool:')} ${toolName} ${gray(`completed (${durationText}${sizeText})`)}`);
    return;
  }

  if (eventData.type === 'tool-error' && eventData.toolExecution) {
    const { toolName, error: toolError } = eventData.toolExecution;
    console.log(`${error('❌ Tool:')} ${toolName} ${error(`failed: ${toolError}`)}`);
    return;
  }

  // Handle end events
  if (eventData.type === 'end' && streaming.isActive && streaming.messageId === eventData.messageId) {
    console.log('\n');
    resetStreamingState(streaming);

    if (streaming.wait) {
      streaming.wait(2000);
    }
    return;
  }

  // Handle error events
  if (eventData.type === 'error' && streaming.isActive && streaming.messageId === eventData.messageId) {
    console.log(error(`Stream error: ${eventData.error || eventData.message}`));
    resetStreamingState(streaming);

    if (streaming.wait) {
      streaming.wait(2000);
    }
  }
}

export function handleWorldEventWithStreaming(
  eventType: string,
  eventData: any,
  streaming: StreamingState
): boolean {
  // Skip user messages to prevent echo
  if (eventData.sender && (eventData.sender === 'HUMAN' || eventData.sender === 'CLI' || eventData.sender.startsWith('user'))) {
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
}

export function isStreamingActive(streaming: StreamingState): boolean {
  return streaming.isActive;
}
