import readline from 'readline';

const MAX_HISTORY = 1000;
let commandHistory: string[] = [];
let historyIndex = -1;

export function readInput(prompt: string): Promise<string> {
  return new Promise((resolve) => {
    const stdin = process.stdin;
    const stdout = process.stdout;

    if (!stdin.isTTY) {
      stdout.write(prompt);

      const rl = readline.createInterface({
        input: stdin,
        output: stdout,
        terminal: false
      });

      rl.on('line', (line) => {
        resolve(line);
      });

      rl.on('close', () => {
        resolve('');
      });

      return;
    }

    // Configure stdin for interactive mode
    stdin.setRawMode(true);
    stdin.setEncoding('utf8');
    stdin.resume();
    readline.emitKeypressEvents(stdin);

    let input = '';
    let cursorPos = 0;
    let tempInput = '';
    let startRow = stdout.rows - 1; // Track starting row for multi-line input

    stdout.write(prompt);

    function setInput(newInput: string, newCursorPos?: number) {
      input = newInput;
      cursorPos = newCursorPos ?? input.length;
      redrawLine();
    }

    function navigateHistory(direction: 'up' | 'down') {
      if (commandHistory.length === 0) return;

      if (historyIndex === -1) {
        tempInput = input;
      }

      if (direction === 'up') {
        historyIndex = historyIndex < commandHistory.length - 1 ? historyIndex + 1 : historyIndex;
      } else {
        historyIndex = historyIndex > -1 ? historyIndex - 1 : -1;
      }

      setInput(historyIndex === -1 ? tempInput : commandHistory[historyIndex]);
    }

    function handleKeypress(_str: string, key: readline.Key) {
      if (key.ctrl && key.name === 'c') {
        stdout.write('\n');
        process.exit();
      } else if (key.name === 'return') {
        if (key.shift) {
          // Insert a newline character at cursor position
          input = input.slice(0, cursorPos) + '\n' + input.slice(cursorPos);
          cursorPos++;
          // Update starting row for multi-line input
          startRow = Math.max(0, stdout.rows - input.split('\n').length);
          redrawLine();
        } else {
          stdout.write('\n');
          cleanup();
          if (input.trim()) {
            commandHistory.unshift(input);
            if (commandHistory.length > MAX_HISTORY) {
              commandHistory.pop();
            }
          }
          historyIndex = -1;
          resolve(input);
        }
      } else if (key.name === 'backspace') {
        if (cursorPos > 0) {
          input = input.slice(0, cursorPos - 1) + input.slice(cursorPos);
          cursorPos--;
          redrawLine();
        }
      } else if (key.name === 'left') {
        if (cursorPos > 0) {
          cursorPos--;
          updateCursorPosition();
        }
      } else if (key.name === 'right') {
        if (cursorPos < input.length) {
          cursorPos++;
          updateCursorPosition();
        }
      } else if (key.name === 'up') {
        // Check if we're in multi-line mode
        const lines = input.split('\n');
        const currentLineStart = input.slice(0, cursorPos).lastIndexOf('\n') + 1;
        const currentLine = currentLineStart === -1 ? 0 : 
          lines.findIndex((_, i) => 
            input.slice(0, currentLineStart).split('\n').length - 1 === i
          );

        if (currentLine > 0) {
          // Move cursor up one line
          const prevLineLength = lines[currentLine - 1].length;
          const currentColPosition = cursorPos - currentLineStart;
          const newPos = input.slice(0, currentLineStart).lastIndexOf('\n') + 1 + 
            Math.min(currentColPosition, prevLineLength);
          cursorPos = newPos;
          updateCursorPosition();
        } else {
          navigateHistory('up');
        }
      } else if (key.name === 'down') {
        const lines = input.split('\n');
        const currentLineStart = input.slice(0, cursorPos).lastIndexOf('\n') + 1;
        const currentLine = currentLineStart === -1 ? 0 : 
          lines.findIndex((_, i) => 
            input.slice(0, currentLineStart).split('\n').length - 1 === i
          );

        if (currentLine < lines.length - 1) {
          // Move cursor down one line
          const nextLineStart = input.indexOf('\n', currentLineStart) + 1;
          const nextLineLength = lines[currentLine + 1].length;
          const currentColPosition = cursorPos - currentLineStart;
          const newPos = nextLineStart + Math.min(currentColPosition, nextLineLength);
          cursorPos = newPos;
          updateCursorPosition();
        } else {
          navigateHistory('down');
        }
      } else if (key.name === 'home') {
        // Move to start of current line
        const currentLineStart = input.slice(0, cursorPos).lastIndexOf('\n') + 1;
        cursorPos = currentLineStart;
        updateCursorPosition();
      } else if (key.name === 'end') {
        // Move to end of current line
        const nextNewline = input.indexOf('\n', cursorPos);
        cursorPos = nextNewline === -1 ? input.length : nextNewline;
        updateCursorPosition();
      } else if (!key.ctrl && key.sequence) {
        input = input.slice(0, cursorPos) + key.sequence + input.slice(cursorPos);
        cursorPos += key.sequence.length;
        redrawLine();
      }
    }

    function calculateCursorPosition() {
      const lines = input.slice(0, cursorPos).split('\n');
      const currentLine = lines.length - 1;
      const currentColumn = lines[currentLine].length + (currentLine === 0 ? prompt.length : 0);
      return { row: startRow + currentLine, column: currentColumn };
    }

    function updateCursorPosition() {
      const { row, column } = calculateCursorPosition();
      stdout.cursorTo(column, row);
    }

    function redrawLine() {
      // Clear from cursor to end of screen
      stdout.write('\x1b[J');

      // Split input into lines
      const lines = input.split('\n');
      const totalLines = lines.length;

      // Update starting row to ensure all lines fit
      startRow = Math.max(0, stdout.rows - totalLines);

      // Draw all lines
      stdout.cursorTo(0, startRow);
      lines.forEach((line, i) => {
        stdout.cursorTo(0);
        if (i === 0) {
          stdout.write(prompt + line);
        } else {
          stdout.write(line);
        }
        if (i < lines.length - 1) stdout.write('\n');
      });

      // Update cursor position
      updateCursorPosition();
    }

    function cleanup() {
      if (stdin.isTTY) {
        stdin.setRawMode(false);
      }
      stdin.removeListener('keypress', handleKeypress);
      stdin.pause();
    }

    stdin.on('error', (err) => {
      console.error('stdin error:', err);
      cleanup();
      resolve(input);
    });

    stdin.on('keypress', handleKeypress);
  });
}

export function clearCommandHistory(): void {
  commandHistory = [];
  historyIndex = -1;
}
