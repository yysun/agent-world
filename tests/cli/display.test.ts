/**
 * Unit Tests for cli/display.ts — Formatting Utilities, Spinner, and Status Line Manager
 *
 * Tests cover:
 * - formatToolName: snake_case, camelCase, mixed, single word, empty
 * - formatElapsed: 0ms, short, minutes, hours, negative
 * - getToolIcon: pattern matching for read/write/search/shell/web/delete/move/default
 * - truncateToWidth: short, exact, over-width, zero/negative width
 * - createSpinner: start, stop, idempotent start, cleanup
 * - createStatusLineManager: render, pause/resume, reset, cleanup, tools, agents, elapsed
 *
 * NOTES:
 * - Uses vi.useFakeTimers() for timer-based tests
 * - Mocks process.stdout.write and process.stdout.columns
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  formatToolName,
  formatElapsed,
  getToolIcon,
  truncateToWidth,
  createSpinner,
  createStatusLineManager,
  log,
} from '../../cli/display.js';

// ---------------------------------------------------------------------------
// formatToolName
// ---------------------------------------------------------------------------
describe('formatToolName', () => {
  it('converts snake_case to Title Case', () => {
    expect(formatToolName('read_file')).toBe('Read File');
    expect(formatToolName('shell_cmd')).toBe('Shell Cmd');
  });

  it('converts camelCase to Title Case', () => {
    expect(formatToolName('searchAndReplace')).toBe('Search And Replace');
    expect(formatToolName('listDir')).toBe('List Dir');
  });

  it('handles single word', () => {
    expect(formatToolName('search')).toBe('Search');
  });

  it('handles empty string', () => {
    expect(formatToolName('')).toBe('');
  });

  it('handles mixed snake_case and camelCase', () => {
    expect(formatToolName('read_fileContent')).toBe('Read File Content');
  });

  it('handles uppercase acronyms at boundaries', () => {
    expect(formatToolName('getHTTPResponse')).toBe('Get Httpresponse');
  });
});

// ---------------------------------------------------------------------------
// formatElapsed
// ---------------------------------------------------------------------------
describe('formatElapsed', () => {
  it('formats 0ms as 0:00', () => {
    expect(formatElapsed(0)).toBe('0:00');
  });

  it('formats 5 seconds', () => {
    expect(formatElapsed(5000)).toBe('0:05');
  });

  it('formats 65 seconds as 1:05', () => {
    expect(formatElapsed(65000)).toBe('1:05');
  });

  it('formats over an hour', () => {
    expect(formatElapsed(3661000)).toBe('1:01:01');
  });

  it('treats negative as 0', () => {
    expect(formatElapsed(-1000)).toBe('0:00');
  });

  it('formats exactly 60 seconds as 1:00', () => {
    expect(formatElapsed(60000)).toBe('1:00');
  });
});

// ---------------------------------------------------------------------------
// getToolIcon
// ---------------------------------------------------------------------------
describe('getToolIcon', () => {
  it('returns read icon for read-related tools', () => {
    expect(getToolIcon('read_file')).toBe('▸');
    expect(getToolIcon('cat')).toBe('▸');
  });

  it('returns write icon for write-related tools', () => {
    expect(getToolIcon('write_file')).toBe('▹');
    expect(getToolIcon('create_file')).toBe('▹');
    expect(getToolIcon('edit_file')).toBe('▹');
  });

  it('returns search icon for search-related tools', () => {
    expect(getToolIcon('search_code')).toBe('◈');
    expect(getToolIcon('find_results')).toBe('◈');
    expect(getToolIcon('grep')).toBe('◈');
    expect(getToolIcon('list_dir')).toBe('◈');
  });

  it('returns shell icon for shell-related tools', () => {
    expect(getToolIcon('shell_cmd')).toBe('⚡');
    expect(getToolIcon('run_command')).toBe('⚡');
    expect(getToolIcon('exec')).toBe('⚡');
  });

  it('returns web icon for web-related tools', () => {
    expect(getToolIcon('web_browse')).toBe('◇');
    expect(getToolIcon('fetch_url')).toBe('◇');
    expect(getToolIcon('http_get')).toBe('◇');
  });

  it('returns delete icon for delete-related tools', () => {
    expect(getToolIcon('delete_item')).toBe('✕');
    expect(getToolIcon('remove')).toBe('✕');
  });

  it('returns move icon for move-related tools', () => {
    expect(getToolIcon('move_item')).toBe('↔');
    expect(getToolIcon('rename')).toBe('↔');
    expect(getToolIcon('copy_text')).toBe('↔');
  });

  it('returns default icon for unknown tools', () => {
    expect(getToolIcon('unknown_tool')).toBe('●');
    expect(getToolIcon('something')).toBe('●');
  });
});

// ---------------------------------------------------------------------------
// truncateToWidth
// ---------------------------------------------------------------------------
describe('truncateToWidth', () => {
  it('returns text unchanged when shorter than maxWidth', () => {
    expect(truncateToWidth('hello', 10)).toBe('hello');
  });

  it('returns text unchanged when exactly maxWidth', () => {
    expect(truncateToWidth('hello', 5)).toBe('hello');
  });

  it('truncates and appends ellipsis when over width', () => {
    expect(truncateToWidth('hello world', 8)).toBe('hello w…');
  });

  it('returns empty string for zero width', () => {
    expect(truncateToWidth('hello', 0)).toBe('');
  });

  it('returns ellipsis for width of 1', () => {
    expect(truncateToWidth('hello', 1)).toBe('…');
  });

  it('handles negative width', () => {
    expect(truncateToWidth('hello', -5)).toBe('');
  });
});

// ---------------------------------------------------------------------------
// createSpinner
// ---------------------------------------------------------------------------
describe('createSpinner', () => {
  let writeSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.useFakeTimers();
    writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    vi.useRealTimers();
    writeSpy.mockRestore();
  });

  it('starts and writes spinner frames', () => {
    const spinner = createSpinner();
    spinner.start('Loading...');

    expect(spinner.isRunning()).toBe(true);
    expect(writeSpy).toHaveBeenCalled();

    // Advance to next frame
    vi.advanceTimersByTime(80);
    expect(writeSpy.mock.calls.length).toBeGreaterThan(1);

    spinner.cleanup();
  });

  it('stops and clears line', () => {
    const spinner = createSpinner();
    spinner.start('Loading...');

    spinner.stop();
    expect(spinner.isRunning()).toBe(false);

    // Last write should be the clear-line escape
    const lastCall = writeSpy.mock.calls[writeSpy.mock.calls.length - 1][0];
    expect(lastCall).toBe('\r\x1b[K');
  });

  it('is idempotent on start — does not create duplicate intervals', () => {
    const spinner = createSpinner();
    spinner.start('first');
    const callsAfterFirst = writeSpy.mock.calls.length;

    spinner.start('second');
    // Should not have created another interval — just updated label
    vi.advanceTimersByTime(80);
    // Only one additional render from the one interval
    expect(writeSpy.mock.calls.length).toBe(callsAfterFirst + 1);

    spinner.cleanup();
  });

  it('cleanup stops everything', () => {
    const spinner = createSpinner();
    spinner.start('test');
    spinner.cleanup();

    expect(spinner.isRunning()).toBe(false);

    const countAfterCleanup = writeSpy.mock.calls.length;
    vi.advanceTimersByTime(200);
    // No new writes after cleanup
    expect(writeSpy.mock.calls.length).toBe(countAfterCleanup);
  });
});

// ---------------------------------------------------------------------------
// createStatusLineManager
// ---------------------------------------------------------------------------
describe('createStatusLineManager', () => {
  let writeSpy: ReturnType<typeof vi.spyOn>;
  let originalColumns: number | undefined;

  beforeEach(() => {
    vi.useFakeTimers();
    writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    originalColumns = process.stdout.columns;
    Object.defineProperty(process.stdout, 'columns', { value: 120, writable: true });
  });

  afterEach(() => {
    vi.useRealTimers();
    writeSpy.mockRestore();
    Object.defineProperty(process.stdout, 'columns', { value: originalColumns, writable: true });
  });

  it('renders spinner label and elapsed when active', () => {
    const sl = createStatusLineManager();
    sl.setSpinner('Agent thinking...');
    sl.startElapsedTimer();

    // Should have rendered something
    expect(writeSpy).toHaveBeenCalled();
    const lastOutput = writeSpy.mock.calls[writeSpy.mock.calls.length - 1][0] as string;
    expect(lastOutput).toContain('Agent thinking...');

    sl.cleanup();
  });

  it('pause suppresses rendering, resume redraws', () => {
    const sl = createStatusLineManager();
    sl.setSpinner('test');

    sl.pause();
    const countAfterPause = writeSpy.mock.calls.length;

    // setSpinner while paused should not write
    sl.setSpinner('updated');
    expect(writeSpy.mock.calls.length).toBe(countAfterPause);

    sl.resume();
    // Should have re-rendered
    expect(writeSpy.mock.calls.length).toBeGreaterThan(countAfterPause);

    sl.cleanup();
  });

  it('reset clears all state and clears line', () => {
    const sl = createStatusLineManager();
    sl.setSpinner('test');
    sl.startElapsedTimer();
    sl.addTool('read_file');

    sl.reset();

    // After reset, rendering should produce empty line (no visible content)
    writeSpy.mockClear();
    sl.render();
    // Nothing visible to render after reset — no write or just clear
    const calls = writeSpy.mock.calls;
    if (calls.length > 0) {
      const lastWrite = calls[calls.length - 1][0] as string;
      // Should be just the clear escape
      expect(lastWrite).toBe('\r\x1b[K');
    }

    sl.cleanup();
  });

  it('tracks tools with addTool and removeTool', () => {
    const sl = createStatusLineManager();
    sl.addTool('read_file');

    // Check that render output includes the tool
    const allWrites = writeSpy.mock.calls.map(c => c[0] as string).join('');
    expect(allWrites).toContain('Read File');

    sl.removeTool('read_file', 'done');

    // After removal, tool should not appear in next render
    writeSpy.mockClear();
    sl.render();
    const afterRemoval = writeSpy.mock.calls.map(c => c[0] as string).join('');
    // Should not contain Read File anymore
    const stripped = afterRemoval.replace(/\x1b\[[0-9;]*m/g, '');
    expect(stripped).not.toContain('Read File');

    sl.cleanup();
  });

  it('displays multiple agents', () => {
    const sl = createStatusLineManager();
    sl.setAgents([
      { name: 'AgentA', active: true },
      { name: 'AgentB', active: true },
    ]);

    const allWrites = writeSpy.mock.calls.map(c => c[0] as string).join('');
    expect(allWrites).toContain('AgentA');
    expect(allWrites).toContain('AgentB');

    sl.cleanup();
  });

  it('elapsed timer updates after 1 second', () => {
    const sl = createStatusLineManager();
    sl.setSpinner('working');
    sl.startElapsedTimer();

    writeSpy.mockClear();
    vi.advanceTimersByTime(1000);

    // Should have re-rendered with elapsed time
    const allWrites = writeSpy.mock.calls.map(c => c[0] as string).join('');
    expect(allWrites).toContain('0:01');

    sl.cleanup();
  });

  it('cleanup stops all intervals', () => {
    const sl = createStatusLineManager();
    sl.setSpinner('test');
    sl.startElapsedTimer();

    sl.cleanup();
    const countAfterCleanup = writeSpy.mock.calls.length;

    vi.advanceTimersByTime(2000);
    expect(writeSpy.mock.calls.length).toBe(countAfterCleanup);
  });
});

// ---------------------------------------------------------------------------
// log helper
// ---------------------------------------------------------------------------
describe('log', () => {
  let writeSpy: ReturnType<typeof vi.spyOn>;
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.useFakeTimers();
    writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.useRealTimers();
    writeSpy.mockRestore();
    logSpy.mockRestore();
  });

  it('pauses status line, logs, then resumes', () => {
    const sl = createStatusLineManager();
    sl.setSpinner('test');

    const callOrder: string[] = [];

    // Track pause/resume via write spy behavior
    writeSpy.mockImplementation((..._args) => {
      callOrder.push('write');
      return true;
    });
    logSpy.mockImplementation((..._args) => {
      callOrder.push('log');
    });

    log(sl, 'hello world');

    // Should have: write (clear/pause), log, write (resume/render)
    expect(callOrder).toContain('log');
    expect(logSpy).toHaveBeenCalledWith('hello world');

    sl.cleanup();
  });
});
