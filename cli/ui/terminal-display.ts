/**
 * Terminal Display Module - Input Box UI and Terminal Positioning
 * 
 * Core Features:
 * - Terminal input box drawing with bordered styling
 * - Position tracking and management for input box placement
 * - Input box visibility state management
 * - Terminal cursor positioning and display utilities
 * - Integrated with terminal-kit for enhanced UI experience
 * 
 * Implementation:
 * - Function-based approach with state management
 * - Terminal-kit integration for cross-platform compatibility
 * - Dynamic positioning based on terminal content flow
 * - Clean show/hide cycle for interactive input
 * 
 * Architecture:
 * - Stateful position tracking (inputBoxY, isInputBoxVisible)
 * - Coordinate management for precise terminal positioning
 * - Border drawing with unicode box characters
 * - Input field positioning with prompt integration
 */

// Terminal UI state management
interface TerminalDisplayState {
  inputBoxY: number;
  isInputBoxVisible: boolean;
  term: any; // Terminal-kit instance
}

// Module state
let state: TerminalDisplayState = {
  inputBoxY: 0,
  isInputBoxVisible: false,
  term: null
};

/**
 * Initialize terminal display with terminal-kit instance
 */
export function initializeTerminalDisplay(terminalInstance: any): void {
  state.term = terminalInstance;
  state.inputBoxY = 0;
  state.isInputBoxVisible = false;
}

/**
 * Hide the input box and clear its display area
 * Moves to input box position and clears from cursor to end of screen
 */
export function hideInputBox(): void {
  if (!state.term) return;

  if (state.isInputBoxVisible && state.inputBoxY > 0) {
    // Move to the input box position and clear it
    state.term.moveTo(1, state.inputBoxY);
    state.term.eraseDisplayBelow(); // Clear from cursor to end of screen
    state.isInputBoxVisible = false;
    // Keep inputBoxY for potential redraw - don't reset to 0
  }
}

/**
 * Save current terminal position for input box placement
 * Adds spacing and calculates optimal input box position
 */
export function saveCurrentPosition(): void {
  if (!state.term) return;

  // Add some spacing after current content
  console.log();
  console.log();
  console.log();
  state.inputBoxY = state.term.height - 4;
}

/**
 * Display input prompt with bordered box styling
 * Draws a bordered input area with user input and positions cursor
 * 
 * @param prompt - The prompt text to display (default: '> ')
 * @param userInput - Current user input text to display
 * @returns Object with cursor position coordinates
 */
export function showInputPrompt(prompt: string = '> ', userInput: string = ''): { x: number; y: number } {
  if (!state.term) {
    return { x: 0, y: 0 };
  }

  const width = state.term.width;
  const innerWidth = width - 4; // 2 for borders + 2 for padding

  // Calculate remaining width after prompt and user input
  const contentLength = prompt.length + userInput.length;
  const remainingWidth = Math.max(0, innerWidth - contentLength);

  // Save current position for input box placement
  saveCurrentPosition();

  // Move to the input box position and draw/redraw the box
  state.term.moveTo(1, state.inputBoxY);
  state.term.cyan('┌' + '─'.repeat(width - 2) + '┐\n');
  state.term.cyan('│ ' + prompt + userInput + ' '.repeat(remainingWidth) + ' │\n');
  state.term.cyan('└' + '─'.repeat(width - 2) + '┘\n');

  // Move cursor back up to the middle line, positioned after the prompt and user input
  state.term.up(2);
  state.term.right(2 + contentLength); // Position after the left border, space, prompt, and user input

  state.isInputBoxVisible = true;
  return { x: 2 + contentLength, y: state.inputBoxY + 1 };
}

/**
 * Get current input box visibility state
 */
export function isInputBoxVisible(): boolean {
  return state.isInputBoxVisible;
}

/**
 * Get current input box Y position
 */
export function getInputBoxY(): number {
  return state.inputBoxY;
}

/**
 * Reset input box position (force recalculation on next draw)
 */
export function resetInputBoxPosition(): void {
  state.inputBoxY = 0;
}

/**
 * Get terminal display state (for debugging/testing)
 */
export function getTerminalDisplayState(): Readonly<TerminalDisplayState> {
  return { ...state };
}
