// cli-layout.js  (ESM)
import readline from 'readline';
import util     from 'util';

export function createLayout({ promptRows = 3, promptSymbol = '> ' } = {}) {
  /* ------------------------------------------------------------------ setup */
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  rl.setPrompt(promptSymbol);
  const esc  = s => `\x1b[${s}`;
  const goto = (r, c) => process.stdout.write(esc(`${r};${c}H`));   // 1-based rows
  const wipe = ()     => process.stdout.write(esc('2K'));           // clear line

  /* ------------------------------------------------------------------ state */
  let promptVisible = true;

  /* ------------------------- drawing helpers ------------------------ */
  function drawPromptBox() {
    if (!promptVisible) return;
    const { rows, columns: cols } = process.stdout;
    const top = rows - (promptRows + 2) + 1;            // +2 for borders

    // ─ top border
    goto(top, 1); wipe(); process.stdout.write('┌' + '─'.repeat(cols - 2) + '┐');

    // ─ interior rows
    for (let i = 1; i <= promptRows; i++) {
      goto(top + i, 1); wipe();
      process.stdout.write('│' + ' '.repeat(cols - 2) + '│');
    }

    // ─ bottom border
    goto(top + promptRows + 1, 1); wipe();
    process.stdout.write('└' + '─'.repeat(cols - 2) + '┘');

    // ─ put readline cursor inside box & restore current text
    goto(top + 1, 2);
    rl.prompt(true);
    rl.write(rl.line);            // redraw partially typed text (if any)
  }

  function clearPromptBoxArea() {
    const { rows } = process.stdout;
    for (let i = promptRows + 1; i >= 0; i--) {         // borders + interior
      goto(rows - i, 1); wipe();
    }
  }

  /* --------------------------- console.log -------------------------- */
  const nativeLog = console.log;
  console.log = (...args) => {
    const curInput = rl.line;
    if (promptVisible) {                                  // free the lines
      clearPromptBoxArea();
    }
    nativeLog(util.format(...args));                      // prints + '\n'
    if (promptVisible) {
      drawPromptBox();
      rl.write(curInput);
    }
  };

  /* ------------------------- prompt visibility ---------------------- */
  function hidePrompt() {
    if (!promptVisible) return;
    rl.pause();                                           // stop echoing keys
    clearPromptBoxArea();
    promptVisible = false;
  }

  function showPrompt() {
    if (promptVisible) return;
    promptVisible = true;
    rl.resume();
    drawPromptBox();
  }

  /* ----------------------------- events ----------------------------- */
  rl.on('SIGINT', () => process.exit(0));                 // Ctrl-C to quit
  process.stdout.on('resize', drawPromptBox);             // redraw on resize

  drawPromptBox();                                        // initial paint

  /* ------------------------ public surface -------------------------- */
  const lineListeners = new Set();
  rl.on('line', l => lineListeners.forEach(fn => fn(l)));

  async function runTask(fn) {
    hidePrompt();
    try { return await fn(); }
    finally { showPrompt(); }
  }

  return {
    /** listen to user's submitted line (string) */
    onLine: fn => lineListeners.add(fn),
    /** hide input box (returns `this` for chaining) */
    hidePrompt,
    /** show input box */
    showPrompt,
    /** run async fn with prompt hidden; redraw afterwards */
    runTask,
    /** pass-through logger that already respects the layout */
    log: console.log
  };
}
