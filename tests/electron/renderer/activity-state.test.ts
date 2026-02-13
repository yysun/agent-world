/**
 * Unit Tests for Activity State Module
 *
 * Purpose:
 * - Verify tool tracking lifecycle
 * - Test elapsed timer behavior with mock intervals
 * - Validate busy state aggregation
 *
 * Key Features:
 * - In-memory testing (no file system)
 * - Mock setInterval/clearInterval for deterministic tests
 * - Callback spy verification
 *
 * Implementation Notes:
 * - Uses vitest describe/it/expect
 * - beforeEach resets mocks and state
 * - Uses fake timers for elapsed time tests
 *
 * Recent Changes:
 * - 2026-02-12: Moved into layer-based tests/electron subfolder and updated module import paths.
 * - 2026-02-10: Initial test suite
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createActivityState } from '../../../electron/renderer/src/activity-state.js';

describe('createActivityState', () => {
  let callbacks;
  let state;

  beforeEach(() => {
    vi.useFakeTimers();

    callbacks = {
      onToolStart: vi.fn(),
      onToolResult: vi.fn(),
      onToolError: vi.fn(),
      onToolProgress: vi.fn(),
      onElapsedUpdate: vi.fn(),
      onBusyChange: vi.fn()
    };

    state = createActivityState(callbacks);
  });

  afterEach(() => {
    state.cleanup();
    vi.useRealTimers();
  });

  describe('handleToolStart', () => {
    it('creates a new tool entry', () => {
      const entry = state.handleToolStart('tool-1', 'read_file', { path: '/test' });

      expect(entry.toolUseId).toBe('tool-1');
      expect(entry.toolName).toBe('read_file');
      expect(entry.toolInput).toEqual({ path: '/test' });
      expect(entry.status).toBe('running');
      expect(entry.result).toBeNull();
      expect(entry.errorMessage).toBeNull();
      expect(entry.startedAt).toBeDefined();
    });

    it('calls onToolStart callback', () => {
      state.handleToolStart('tool-1', 'read_file');

      expect(callbacks.onToolStart).toHaveBeenCalledWith(
        expect.objectContaining({
          toolUseId: 'tool-1',
          toolName: 'read_file'
        })
      );
    });

    it('sets busy state to true', () => {
      state.handleToolStart('tool-1', 'read_file');

      expect(callbacks.onBusyChange).toHaveBeenCalledWith(true);
      expect(state.getIsBusy()).toBe(true);
    });

    it('starts elapsed timer', () => {
      state.handleToolStart('tool-1', 'read_file');

      expect(callbacks.onElapsedUpdate).toHaveBeenCalledWith(0);
    });
  });

  describe('handleToolResult', () => {
    it('calls onToolResult callback', () => {
      state.handleToolStart('tool-1', 'read_file');
      state.handleToolResult('tool-1', 'file contents');

      expect(callbacks.onToolResult).toHaveBeenCalledWith('tool-1', 'file contents');
    });

    it('removes tool from active list', () => {
      state.handleToolStart('tool-1', 'read_file');
      state.handleToolResult('tool-1', 'result');

      expect(state.getActiveToolCount()).toBe(0);
      expect(state.getTool('tool-1')).toBeNull();
    });

    it('sets busy state to false when no more tools', () => {
      state.handleToolStart('tool-1', 'read_file');
      callbacks.onBusyChange.mockClear();

      state.handleToolResult('tool-1', 'result');

      expect(callbacks.onBusyChange).toHaveBeenCalledWith(false);
      expect(state.getIsBusy()).toBe(false);
    });
  });

  describe('handleToolError', () => {
    it('calls onToolError callback', () => {
      state.handleToolStart('tool-1', 'read_file');
      state.handleToolError('tool-1', 'File not found');

      expect(callbacks.onToolError).toHaveBeenCalledWith('tool-1', 'File not found');
    });

    it('removes tool from active list', () => {
      state.handleToolStart('tool-1', 'read_file');
      state.handleToolError('tool-1', 'Error');

      expect(state.getActiveToolCount()).toBe(0);
    });

    it('sets busy state to false when no more tools', () => {
      state.handleToolStart('tool-1', 'read_file');
      callbacks.onBusyChange.mockClear();

      state.handleToolError('tool-1', 'Error');

      expect(callbacks.onBusyChange).toHaveBeenCalledWith(false);
    });
  });

  describe('handleToolProgress', () => {
    it('calls onToolProgress callback', () => {
      state.handleToolStart('tool-1', 'long_operation');
      state.handleToolProgress('tool-1', '50% complete');

      expect(callbacks.onToolProgress).toHaveBeenCalledWith('tool-1', '50% complete');
    });

    it('updates tool entry progress', () => {
      state.handleToolStart('tool-1', 'long_operation');
      state.handleToolProgress('tool-1', '50%');

      const tool = state.getTool('tool-1');
      expect(tool.progress).toBe('50%');
    });
  });

  describe('elapsed timer', () => {
    it('updates elapsed time every second', () => {
      state.handleToolStart('tool-1', 'read_file');
      callbacks.onElapsedUpdate.mockClear();

      vi.advanceTimersByTime(1000);
      expect(callbacks.onElapsedUpdate).toHaveBeenCalledTimes(1);

      vi.advanceTimersByTime(1000);
      expect(callbacks.onElapsedUpdate).toHaveBeenCalledTimes(2);
    });

    it('stops timer when no activity', () => {
      state.handleToolStart('tool-1', 'read_file');
      vi.advanceTimersByTime(1000);
      callbacks.onElapsedUpdate.mockClear();

      state.handleToolResult('tool-1', 'done');
      vi.advanceTimersByTime(3000);

      expect(callbacks.onElapsedUpdate).not.toHaveBeenCalled();
    });

    it('reports correct elapsed time', () => {
      state.handleToolStart('tool-1', 'read_file');
      vi.advanceTimersByTime(2500);

      const elapsed = state.getElapsedMs();
      expect(elapsed).toBeGreaterThanOrEqual(2000);
    });
  });

  describe('setActiveStreamCount', () => {
    it('includes stream count in busy state', () => {
      state.setActiveStreamCount(1);

      expect(callbacks.onBusyChange).toHaveBeenCalledWith(true);
      expect(state.getIsBusy()).toBe(true);
    });

    it('stays busy with tools even when streams end', () => {
      state.handleToolStart('tool-1', 'read_file');
      state.setActiveStreamCount(1);
      callbacks.onBusyChange.mockClear();

      state.setActiveStreamCount(0);

      // Should not have called onBusyChange(false) since tool is still running
      expect(callbacks.onBusyChange).not.toHaveBeenCalledWith(false);
      expect(state.getIsBusy()).toBe(true);
    });

    it('becomes not busy when both streams and tools end', () => {
      state.handleToolStart('tool-1', 'read_file');
      state.setActiveStreamCount(1);
      callbacks.onBusyChange.mockClear();

      state.handleToolResult('tool-1', 'done');
      // Still busy because of streams
      expect(state.getIsBusy()).toBe(true);

      state.setActiveStreamCount(0);
      expect(callbacks.onBusyChange).toHaveBeenCalledWith(false);
      expect(state.getIsBusy()).toBe(false);
    });
  });

  describe('getActiveTools', () => {
    it('returns empty array when no tools', () => {
      expect(state.getActiveTools()).toEqual([]);
    });

    it('returns all active tool entries', () => {
      state.handleToolStart('tool-1', 'read_file');
      state.handleToolStart('tool-2', 'write_file');

      const tools = state.getActiveTools();
      expect(tools).toHaveLength(2);
      expect(tools.map(t => t.toolUseId)).toContain('tool-1');
      expect(tools.map(t => t.toolUseId)).toContain('tool-2');
    });
  });

  describe('cleanup', () => {
    it('removes all active tools', () => {
      state.handleToolStart('tool-1', 'read_file');
      state.handleToolStart('tool-2', 'write_file');
      state.cleanup();

      expect(state.getActiveToolCount()).toBe(0);
    });

    it('stops elapsed timer', () => {
      state.handleToolStart('tool-1', 'read_file');
      callbacks.onElapsedUpdate.mockClear();

      state.cleanup();
      vi.advanceTimersByTime(3000);

      expect(callbacks.onElapsedUpdate).not.toHaveBeenCalled();
    });

    it('sets busy state to false', () => {
      state.handleToolStart('tool-1', 'read_file');
      callbacks.onBusyChange.mockClear();

      state.cleanup();

      expect(callbacks.onBusyChange).toHaveBeenCalledWith(false);
    });

    it('resets stream count', () => {
      state.setActiveStreamCount(2);
      state.cleanup();

      expect(state.getIsBusy()).toBe(false);
    });
  });

  describe('concurrent tools', () => {
    it('tracks multiple tools independently', () => {
      state.handleToolStart('tool-1', 'read_file');
      state.handleToolStart('tool-2', 'write_file');

      expect(state.getActiveToolCount()).toBe(2);
      expect(state.getTool('tool-1').toolName).toBe('read_file');
      expect(state.getTool('tool-2').toolName).toBe('write_file');
    });

    it('stays busy until all tools complete', () => {
      state.handleToolStart('tool-1', 'read_file');
      state.handleToolStart('tool-2', 'write_file');
      callbacks.onBusyChange.mockClear();

      state.handleToolResult('tool-1', 'done');
      expect(state.getIsBusy()).toBe(true);
      expect(callbacks.onBusyChange).not.toHaveBeenCalled();

      state.handleToolResult('tool-2', 'done');
      expect(state.getIsBusy()).toBe(false);
      expect(callbacks.onBusyChange).toHaveBeenCalledWith(false);
    });
  });
});
