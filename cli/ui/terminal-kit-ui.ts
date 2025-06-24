/**
 * Simplified Terminal-Kit UI Implementation (Phase 2: Screen Layout Simplification)
 * 
 * This module provides a simplified terminal user interface using the terminal-kit library.
 * Features include:
 * - Simple two-area vertical layout (content top, input bottom)
 * - Scrollable content area preserving original CLI behavior
 * - Enhanced bordered input area with multiline support
 * - Text editing with cursor movement and proper positioning
 * - Familiar CLI experience with improved input handling
 * - Multi-agent streaming support with individual preview lines
 * 
 * Architecture:
 * - Function-based UI with simplified state management
 * - Two-area screen division (content area + input area)
 * - Content area: Exactly like original CLI - scrollable, simple message display
 * - Input area: Enhanced bordered input box with multiline support
 * - Integration with existing World/Agent system unchanged
 * 
 * Simplified Design:
 * - No complex menus or widgets - focus on content + input
 * - Top area preserves all existing CLI functionality
 * - Bottom area provides enhanced text editing experience
 * - Maintains backward compatibility with all commands
 * 
 * Streaming Features:
 * - Individual streaming preview lines for each agent
 * - Real-time update of streaming content with proper line management
 * - Automatic cleanup of streaming previews when responses complete
 * - Support for multiple agents streaming simultaneously
 * - Consistent input focus management after all operations
 * 
 * Input Focus Management:
 * - Automatically returns focus to input area after command execution
 * - Maintains input focus during streaming updates and completions
 * - Ensures cursor positioning and visibility after all UI updates
 * - Proper input field restart with focus restoration
 */

import termkit from 'terminal-kit';
const term = termkit.terminal;

// Simplified UI State Management
interface UIState {
  mode: UIMode;
  isActive: boolean;
  currentInput: string;
  responseBuffer: string[];
  selectedAgents: string[];
  inputHistory: string[];
  historyIndex: number;
  agents: Array<{ name: string; model: string; provider: string; status: string }>;
  currentWorld: string;
  inputFieldActive: boolean;
  contentAreaHeight: number;
  inputAreaHeight: number;
  scrollOffset: number;
}

// Simplified UI Mode Enumeration (removed complex modes)
enum UIMode {
  CHAT = 'chat',
  COMMAND = 'command'
}

// Event Handler Types
type InputHandler = (input: string) => void;
type CommandHandler = (command: string, args: string[]) => void;
type QuitHandler = () => void;

// Terminal UI Handler Interface
interface TerminalKitUIHandlers {
  onInput?: InputHandler;
  onCommand?: CommandHandler;
  onQuit?: QuitHandler;
}

// Simplified Terminal UI Interface
interface TerminalKitUIInterface {
  initialize: (handlers: TerminalKitUIHandlers) => void;
  displayMessage: (agentName: string, message: string) => void;
  displayError: (error: string) => void;
  displaySystem: (message: string) => void;
  displayUserInput: (input: string) => void;
  updateStreamingPreview: (agentId: string, preview: string) => void;
  clearStreamingPreview: (agentId: string) => void;
  cleanup: () => void;
  setMode: (mode: UIMode) => void;
  getCurrentMode: () => UIMode;
  startInputMode: () => void;
  processCommand: (command: string) => Promise<void>;
  updateAgents: (agents: Array<{ name: string; model: string; provider: string; status: string }>) => void;
  setCurrentWorld: (world: string) => void;
}

// Create Simplified Terminal-Kit UI (Two-Area Layout)
function createTerminalKitUI(): TerminalKitUIInterface {
  // Simplified state management 
  const state: UIState = {
    mode: UIMode.CHAT,
    isActive: false,
    currentInput: '',
    responseBuffer: [],
    selectedAgents: [],
    inputHistory: [],
    historyIndex: -1,
    agents: [],
    currentWorld: 'default-world',
    inputFieldActive: false,
    contentAreaHeight: 0,
    inputAreaHeight: 5, // Fixed height for input area
    scrollOffset: 0
  };

  // Track streaming previews for in-place updates
  const streamingPreviews = new Map<string, { line: string; displayed: boolean }>();

  let onInput: InputHandler | undefined;
  let onCommand: CommandHandler | undefined;
  let onQuit: QuitHandler | undefined;

  // Calculate screen areas
  function calculateScreenAreas(): void {
    state.contentAreaHeight = term.height - state.inputAreaHeight - 3; // 3 for header and separators
    state.inputAreaHeight = Math.min(5, Math.max(3, Math.floor(term.height * 0.2))); // 20% of screen or min 3, max 5
  }

  // Setup terminal configuration
  function setupTerminal(): void {
    term.fullscreen(true);
    term.hideCursor(false);
    calculateScreenAreas();

    // Handle terminal resize
    term.on('resize', () => {
      calculateScreenAreas();
      drawScreen();
    });

    // Handle process termination
    process.on('SIGINT', () => {
      cleanup();
      process.exit(0);
    });
  }

  // Draw the complete screen layout
  function drawScreen(): void {
    term.clear();
    drawHeader();
    drawContentArea();
    drawSeparator();
    drawInputArea();

    // Ensure cursor is positioned in input area after drawing
    const inputY = 4 + state.contentAreaHeight + 1;
    term.moveTo(5, inputY);
    term.hideCursor(false);
  }

  // Draw header
  function drawHeader(): void {
    term.moveTo(1, 1);
    term.styleReset();
    term.bgCyan().black(` Agent World - ${state.currentWorld} `);
    term.styleReset();
    term.moveTo(1, 2);
    term.gray('─'.repeat(term.width));
  }

  // Draw content area (scrollable, like original CLI)
  function drawContentArea(): void {
    const startY = 3;
    const endY = startY + state.contentAreaHeight;

    // Clear content area
    for (let y = startY; y < endY; y++) {
      term.moveTo(1, y);
      term.eraseLine();
    }

    // Display messages from buffer
    const visibleMessages = state.responseBuffer.slice(state.scrollOffset, state.scrollOffset + state.contentAreaHeight);
    visibleMessages.forEach((message, index) => {
      term.moveTo(1, startY + index);
      term.styleReset();
      term.white(message);
    });
  }

  // Draw separator between content and input areas
  function drawSeparator(): void {
    const separatorY = 3 + state.contentAreaHeight;
    term.moveTo(1, separatorY);
    term.gray('─'.repeat(term.width));
  }

  // Draw enhanced input area with border
  function drawInputArea(): void {
    const inputStartY = 4 + state.contentAreaHeight;
    const inputEndY = inputStartY + state.inputAreaHeight - 1;

    // Clear the input area completely first
    for (let y = inputStartY; y <= inputEndY; y++) {
      term.moveTo(1, y);
      term.eraseLineAfter();
      // Add a space to fully clear the line
      term(' '.repeat(term.width - 1));
      term.moveTo(1, y);
    }

    // Draw input box border
    term.moveTo(1, inputStartY);
    term.gray('┌' + '─'.repeat(term.width - 2) + '┐');

    for (let y = inputStartY + 1; y < inputEndY; y++) {
      term.moveTo(1, y);
      term.gray('│');
      term.moveTo(term.width, y);
      term.gray('│');
    }

    term.moveTo(1, inputEndY);
    term.gray('└' + '─'.repeat(term.width - 2) + '┘');

    // Draw input prompt
    term.moveTo(3, inputStartY + 1);
    term.styleReset();
    term.green('> ');

    // Ensure cursor is visible and positioned correctly for input
    term.moveTo(5, inputStartY + 1);
    term.hideCursor(false); // Make cursor visible
  }

  // Helper function to ensure input focus is set
  function ensureInputFocus(): void {
    if (state.inputFieldActive) {
      const inputY = 4 + state.contentAreaHeight + 1;
      term.moveTo(5, inputY);
      term.hideCursor(false);
    }
  }

  // Initialize UI
  function initialize(handlers: TerminalKitUIHandlers): void {
    onInput = handlers.onInput;
    onCommand = handlers.onCommand;
    onQuit = handlers.onQuit;

    state.isActive = true;
    drawScreen();

    // Start input mode immediately after drawing screen
    displaySystem('Simplified Terminal UI initialized. Type /help for commands.');

    // Ensure input has focus immediately
    setTimeout(() => {
      startInputMode();
    }, 100);
  }

  // Display agent message
  function displayMessage(agentName: string, message: string): void {
    // Clear any streaming preview for this agent first
    clearStreamingPreviewForAgent(agentName);

    const formattedMessage = `\x1b[32m●\x1b[0m ${agentName}: ${message}`;
    state.responseBuffer.push(formattedMessage);

    // Auto-scroll to show latest messages
    if (state.responseBuffer.length > state.contentAreaHeight) {
      state.scrollOffset = state.responseBuffer.length - state.contentAreaHeight;
    }

    drawContentArea();
    ensureInputFocus();
  }

  // Clear streaming preview for a specific agent
  function clearStreamingPreviewForAgent(agentName: string): void {
    // Find and remove streaming preview for this agent
    for (const [agentId, preview] of streamingPreviews) {
      if (preview.line.includes(`● ${agentName}:`)) {
        // Remove from buffer if it's the last entry
        const lastIndex = state.responseBuffer.length - 1;
        if (lastIndex >= 0 && state.responseBuffer[lastIndex] === preview.line) {
          state.responseBuffer.splice(lastIndex, 1);
        }
        streamingPreviews.delete(agentId);
        break;
      }
    }
  }

  // Display error message
  function displayError(error: string): void {
    const formattedError = `❌ Error: ${error}`;
    state.responseBuffer.push(formattedError);

    if (state.responseBuffer.length > state.contentAreaHeight) {
      state.scrollOffset = state.responseBuffer.length - state.contentAreaHeight;
    }

    drawContentArea();
    ensureInputFocus();
  }

  // Display system message
  function displaySystem(message: string): void {
    const formattedSystem = `\x1b[34m●\x1b[0m ${message}`;
    state.responseBuffer.push(formattedSystem);

    if (state.responseBuffer.length > state.contentAreaHeight) {
      state.scrollOffset = state.responseBuffer.length - state.contentAreaHeight;
    }

    drawContentArea();
    ensureInputFocus();
  }

  // Display user input message
  function displayUserInput(input: string): void {
    const formattedInput = `\x1b[38;5;208m●\x1b[0m You: ${input}`;
    state.responseBuffer.push(formattedInput);

    if (state.responseBuffer.length > state.contentAreaHeight) {
      state.scrollOffset = state.responseBuffer.length - state.contentAreaHeight;
    }

    // More targeted refresh to prevent text mixing without full screen clear
    drawContentArea();
    drawSeparator();
    drawInputArea();
    ensureInputFocus();
  }

  // Update streaming preview for an agent (single-line in-place updates)
  function updateStreamingPreview(agentId: string, preview: string): void {
    const currentPreview = streamingPreviews.get(agentId);

    if (currentPreview && currentPreview.displayed) {
      // Find and replace the existing streaming preview for this agent
      const existingIndex = state.responseBuffer.findIndex(line => line === currentPreview.line);
      if (existingIndex !== -1) {
        state.responseBuffer[existingIndex] = preview;
      } else {
        // If not found, add the new preview
        state.responseBuffer.push(preview);
      }
    } else {
      // First preview for this agent, add to buffer
      state.responseBuffer.push(preview);
    }

    // Update streaming preview tracking
    streamingPreviews.set(agentId, { line: preview, displayed: true });

    // Handle scrolling
    if (state.responseBuffer.length > state.contentAreaHeight) {
      state.scrollOffset = state.responseBuffer.length - state.contentAreaHeight;
    }

    drawContentArea();
    ensureInputFocus();
  }

  // Clear streaming preview for a specific agent by ID
  function clearStreamingPreview(agentId: string): void {
    const currentPreview = streamingPreviews.get(agentId);
    if (currentPreview && currentPreview.displayed) {
      // Find and remove the streaming preview line from the buffer
      const existingIndex = state.responseBuffer.findIndex(line => line === currentPreview.line);
      if (existingIndex !== -1) {
        state.responseBuffer.splice(existingIndex, 1);
      }

      // Remove from streaming previews tracking
      streamingPreviews.delete(agentId);

      // Redraw content area and ensure input focus
      drawContentArea();
      ensureInputFocus();
    }
  }

  // Cleanup and exit
  function cleanup(): void {
    state.isActive = false;
    state.inputFieldActive = false;
    term.clear();
    term.fullscreen(false);
    term.hideCursor(false);

    if (onQuit) {
      onQuit();
    }
  }

  // Set UI mode (simplified)
  function setMode(mode: UIMode): void {
    state.mode = mode;
    drawHeader();
  }

  function getCurrentMode(): UIMode {
    return state.mode;
  }

  function updateAgents(agents: Array<{ name: string; model: string; provider: string; status: string }>): void {
    state.agents = agents;
  }

  function setCurrentWorld(world: string): void {
    state.currentWorld = world;
    drawHeader();
  }

  // Enhanced input handling with terminal-kit inputField
  function startInputMode(): void {
    state.inputFieldActive = true;
    createInputField();
  }

  function createInputField(): void {
    if (!state.inputFieldActive) return;

    const inputY = Math.min(term.height - 2, 4 + state.contentAreaHeight + 1); // Position on the prompt line

    const inputOptions = {
      y: inputY,
      x: 5, // Position right after "> " (prompt is at x=3 and takes 2 characters)
      width: term.width - 7, // Account for borders and prompt
      height: 1,
      cancelable: true,
      history: state.inputHistory,
      autoComplete: ['/help', '/clear', '/quit', '/agents', '/add', '/use', '/stop'],
      autoCompleteHint: true
    };

    term.inputField(inputOptions, (error: any, input: string | undefined) => {
      if (error) {
        if (error.code === 'ESCAPE') {
          cleanup();
          return;
        }
        displayError(`Input error: ${error.message}`);
        // Restart input field
        if (state.inputFieldActive) {
          setTimeout(() => {
            drawInputArea();
            createInputField();
            ensureInputFocus();
          }, 100);
        }
        return;
      }

      if (input && input.trim()) {
        // Clear the entire input area to prevent mixing
        const inputStartY = 4 + state.contentAreaHeight;
        const inputEndY = inputStartY + state.inputAreaHeight - 1;

        // Clear all input area lines
        for (let y = inputStartY; y <= inputEndY; y++) {
          term.moveTo(1, y);
          term.eraseLineAfter();
        }

        // Process the command
        processCommand(input.trim()).then(() => {
          // Redraw the input area and restart input field
          if (state.inputFieldActive) {
            drawInputArea();
            setTimeout(() => {
              createInputField();
              ensureInputFocus();
            }, 50);
          }
        }).catch(error => {
          displayError(`Command processing error: ${error.message}`);
          if (state.inputFieldActive) {
            drawInputArea();
            setTimeout(() => {
              createInputField();
              ensureInputFocus();
            }, 100);
          }
        });
      } else {
        // Restart input field for next input
        if (state.inputFieldActive) {
          drawInputArea();
          setTimeout(() => {
            createInputField();
            ensureInputFocus();
          }, 50);
        }
      }
    });
  }

  async function processCommand(command: string): Promise<void> {
    if (command.trim() === '') return;

    // Add to history
    state.inputHistory.unshift(command);
    if (state.inputHistory.length > 50) {
      state.inputHistory.pop();
    }
    state.historyIndex = -1;

    // Parse and handle command
    const parts = command.trim().split(' ');
    const cmd = parts[0].toLowerCase();
    const args = parts.slice(1);

    switch (cmd) {
      case '/help':
        displayHelp();
        break;
      case '/clear':
        state.responseBuffer = [];
        state.scrollOffset = 0;
        drawContentArea();
        ensureInputFocus();
        break;
      case '/quit':
      case '/exit':
        cleanup();
        break;
      default:
        if (cmd.startsWith('/')) {
          // Remove the '/' prefix for external command handlers
          const cleanCmd = cmd.substring(1);
          if (onCommand) {
            onCommand(cleanCmd, args);
          }
        } else {
          // Regular input, not a command
          if (onInput) {
            onInput(command);
          }
        }
        break;
    }
  }

  function displayHelp(): void {
    displaySystem('Available Commands:');
    displaySystem('/help - Show this help message');
    displaySystem('/clear - Clear the message buffer');
    displaySystem('/quit - Exit the application');
    displaySystem('/agents - List all available agents');
    displaySystem('/add - Add a new agent (coming soon)');
    displaySystem('/use <agent> - Activate an agent');
    displaySystem('/stop <agent> - Stop an agent');
    displaySystem('ESC - Exit the application');
  }

  // Setup terminal on creation
  setupTerminal();

  // Return simplified interface
  return {
    initialize,
    displayMessage,
    displayError,
    displaySystem,
    displayUserInput,
    updateStreamingPreview,
    clearStreamingPreview,
    cleanup,
    setMode,
    getCurrentMode,
    startInputMode,
    processCommand,
    updateAgents,
    setCurrentWorld
  };
}

// Check if terminal supports required features
function isTerminalCompatible(): boolean {
  try {
    // Basic capability checks
    return process.stdout.isTTY &&
      term.width >= 80 &&
      term.height >= 24;
  } catch (error) {
    return false;
  }
}

// Export the UI factory function and compatibility checker
export {
  createTerminalKitUI,
  isTerminalCompatible,
  type TerminalKitUIInterface,
  type TerminalKitUIHandlers
};
