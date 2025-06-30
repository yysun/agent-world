/**
 * Consolidated Display Module - Unified Terminal UI Management
 * 
 * Features:
 * - Single point of control for all CLI display operations
 * - Natural message flow without input prompt repositioning
 * - Enhanced streaming display with token counting and visual indicators
 * - Message display coordination with unified formatting
 * - Clean spacing and separation for readability
 * - Function-based design with consolidated state management
 * - Simple terminal integration for cross-platform compatibility
 * - Event-driven display coordination with memory-efficient state tracking
 * - Direct console output for simplicity and reliability
 * - Natural prompt flow that lets readline handle user input positioning
 * 
 * Implementation:
 * - Consolidated streaming API with enhanced token count display format
 * - Unified message display system with single displayUnifiedMessage function
 * - Removed redundant code and consolidated state management
 * - Enhanced streaming indicators: ● a1: sss... (↓110 tokens)
 * - Simplified virtual scrolling with essential functions only
 * - Consolidated input box management with minimal ANSI positioning
 * - Unified terminal capability detection and fallback mode handling
 * 
 * Changes (CC - Code Consolidation):
 * - Merged redundant streaming functions into single streamingAPI object
 * - Enhanced token display with ↑/↓ arrows and actual count display
 * - Removed duplicate state management code
 * - Simplified virtual scrolling to essential functions only
 * - Consolidated display coordination functions
 * - Removed unnecessary complexity while maintaining all functionality
 */

import { colors } from './colors';
import { addMessageToStore, createStoredMessage } from '../message-store';
import { formatMessageContent, shouldStoreMessage as shouldStoreFormattedMessage, type FormattableMessage } from './formatting';
import { logDisplayDebug, logStreamingDebug, logError, initializeLogging } from './logger';

// Global state for piped input detection
let isPipedInputGlobal = false;

export function setIsPipedInput(isPiped: boolean): void {
  isPipedInputGlobal = isPiped;
}

// Consolidated streaming API with enhanced token display
const streamingAPI = {
  activeAgents: new Map<string, {
    content: string;
    isActive: boolean;
    startTime: number;
    estimatedTokens: number;
    outputTokens: number;
  }>(),
  isActive: false,
  displayLines: new Map<string, string>(),
  updateInterval: null as NodeJS.Timeout | null,

  addStreamingAgent: (agentName: string, estimatedInputTokens: number) => {
    streamingAPI.activeAgents.set(agentName, {
      content: '',
      isActive: true,
      startTime: Date.now(),
      estimatedTokens: estimatedInputTokens,
      outputTokens: 0
    });
    streamingAPI.isActive = true;
    streamingAPI.showStreamingIndicator(agentName);
    streamingAPI.startUpdateLoop();
  },

  updateStreamingContent: (agentName: string, content: string) => {
    const agent = streamingAPI.activeAgents.get(agentName);
    if (agent) {
      agent.content += content;
      // Rough token estimation: ~4 characters per token
      agent.outputTokens = Math.ceil(agent.content.length / 4);
      streamingAPI.showStreamingIndicator(agentName, true);
    }
  },

  showStreamingIndicator: (agentName: string, hasContent = false) => {
    const agent = streamingAPI.activeAgents.get(agentName);
    if (!agent) return;

    const dots = ['●', '○', '◐', '◑'];
    const dotIndex = Math.floor(Date.now() / 500) % dots.length;
    const indicator = dots[dotIndex];

    const contentPreview = hasContent && agent.content.length > 0
      ? agent.content.substring(0, 20).replace(/\n/g, ' ') + '...'
      : 'responding...';

    // Show both input and output tokens
    const inputTokens = agent.estimatedTokens;
    const outputTokens = agent.outputTokens;
    const tokenDisplay = inputTokens > 0 || outputTokens > 0
      ? ` (↑${outputTokens} ↓${inputTokens} tokens)`
      : '';

    const line = `${colors.cyan(indicator)} ${agentName}: ${contentPreview}${colors.gray(tokenDisplay)}`;
    streamingAPI.displayLines.set(agentName, line);
  },

  startUpdateLoop: () => {
    if (streamingAPI.updateInterval) return;

    streamingAPI.updateInterval = setInterval(() => {
      if (streamingAPI.activeAgents.size === 0) {
        streamingAPI.stopUpdateLoop();
        return;
      }

      // Update streaming indicators
      for (const [agentName, agent] of streamingAPI.activeAgents) {
        if (agent.isActive) {
          streamingAPI.showStreamingIndicator(agentName, agent.content.length > 0);
        }
      }

      // Re-render streaming lines
      if (streamingAPI.displayLines.size > 0 && !isPipedInputGlobal) {
        process.stdout.write('\x1b[s'); // Save cursor position

        // Move up to overwrite streaming lines
        if (streamingAPI.displayLines.size > 0) {
          process.stdout.write(`\x1b[${streamingAPI.displayLines.size}A`);
        }

        // Clear and redraw each line
        for (const line of streamingAPI.displayLines.values()) {
          process.stdout.write('\x1b[2K'); // Clear line
          process.stdout.write(line + '\n');
        }

        process.stdout.write('\x1b[u'); // Restore cursor position
      }
    }, 500);
  },

  stopUpdateLoop: () => {
    if (streamingAPI.updateInterval) {
      clearInterval(streamingAPI.updateInterval);
      streamingAPI.updateInterval = null;
    }
  },

  completeStreaming: (agentName: string, finalContent?: string, usage?: any) => {
    const agent = streamingAPI.activeAgents.get(agentName);
    if (agent) {
      agent.isActive = false;
      if (finalContent) agent.content = finalContent;
      if (usage && usage.outputTokens) agent.outputTokens = usage.outputTokens;
    }
    streamingAPI.displayLines.delete(agentName);

    // Check if all agents are done
    const hasActiveAgents = Array.from(streamingAPI.activeAgents.values()).some(a => a.isActive);
    if (!hasActiveAgents) {
      streamingAPI.isActive = false;
      streamingAPI.stopUpdateLoop();

      // Clear any remaining streaming lines
      if (streamingAPI.displayLines.size > 0 && !isPipedInputGlobal) {
        process.stdout.write(`\x1b[${streamingAPI.displayLines.size}A`);
        for (let i = 0; i < streamingAPI.displayLines.size; i++) {
          process.stdout.write('\x1b[2K\n');
        }
        process.stdout.write(`\x1b[${streamingAPI.displayLines.size}A`);
      }
      streamingAPI.displayLines.clear();
    }
  },

  getStreamingAgents: () => Array.from(streamingAPI.activeAgents.keys()),

  getStreamingLine: (agentName: string) => {
    const agent = streamingAPI.activeAgents.get(agentName);
    return agent ? { content: agent.content } : null;
  },

  endStreamingDisplay: async () => {
    const results = Array.from(streamingAPI.activeAgents.entries()).map(([name, agent]) => ({
      agentName: name,
      content: agent.content
    }));
    streamingAPI.activeAgents.clear();
    streamingAPI.isActive = false;
    return results;
  },

  resetStreamingState: () => {
    streamingAPI.stopUpdateLoop();
    streamingAPI.activeAgents.clear();
    streamingAPI.displayLines.clear();
    streamingAPI.isActive = false;
  },

  isStreamingActive: () => streamingAPI.isActive,

  errorStreaming: (agentName: string) => {
    const agent = streamingAPI.activeAgents.get(agentName);
    if (agent) {
      agent.isActive = false;
    }
    streamingAPI.displayLines.delete(agentName);
  },

  setOnStreamingStartCallback: (callback: (() => void) | null) => {
    // Implementation handled by existing state.streaming callbacks
  }
};

// Use the streamingAPI as our streaming module replacement
const streaming = streamingAPI;

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
  skipSpacing?: boolean;
  metadata?: {
    source?: 'cli' | 'streaming' | 'system';
    messageType?: 'response' | 'command' | 'notification' | 'error';
    agentModel?: string;
    tokenCount?: number;
    worldName?: string;
  };
}

// State management interfaces
interface TerminalDisplayState {
  inputBoxY: number;
  isInputBoxVisible: boolean;
  term: any;
}

interface DisplayCoordinationState {
  isExitPending: boolean;
  exitCallbacks: (() => void)[];
  displayCallbacks: (() => void)[];
}

interface ScrollState {
  isScrollingEnabled: boolean;
  virtualLines: string[];
  viewportStart: number;
  viewportHeight: number;
  totalLines: number;
  autoScrollEnabled: boolean;
}

interface TerminalCapabilities {
  supportsAnsi: boolean;
  supportsColors: boolean;
  height: number;
  width: number;
  canPosition: boolean;
  canClear: boolean;
}

interface FallbackState {
  mode: 'ansi' | 'console' | 'hybrid';
  reason: string | null;
  capabilities: TerminalCapabilities;
  isInitialized: boolean;
}

interface ConsolidatedDisplayState {
  terminal: TerminalDisplayState;
  streaming: {
    onAllStreamingEndCallback: (() => void) | null;
    onStreamingStartCallback: (() => void) | null;
  };
  coordination: DisplayCoordinationState;
  global: { currentWorldName: string };
  scroll: ScrollState;
  fallback: FallbackState;
}

// Module state
let state: ConsolidatedDisplayState = {
  terminal: {
    inputBoxY: 0,
    isInputBoxVisible: false,
    term: null
  },
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
  },
  scroll: {
    isScrollingEnabled: false,
    virtualLines: [],
    viewportStart: 0,
    viewportHeight: 24,
    totalLines: 0,
    autoScrollEnabled: true
  },
  fallback: {
    mode: 'ansi',
    reason: null,
    capabilities: {
      supportsAnsi: true,
      supportsColors: true,
      height: 24,
      width: 80,
      canPosition: true,
      canClear: true
    },
    isInitialized: false
  }
};

// ============================================================================
// TERMINAL CAPABILITIES AND INITIALIZATION
// ============================================================================

/**
 * Detect terminal capabilities proactively
 */
function detectTerminalCapabilities(): TerminalCapabilities {
  const capabilities: TerminalCapabilities = {
    supportsAnsi: false,
    supportsColors: false,
    height: 24,
    width: 80,
    canPosition: false,
    canClear: false
  };

  try {
    if (!process.stdout.isTTY) return capabilities;

    capabilities.supportsAnsi = !process.env.NO_COLOR && !process.env.TERM_PROGRAM?.includes('dumb');
    capabilities.supportsColors = process.stdout.hasColors?.() ?? capabilities.supportsAnsi;
    capabilities.height = process.stdout.rows || 24;
    capabilities.width = process.stdout.columns || 80;
    capabilities.canPosition = !!(capabilities.supportsAnsi && process.stdout.moveCursor);
    capabilities.canClear = !!(capabilities.supportsAnsi && process.stdout.clearLine);

    return capabilities;
  } catch (error) {
    console.error('Error detecting terminal capabilities:', error);
    return capabilities;
  }
}

/**
 * Initialize fallback mode based on terminal capabilities
 */
function initializeFallbackMode(): void {
  if (state.fallback.isInitialized) return;

  const capabilities = detectTerminalCapabilities();
  state.fallback.capabilities = capabilities;

  if (!capabilities.supportsAnsi || !capabilities.canPosition) {
    state.fallback.mode = 'console';
    state.fallback.reason = 'Terminal does not support ANSI positioning';
  } else if (capabilities.height < 10 || capabilities.width < 40) {
    state.fallback.mode = 'console';
    state.fallback.reason = 'Terminal too small for advanced display';
  } else {
    state.fallback.mode = 'ansi';
  }

  state.fallback.isInitialized = true;

  if (state.fallback.mode === 'console') {
    console.log(`Fallback mode: ${state.fallback.reason}`);
  }
}

/**
 * Initialize the consolidated display system
 */
export function initializeDisplay(terminalInstance: any): void {
  state.terminal.term = terminalInstance;
  state.terminal.inputBoxY = 0;
  state.terminal.isInputBoxVisible = false;

  // Initialize logging system
  initializeLogging();

  initializeFallbackMode();

  if (state.fallback.mode === 'ansi') {
    setScrollingEnabled(false); // Disable scrolling by default
  }

  streaming.setOnStreamingStartCallback(() => {
    // Just call the callback - no input box management needed
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
 * Main unified display function - enforces consistent spacing: content → blank line → input box
 */
export function displayUnifiedMessage(message: UnifiedDisplayMessage): void {
  if (!state.fallback.isInitialized) {
    initializeFallbackMode();
  }

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

  // Display content with prepended new line
  console.log('\n' + formattedContent);

  // Store conversational messages
  if (shouldStoreMessage(message)) {
    storeMessage(message);
  }
}

/**
 * Centralized display sequencing - simple natural flow without repositioning
 */
function enforceSequentialDisplayFlow(): void {
  // Do nothing - let readline handle input naturally
  // This function is kept for compatibility but no longer manages positioning
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
// INPUT BOX MANAGEMENT
// ============================================================================

/**
 * Hide the input box and clear its display area
 */
export function hideInputBox(): void {
  if (!state.terminal.term) return;

  if (state.terminal.isInputBoxVisible && state.terminal.inputBoxY > 0) {
    try {
      state.terminal.term.moveTo(1, state.terminal.inputBoxY);
      state.terminal.term.eraseDisplayBelow();
      state.terminal.isInputBoxVisible = false;
    } catch (error) {
      console.error('Error hiding input box:', error);
      state.terminal.isInputBoxVisible = false;
    }
  }
}

/**
 * Save current terminal position for input box placement
 */
function saveCurrentPosition(): void {
  if (!state.terminal.term) return;

  // Only add spacing if we're not in fallback mode and not immediately after streaming
  if (state.fallback.mode === 'ansi') {
    console.log(); // Single line separation
  }

  state.terminal.inputBoxY = state.terminal.term.height - 1; // Simple prompt at bottom
}

/**
 * Draw the input box border and prompt
 */
export function drawInputBox(prompt: string = '> '): { x: number; y: number } {
  if (!state.terminal.term) return { x: 0, y: 0 };

  try {
    // Ensure terminal is in a clean state before drawing
    if (state.fallback.mode === 'ansi') {
      // Reset terminal attributes and ensure cursor is visible
      process.stdout.write('\x1B[0m'); // Reset all attributes
      process.stdout.write('\x1B[?25h'); // Show cursor
    }

    const width = state.terminal.term.width;
    saveCurrentPosition();
    state.terminal.term.moveTo(1, state.terminal.inputBoxY);

    // Draw simple prompt without box
    state.terminal.term(prompt);

    const inputStartX = 1 + prompt.length;
    const inputY = state.terminal.inputBoxY;

    state.terminal.isInputBoxVisible = true;
    return { x: inputStartX, y: inputY };
  } catch (error) {
    console.error('Error drawing input box:', error);
    state.terminal.isInputBoxVisible = false;
    return { x: 0, y: 0 };
  }
}

/**
 * Update only the input text portion without redrawing the entire box
 */
export function updateInputText(prompt: string = '> ', userInput: string = ''): { x: number; y: number } {
  if (!state.terminal.term || !state.terminal.isInputBoxVisible) {
    return drawInputBox(prompt);
  }

  const width = state.terminal.term.width;
  const inputStartX = 1 + prompt.length;
  const inputY = state.terminal.inputBoxY;
  const maxInputWidth = width - inputStartX;

  state.terminal.term.moveTo(inputStartX, inputY);

  const displayInput = userInput.length > maxInputWidth
    ? userInput.slice(-maxInputWidth)
    : userInput;

  const padding = Math.max(0, maxInputWidth - displayInput.length);
  state.terminal.term(displayInput + ' '.repeat(padding));

  const cursorX = inputStartX + displayInput.length;
  state.terminal.term.moveTo(cursorX, inputY);

  return { x: cursorX, y: inputY };
}

/**
 * Clear the input text area without redrawing the box
 */
export function clearInputText(prompt: string = '> '): void {
  if (!state.terminal.term || !state.terminal.isInputBoxVisible) return;

  const width = state.terminal.term.width;
  const inputStartX = 1 + prompt.length;
  const inputY = state.terminal.inputBoxY;
  const maxInputWidth = width - inputStartX;

  state.terminal.term.moveTo(inputStartX, inputY);
  state.terminal.term(' '.repeat(maxInputWidth));
  state.terminal.term.moveTo(inputStartX, inputY);
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
    const agent = streamingAPI.activeAgents.get(name);
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
  const finalResults = await streaming.endStreamingDisplay();

  // Display final results using unified message system
  for (const line of finalResults) {
    const finalContent = line.content || '[no response]';

    displayUnifiedMessage({
      type: 'agent',
      content: finalContent + '\n', // Add spacing to separate final messages
      sender: line.agentName,
      skipSpacing: true, // Skip input box drawing during finalization
      metadata: {
        source: 'streaming',
        messageType: 'response'
      }
    });
  }

  streaming.resetStreamingState();

  // Add a small delay before calling the callback to ensure display has settled
  setTimeout(() => {
    if (state.streaming.onAllStreamingEndCallback) {
      try {
        state.streaming.onAllStreamingEndCallback();
      } catch (error) {
        logError('display', 'Error in streaming end callback', { error });
      }
    }
  }, 100);
}

/**
 * Mark an agent's streaming as having an error
 */
export function markStreamingError(agentName: string): void {
  streaming.errorStreaming(agentName);

  // Check if all streaming is complete and trigger callback
  if (!streaming.isStreamingActive()) {
    finalizeStreaming();
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
 * Setup streaming end callback to add spacing when streaming completes
 */
export function setupStreamingEndCallback(): void {
  setOnAllStreamingEndCallback(() => {
    if (!isPipedInputGlobal) {
      enforceSequentialDisplayFlow();
    }
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
  } else if (hasExternalInput) {
    setTimeout(() => {
      if (!streaming.isStreamingActive()) {
        if (!isPiped) {
          enforceSequentialDisplayFlow();
        }
      } else {
        // Set callback to add spacing when streaming ends
        setOnAllStreamingEndCallback(() => {
          if (!isPiped) {
            enforceSequentialDisplayFlow();
          }
        });
      }
    }, 100);
  }
}

/**
 * Show initial spacing for interactive mode
 */
export function showInitialPrompt(): void {
  if (!isPipedInputGlobal) {
    enforceSequentialDisplayFlow();
  }
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

// ============================================================================
// CONSOLIDATED SCROLLING MANAGEMENT
// ============================================================================

/**
 * Simple scrolling functions for terminal navigation
 */
function scrollToBottom(): void {
  const maxStart = Math.max(0, state.scroll.totalLines - state.scroll.viewportHeight);
  state.scroll.viewportStart = maxStart;
}

function scrollUp(lines: number = 1): void {
  state.scroll.viewportStart = Math.max(0, state.scroll.viewportStart - lines);
  state.scroll.autoScrollEnabled = false;
}

function scrollDown(lines: number = 1): void {
  const maxStart = Math.max(0, state.scroll.totalLines - state.scroll.viewportHeight);
  state.scroll.viewportStart = Math.min(maxStart, state.scroll.viewportStart + lines);

  if (state.scroll.viewportStart >= maxStart) {
    state.scroll.autoScrollEnabled = true;
  }
}

function setScrollingEnabled(enabled: boolean): void {
  state.scroll.isScrollingEnabled = enabled;
  if (enabled) {
    state.scroll.viewportHeight = state.fallback.capabilities.height - 5;
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

// Scroll management
export { scrollUp, scrollDown, scrollToBottom, setScrollingEnabled };

// Fallback system
export { initializeFallbackMode };
