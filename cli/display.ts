/**
 * CLI Display Module — Formatting Utilities, Spinner, and Status Line Manager
 *
 * Provides terminal display primitives for the CLI interactive mode, inspired
 * by the Electron desktop app UX patterns. All display logic is centralized
 * here so that `index.ts` handles event routing and `stream.ts` handles
 * streaming data management.
 *
 * FEATURES:
 * - Pure formatting functions: tool names, elapsed time, tool icons, truncation
 * - Braille spinner with configurable label
 * - Unified status line manager combining spinner, elapsed timer, agent queue,
 *   and active tools on a single rewritable terminal line
 * - Readline coordination via pause/resume to avoid prompt corruption
 *
 * NOTES:
 * - Leaf module with no internal project imports (only Node built-ins)
 * - All side-effectful output uses process.stdout.write (no console.log)
 * - Unicode symbols chosen for consistent terminal width (no emoji)
 *
 * CHANGES:
 * - 2026-02-11: Initial creation — Phase 1-3 of CLI UX improvement plan
 */

// ---------------------------------------------------------------------------
// Color helpers (duplicated here to keep display.ts a leaf module)
// ---------------------------------------------------------------------------
const gray = (text: string) => `\x1b[90m${text}\x1b[0m`;
const cyan = (text: string) => `\x1b[36m${text}\x1b[0m`;
const yellow = (text: string) => `\x1b[33m${text}\x1b[0m`;
const green = (text: string) => `\x1b[32m${text}\x1b[0m`;
const red = (text: string) => `\x1b[31m${text}\x1b[0m`;
const bold = (text: string) => `\x1b[1m${text}\x1b[0m`;
const boldGreen = (text: string) => `\x1b[1m\x1b[32m${text}\x1b[0m`;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Entry describing an active or completed tool in the status line. */
export interface ToolDisplayEntry {
  name: string;
  status: 'running' | 'done' | 'error';
  detail?: string;
}

/** Entry describing an agent in the status line. */
export interface AgentDisplayEntry {
  name: string;
  active: boolean;
}

/** Full snapshot of what the status line should render. */
export interface StatusLineState {
  spinner: { label: string; active: boolean };
  elapsedMs: number;
  agents: AgentDisplayEntry[];
  tools: ToolDisplayEntry[];
}

// ---------------------------------------------------------------------------
// Phase 1 — Pure Formatting Functions
// ---------------------------------------------------------------------------

/**
 * Convert a tool name from snake_case / camelCase to Title Case for display.
 *
 * Examples:
 *   read_file       → Read File
 *   shell_cmd       → Shell Cmd
 *   searchAndReplace → Search And Replace
 *   listDir         → List Dir
 */
export function formatToolName(toolName: string): string {
  if (!toolName) return '';

  // Split on underscores and camelCase boundaries
  const words = toolName
    .replace(/_/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .split(/\s+/)
    .filter(Boolean);

  return words
    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

/**
 * Format elapsed milliseconds as a human-readable duration string.
 *
 * Examples:
 *   0      → 0:00
 *   5000   → 0:05
 *   65000  → 1:05
 *   3661000 → 1:01:01
 */
export function formatElapsed(ms: number): string {
  if (ms < 0) ms = 0;

  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const pad = (n: number) => n.toString().padStart(2, '0');

  if (hours > 0) {
    return `${hours}:${pad(minutes)}:${pad(seconds)}`;
  }
  return `${minutes}:${pad(seconds)}`;
}

/**
 * Return a Unicode icon for a tool based on its name pattern.
 *
 * Uses fixed-width Unicode symbols (not emoji) for consistent terminal rendering.
 */
export function getToolIcon(toolName: string): string {
  const lower = toolName.toLowerCase();

  // More specific patterns first to avoid false matches
  if (lower.includes('write') || lower.includes('create') || lower.includes('edit') || lower.includes('save')) return '▹';
  if (lower.includes('delete') || lower.includes('remove')) return '✕';
  if (lower.includes('move') || lower.includes('rename') || lower.includes('copy')) return '↔';
  if (lower.includes('shell') || lower.includes('exec') || lower.includes('run') || lower.includes('cmd')) return '⚡';
  if (lower.includes('search') || lower.includes('find') || lower.includes('grep') || lower.includes('list')) return '◈';
  if (lower.includes('web') || lower.includes('fetch') || lower.includes('http') || lower.includes('url')) return '◇';
  if (lower.includes('read') || lower.includes('file') || lower.includes('cat')) return '▸';

  return '●';
}

/**
 * Truncate a string to fit within `maxWidth` columns, appending "…" if trimmed.
 *
 * Uses simple character count (not full Unicode width detection) which is
 * correct for the fixed-width symbols we use in the status line.
 */
export function truncateToWidth(text: string, maxWidth: number): string {
  if (maxWidth <= 0) return '';
  if (text.length <= maxWidth) return text;
  if (maxWidth <= 1) return '…';
  return text.slice(0, maxWidth - 1) + '…';
}

// ---------------------------------------------------------------------------
// Phase 2 — Spinner Factory
// ---------------------------------------------------------------------------

const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'] as const;
const SPINNER_INTERVAL_MS = 80;

export interface Spinner {
  start: (label: string) => void;
  stop: () => void;
  isRunning: () => boolean;
  cleanup: () => void;
}

/**
 * Create a braille-character spinner that writes to a single rewritable line.
 *
 * The spinner renders frame + label via `process.stdout.write('\r\x1b[K…')`
 * at 80 ms intervals. Calling `stop()` clears the line. `cleanup()` is an
 * alias for `stop()` that also nullifies internal references.
 */
export function createSpinner(): Spinner {
  let frameIndex = 0;
  let intervalId: ReturnType<typeof setInterval> | null = null;
  let currentLabel = '';

  function render(): void {
    const frame = SPINNER_FRAMES[frameIndex % SPINNER_FRAMES.length];
    frameIndex++;
    const line = `${cyan(frame)} ${currentLabel}`;
    process.stdout.write(`\r\x1b[K${line}`);
  }

  function start(label: string): void {
    // Idempotent: if already running just update label
    currentLabel = label;
    if (intervalId !== null) return;
    frameIndex = 0;
    render();
    intervalId = setInterval(render, SPINNER_INTERVAL_MS);
  }

  function stop(): void {
    if (intervalId !== null) {
      clearInterval(intervalId);
      intervalId = null;
    }
    // Clear the spinner line
    process.stdout.write('\r\x1b[K');
    currentLabel = '';
  }

  function isRunning(): boolean {
    return intervalId !== null;
  }

  function cleanup(): void {
    stop();
  }

  return { start, stop, isRunning, cleanup };
}

// ---------------------------------------------------------------------------
// Phase 3 — Status Line Manager
// ---------------------------------------------------------------------------

export interface StatusLineManager {
  // State setters
  setSpinner: (label: string | null) => void;
  setElapsed: (ms: number) => void;
  setAgents: (agents: AgentDisplayEntry[]) => void;
  addTool: (name: string) => void;
  removeTool: (name: string, status: 'done' | 'error', detail?: string) => void;

  // Rendering
  render: () => void;
  clear: () => void;
  pause: () => void;
  resume: () => void;

  // Lifecycle
  startElapsedTimer: () => void;
  stopElapsedTimer: () => void;
  reset: () => void;
  cleanup: () => void;
}

/**
 * Create a unified status line manager that composes spinner, elapsed time,
 * agent queue, and active tools into a single rewritable terminal line.
 *
 * Status line format example:
 *   ⠋ AgentA is thinking... [0:12] | ▸ Read File ⟳
 *
 * Supports pause/resume for readline prompt coordination: pause clears the
 * status line so `console.log()` or `rl.prompt()` output is clean, resume
 * redraws it.
 */
export function createStatusLineManager(): StatusLineManager {
  // Internal state
  let spinnerLabel: string | null = null;
  let spinnerFrameIndex = 0;
  let spinnerIntervalId: ReturnType<typeof setInterval> | null = null;
  let elapsedMs = 0;
  let elapsedStartTime: number | null = null;
  let elapsedIntervalId: ReturnType<typeof setInterval> | null = null;
  let agents: AgentDisplayEntry[] = [];
  let tools: ToolDisplayEntry[] = [];
  let paused = false;
  let lineVisible = false;

  // ---- Rendering ----

  function composeLine(): string {
    const parts: string[] = [];

    // Spinner + label
    if (spinnerLabel) {
      const frame = SPINNER_FRAMES[spinnerFrameIndex % SPINNER_FRAMES.length];
      parts.push(`${cyan(frame)} ${spinnerLabel}`);
    }

    // Elapsed timer
    if (elapsedStartTime !== null) {
      const now = Date.now();
      const currentElapsed = now - elapsedStartTime;
      parts.push(gray(`[${formatElapsed(currentElapsed)}]`));
    } else if (elapsedMs > 0) {
      parts.push(gray(`[${formatElapsed(elapsedMs)}]`));
    }

    // Active agents (beyond the spinner label agent)
    const activeAgents = agents.filter(a => a.active);
    if (activeAgents.length > 1) {
      const names = activeAgents.map(a => a.name).join(', ');
      parts.push(gray(`agents: ${names}`));
    }

    // Active tools (max 3 displayed)
    const runningTools = tools.filter(t => t.status === 'running');
    const displayTools = runningTools.slice(0, 3);
    if (displayTools.length > 0) {
      const toolText = displayTools
        .map(t => `${getToolIcon(t.name)} ${formatToolName(t.name)} ⟳`)
        .join('  ');
      parts.push(toolText);
      if (runningTools.length > 3) {
        parts.push(gray(`+${runningTools.length - 3} more`));
      }
    }

    return parts.join(gray(' | '));
  }

  function render(): void {
    if (paused) return;

    const line = composeLine();
    if (!line) {
      if (lineVisible) {
        process.stdout.write('\r\x1b[K');
        lineVisible = false;
      }
      return;
    }

    // Truncate to terminal width
    const maxWidth = process.stdout.columns || 80;
    // Strip ANSI for length measurement, truncate raw if needed
    // Note: When truncated, ANSI color codes are lost (graceful degradation).
    // This is acceptable because narrow terminals are uncommon for dev CLIs.
    const stripped = line.replace(/\x1b\[[0-9;]*m/g, '');
    let output = line;
    if (stripped.length > maxWidth) {
      output = truncateToWidth(stripped, maxWidth);
    }

    process.stdout.write(`\r\x1b[K${output}`);
    lineVisible = true;
  }

  function clear(): void {
    if (lineVisible) {
      process.stdout.write('\r\x1b[K');
      lineVisible = false;
    }
  }

  function pause(): void {
    paused = true;
    clear();
  }

  function resume(): void {
    paused = false;
    render();
  }

  // ---- Spinner ----

  function tickSpinner(): void {
    spinnerFrameIndex++;
    render();
  }

  function setSpinner(label: string | null): void {
    spinnerLabel = label;

    if (label) {
      if (spinnerIntervalId === null) {
        spinnerFrameIndex = 0;
        spinnerIntervalId = setInterval(tickSpinner, SPINNER_INTERVAL_MS);
      }
    } else {
      if (spinnerIntervalId !== null) {
        clearInterval(spinnerIntervalId);
        spinnerIntervalId = null;
      }
    }

    render();
  }

  // ---- Elapsed timer ----

  function startElapsedTimer(): void {
    elapsedStartTime = Date.now();
    if (elapsedIntervalId === null) {
      elapsedIntervalId = setInterval(() => {
        if (elapsedStartTime !== null) {
          elapsedMs = Date.now() - elapsedStartTime;
        }
        render();
      }, 1000);
    }
  }

  function stopElapsedTimer(): void {
    if (elapsedIntervalId !== null) {
      clearInterval(elapsedIntervalId);
      elapsedIntervalId = null;
    }
    elapsedStartTime = null;
  }

  function setElapsed(ms: number): void {
    elapsedMs = ms;
    render();
  }

  // ---- Agents ----

  function setAgents(newAgents: AgentDisplayEntry[]): void {
    agents = newAgents;
    render();
  }

  // ---- Tools ----

  function addTool(name: string): void {
    // Avoid duplicates
    if (!tools.some(t => t.name === name && t.status === 'running')) {
      tools.push({ name, status: 'running' });
    }
    render();
  }

  function removeTool(name: string, status: 'done' | 'error', detail?: string): void {
    const idx = tools.findIndex(t => t.name === name && t.status === 'running');
    if (idx >= 0) {
      tools[idx] = { name, status, detail };
    }
    // Remove completed/errored tools after a brief moment (or immediately for cleanliness)
    tools = tools.filter(t => t.status === 'running');
    render();
  }

  // ---- Lifecycle ----

  function reset(): void {
    setSpinner(null);
    stopElapsedTimer();
    elapsedMs = 0;
    agents = [];
    tools = [];
    clear();
  }

  function cleanup(): void {
    reset();
    // Extra safety: clear any remaining intervals
    if (spinnerIntervalId !== null) {
      clearInterval(spinnerIntervalId);
      spinnerIntervalId = null;
    }
    if (elapsedIntervalId !== null) {
      clearInterval(elapsedIntervalId);
      elapsedIntervalId = null;
    }
  }

  return {
    setSpinner,
    setElapsed,
    setAgents,
    addTool,
    removeTool,
    render,
    clear,
    pause,
    resume,
    startElapsedTimer,
    stopElapsedTimer,
    reset,
    cleanup,
  };
}

// ---------------------------------------------------------------------------
// Console.log wrapper — pause/resume status line for permanent output
// ---------------------------------------------------------------------------

/**
 * Print permanent output while preserving the status line.
 *
 * Usage: `log(statusLine, 'Hello', someVar)` instead of `console.log(...)`.
 */
export function log(statusLine: StatusLineManager, ...args: unknown[]): void {
  statusLine.pause();
  console.log(...args);
  statusLine.resume();
}
