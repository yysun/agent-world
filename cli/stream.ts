/**
 * CLI Streaming Module - Real-time Agent Response Display
 * 
 * Manages streaming display functionality for the CLI interface with real-time chunk 
 * accumulation, visual feedback, timer management, and comprehensive event processing.
 *
 * FEATURES:
 * - Real-time streaming with visual feedback and state tracking
 * - Smart prompt restoration with timer management
 * - Comprehensive event processing (chunk, end, error)
 * - Color-coded streaming indicators and status messages
 * - Modular design for reuse across CLI components
 *
 * USAGE:
 * Import functions and types as needed for streaming functionality in CLI applications.
 */

import readline from 'readline';

// Color helpers
const gray = (text: string) => `\x1b[90m${text}\x1b[0m`;
const boldGreen = (text: string) => `\x1b[1m\x1b[32m${text}\x1b[0m`;
const error = (text: string) => `\x1b[1m\x1b[31m✗\x1b[0m ${text}`;

// Interfaces
export interface StreamingState {
  isActive: boolean;
  content: string;
  sender?: string;
  messageId?: string;
}

export interface GlobalState {
  promptTimer?: ReturnType<typeof setTimeout>;
}

// Timer management
export function setupPromptTimer(
  globalState: GlobalState,
  rl: readline.Interface,
  callback: () => void,
  delay: number = 2000
): void {
  clearPromptTimer(globalState);
  globalState.promptTimer = setTimeout(callback, delay);
}

export function clearPromptTimer(globalState: GlobalState): void {
  if (globalState.promptTimer) {
    clearTimeout(globalState.promptTimer);
    globalState.promptTimer = undefined;
  }
}

// State creators
export function createStreamingState(): StreamingState {
  return {
    isActive: false,
    content: '',
    sender: undefined,
    messageId: undefined
  };
}

export function createGlobalState(): GlobalState {
  return {};
}

// Main streaming event handler
export function handleStreamingEvents(
  eventData: any,
  streaming: { current: StreamingState },
  globalState: GlobalState,
  rl?: readline.Interface
): void {
  // Handle chunk events
  if (eventData.type === 'chunk' && eventData.content) {
    if (!streaming.current.isActive) {
      streaming.current.isActive = true;
      streaming.current.content = '';
      streaming.current.sender = eventData.agentName || eventData.sender;
      streaming.current.messageId = eventData.messageId;
      console.log(`\n${boldGreen(`● ${streaming.current.sender}`)} ${gray('is responding...')}`);
      clearPromptTimer(globalState);
    }

    if (streaming.current.messageId === eventData.messageId) {
      streaming.current.content += eventData.content;
      process.stdout.write(eventData.content);

      if (rl) {
        setupPromptTimer(globalState, rl, () => {
          if (streaming.current.isActive) {
            console.log(`\n${gray('Streaming appears stalled - waiting for user input...')}`);
            resetStreamingState(streaming);
            rl.prompt();
          }
        }, 500);
      }
    }
    return;
  }

  // Handle end events
  if (eventData.type === 'end' && streaming.current.isActive && streaming.current.messageId === eventData.messageId) {
    console.log('\n');
    resetStreamingState(streaming);

    if (rl) {
      clearPromptTimer(globalState);
      setupPromptTimer(globalState, rl, () => rl.prompt(), 2000);
    }
    return;
  }

  // Handle error events
  if (eventData.type === 'error' && streaming.current.isActive && streaming.current.messageId === eventData.messageId) {
    console.log(error(`Stream error: ${eventData.error || eventData.message}`));
    resetStreamingState(streaming);

    if (rl) {
      clearPromptTimer(globalState);
      setupPromptTimer(globalState, rl, () => rl.prompt(), 2000);
    }
  }
}

// World event handler with streaming support
export function handleWorldEventWithStreaming(
  eventType: string,
  eventData: any,
  streaming: { current: StreamingState },
  globalState: GlobalState,
  rl?: readline.Interface
): boolean {
  // Skip user messages to prevent echo
  if (eventData.sender && (eventData.sender === 'HUMAN' || eventData.sender === 'CLI' || eventData.sender.startsWith('user'))) {
    return false;
  }

  // Handle streaming events
  if (eventType === 'sse') {
    handleStreamingEvents(eventData, streaming, globalState, rl);
    return true;
  }

  return false;
}

// Utility functions
export function resetStreamingState(streaming: { current: StreamingState }): void {
  streaming.current.isActive = false;
  streaming.current.content = '';
  streaming.current.sender = undefined;
  streaming.current.messageId = undefined;
}

export function isStreamingActive(streaming: { current: StreamingState }): boolean {
  return streaming.current.isActive;
}
