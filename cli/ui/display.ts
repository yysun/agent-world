/**
 * Consolidated Display Module - Unified Console UI Management
 * 
 * Features:
 * - Single point of control for all CLI display operations
 * - Natural message flow with console output
 * - Message display coordination with unified formatting
 * - Clean spacing and separation for readability
 * - Function-based design with consolidated state management
 * - Simple console integration for cross-platform compatibility
 * - Event-driven display coordination with memory-efficient state tracking
 * - Direct console output for simplicity and reliability
 * 
 * Implementation:
 * - Unified message display system with single displayUnifiedMessage function
 * - Removed redundant code and consolidated state management
 * - Streaming functionality extracted to separate stream.ts module
 * - Console-based output without complex terminal positioning
 * - Unified formatting and message handling
 * 
 * Changes (Terminal Removal):
 * - Removed all terminal positioning and ANSI escape code handling
 * - Simplified to pure console-based output
 * - Removed input box management and terminal capabilities detection
 * - Maintained streaming functionality through stream.ts integration
 * - Enhanced code organization and maintainability
 */

import { colors } from './colors';
import { addMessageToStore, createStoredMessage } from '../message-store';
import { formatMessageContent, shouldStoreMessage as shouldStoreFormattedMessage, type FormattableMessage } from './formatting';
import { logDisplayDebug, logStreamingDebug, logError, initializeLogging } from './logger';
import {
  streaming as streamingModule,
  setIsPipedInput as setStreamingIsPipedInput,
  startStreaming as streamingStart,
  addStreamingContent as streamingAddContent,
  endStreaming as streamingEnd,
  markStreamingError as streamingMarkError,
  setStreamingUsage as streamingSetUsage,
  isStreamingActive as streamingIsActive,
  resetStreamingState as streamingReset,
  getStreamingAgents,
  getStreamingLine,
  endStreamingDisplay
} from './stream';

// Global state for piped input detection
let isPipedInputGlobal = false;

export function setIsPipedInput(isPiped: boolean): void {
  isPipedInputGlobal = isPiped;
  setStreamingIsPipedInput(isPiped);
}

// Use the streamingModule from the stream module
const streaming = streamingModule;

// Core types and interfaces
export type MessageType = 'help' | 'command' | 'human' | 'agent' | 'system' | 'debug' | 'error' | 'status' | 'file' | 'instruction';
export type CommandSubtype = 'success' | 'error' | 'warning' | 'info' | 'usage';

export interface UnifiedDisplayMessage {
  type: MessageType;
  content: string;
  sender?: string;
  commandSubtype?: CommandSubtype;
  emoji?: string;
  color?: string;
  metadata?: {
    source?: 'cli' | 'streaming' | 'system';
    messageType?: 'response' | 'command' | 'notification' | 'error';
    agentModel?: string;
    tokenCount?: number;
    worldName?: string;
  };
}

// State management interfaces
interface DisplayCoordinationState {
  isExitPending: boolean;
  exitCallbacks: (() => void)[];
  displayCallbacks: (() => void)[];
}

interface ConsolidatedDisplayState {
  streaming: {
    onAllStreamingEndCallback: (() => void) | null;
    onStreamingStartCallback: (() => void) | null;
  };
  coordination: DisplayCoordinationState;
  global: { currentWorldName: string };
}

// Module state
let state: ConsolidatedDisplayState = {
  streaming: {
    onAllStreamingEndCallback: null,
    onStreamingStartCallback: null
  },
  coordination: {
    isExitPending: false,
    exitCallbacks: [],
    displayCallbacks: []
  },
  global: {
    currentWorldName: 'default'
  }
};

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Initialize the consolidated display system
 */
export function initializeDisplay(): void {
  // Initialize logging system
  initializeLogging();

  streaming.setOnStreamingStartCallback(() => {
    // Just call the callback
    if (state.streaming.onStreamingStartCallback) {
      state.streaming.onStreamingStartCallback();
    }
  });
}

export function setCurrentWorldName(worldName: string): void {
  state.global.currentWorldName = worldName;
}

// ============================================================================
// UNIFIED MESSAGE DISPLAY
// ============================================================================

/**
 * Main unified display function - simple console output with consistent formatting
 */
export function displayUnifiedMessage(message: UnifiedDisplayMessage): void {
  logDisplayDebug('displayUnifiedMessage called', {
    type: message.type,
    sender: message.sender,
    contentLength: message.content.length,
    contentPreview: message.content.substring(0, 100),
    shouldStore: shouldStoreMessage(message),
    metadata: message.metadata
  });

  const formattedContent = formatMessageContent({
    type: message.type,
    content: message.content,
    sender: message.sender,
    commandSubtype: message.commandSubtype,
    emoji: message.emoji,
    color: message.color
  });

  // Display content with prepended new line for spacing
  console.log('\n' + formattedContent);

  // Store conversational messages
  if (shouldStoreMessage(message)) {
    storeMessage(message);
  }
}

function shouldStoreMessage(message: UnifiedDisplayMessage): boolean {
  return shouldStoreFormattedMessage(message.type);
}

function storeMessage(message: UnifiedDisplayMessage): void {
  if (!message.sender) return;

  const storedMessage = createStoredMessage(
    message.sender,
    message.content,
    state.global.currentWorldName,
    message.metadata
  );

  addMessageToStore(storedMessage);
}

// ============================================================================
// STREAMING DISPLAY MANAGEMENT
// ============================================================================

/**
 * Start streaming for a specific agent
 */
export function startStreaming(agentName: string, displayName: string, estimatedInputTokens?: number): void {
  streaming.addStreamingAgent(agentName, estimatedInputTokens || 0);
}

/**
 * Add content to an agent's streaming buffer
 */
export function addStreamingContent(agentName: string, content: string): void {
  streaming.updateStreamingContent(agentName, content);
}

/**
 * End streaming for a specific agent
 */
export function endStreaming(agentName: string): void {
  streaming.completeStreaming(agentName);

  // Check if all streaming is complete by checking if there are any active streaming agents
  const activeAgents = streaming.getStreamingAgents();

  const remainingActiveAgents = activeAgents.filter(name => {
    const agent = streaming.activeAgents.get(name);
    return agent && agent.isActive;
  });

  if (remainingActiveAgents.length === 0) {
    // Use setImmediate to ensure async execution doesn't block
    setImmediate(async () => {
      try {
        await finalizeStreaming();
      } catch (error) {
        logError('display', 'Error in finalizeStreaming', { error });
      }
    });
  }
}

/**
 * Finalize streaming and show final results
 */
async function finalizeStreaming(): Promise<void> {
  logStreamingDebug('🎬 FINALIZE_STREAMING_START', {
    timestamp: new Date().toISOString()
  });
  
  const finalResults = await streamingModule.endStreamingDisplay();
  
  logStreamingDebug('📋 FINALIZE_STREAMING_RESULTS', {
    resultsCount: finalResults.length,
    results: finalResults.map(r => ({
      agentName: r.agentName,
      contentLength: r.content?.length || 0,
      hasContent: !!(r.content && r.content.trim()),
      contentPreview: r.content?.substring(0, 100) || 'null',
      isEmpty: !r.content || r.content.trim() === ''
    }))
  });

  // Add a visual separator before showing final results
  if (finalResults.length > 0) {
    console.log(); // Extra spacing before final results
  }

  // Display final results using unified message system
  for (const line of finalResults) {
    const finalContent = line.content || '[no response]';

    logStreamingDebug('🖥️ DISPLAY_FINAL_MESSAGE', {
      agentName: line.agentName,
      originalContentLength: line.content?.length || 0,
      finalContentLength: finalContent.length,
      willShowNoResponse: finalContent === '[no response]',
      contentPreview: finalContent.substring(0, 100)
    });

    // Debug log for content verification
    if (!line.content || line.content.trim() === '') {
      logError('display', 'Agent completed streaming but has no content', { 
        agentName: line.agentName, 
        contentLength: line.content?.length || 0,
        contentPreview: line.content?.substring(0, 50) || 'null'
      });
    }

    displayUnifiedMessage({
      type: 'agent',
      content: finalContent,
      sender: line.agentName,
      metadata: {
        source: 'streaming',
        messageType: 'response'
      }
    });
  }

  streaming.resetStreamingState();

  logStreamingDebug('🔄 FINALIZE_STREAMING_END', {
    resetComplete: true,
    hasEndCallback: !!state.streaming.onAllStreamingEndCallback
  });

  // Immediately call the callback to restore the prompt
  if (state.streaming.onAllStreamingEndCallback) {
    try {
      logStreamingDebug('📞 CALLING_END_CALLBACK', {});
      state.streaming.onAllStreamingEndCallback();
    } catch (error) {
      logError('display', 'Error in streaming end callback', { error });
    }
  }
}

/**
 * Mark an agent's streaming as having an error
 */
export function markStreamingError(agentName: string): void {
  streaming.errorStreaming(agentName);

  // Check if all streaming is complete and trigger callback
  if (!streaming.isStreamingActive()) {
    // Use setImmediate to ensure async execution doesn't block
    setImmediate(async () => {
      try {
        await finalizeStreaming();
      } catch (error) {
        logError('display', 'Error in finalizeStreaming after error', { error });
      }
    });
  }
}

/**
 * Set token usage information for an agent
 */
export function setStreamingUsage(agentName: string, usage: { inputTokens: number; outputTokens: number; totalTokens: number }): void {
  const line = streaming.getStreamingLine(agentName);
  if (line) {
    // Update the line with final usage information
    streaming.completeStreaming(agentName, line.content, usage);
  }
}

/**
 * Check if any agent is currently streaming
 */
export function isStreamingActive(): boolean {
  return streaming.isStreamingActive();
}

/**
 * Reset all streaming state
 */
export function resetStreamingState(): void {
  streaming.resetStreamingState();
}

// ============================================================================
// DISPLAY COORDINATION
// ============================================================================

/**
 * Setup streaming end callback
 */
export function setupStreamingEndCallback(): void {
  setOnAllStreamingEndCallback(() => {
    // No special handling needed for console output
  });
}

/**
 * Set callback to be called when all streaming ends
 */
export function setOnAllStreamingEndCallback(callback: (() => void) | null): void {
  state.streaming.onAllStreamingEndCallback = callback;
}

/**
 * Set callback to be called when streaming starts
 */
export function setOnStreamingStartCallback(callback: (() => void) | null): void {
  state.streaming.onStreamingStartCallback = callback;
}

/**
 * Handle external input processing and exit timing
 */
export function handleExternalInputDisplay(hasExternalInput: boolean, isPiped: boolean): void {
  if (hasExternalInput && isPiped) {
    setTimeout(() => {
      if (!streaming.isStreamingActive()) {
        displayUnifiedMessage({
          type: 'instruction',
          content: 'Piped input processed. Exiting...',
          metadata: { source: 'cli', messageType: 'notification' }
        });
        process.exit(0);
      } else {
        setOnAllStreamingEndCallback(() => {
          displayUnifiedMessage({
            type: 'instruction',
            content: 'Streaming completed. Exiting...',
            metadata: { source: 'cli', messageType: 'notification' }
          });
          process.exit(0);
        });
      }
    }, 100);
  }
}

/**
 * Show initial spacing for interactive mode
 */
export function showInitialPrompt(): void {
  // No special handling needed for console output
}

// ============================================================================
// CONVENIENCE FUNCTIONS
// ============================================================================

/**
 * Display success message
 */
export function displaySuccess(content: string): void {
  displayUnifiedMessage({
    type: 'command',
    content,
    commandSubtype: 'success'
  });
}

/**
 * Display error message
 */
export function displayError(content: string): void {
  displayUnifiedMessage({
    type: 'error',
    content
  });
}

/**
 * Display warning message
 */
export function displayWarning(content: string): void {
  displayUnifiedMessage({
    type: 'command',
    content,
    commandSubtype: 'warning'
  });
}

/**
 * Display info message
 */
export function displayInfo(content: string): void {
  displayUnifiedMessage({
    type: 'command',
    content,
    commandSubtype: 'info'
  });
}

/**
 * Display instruction message
 */
export function displayInstruction(content: string): void {
  displayUnifiedMessage({
    type: 'instruction',
    content
  });
}

/**
 * Display debug message
 */
export function displayDebugMessage(message: string): void {
  // Debug messages are now logged to file only, not displayed in terminal
  logDisplayDebug(message);
}
