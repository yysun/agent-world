/**
 * Unit Tests for Streaming State Module
 *
 * Purpose:
 * - Verify content accumulation logic
 * - Test debounce behavior with mock RAF
 * - Validate lifecycle events (start, chunk, end, error)
 *
 * Key Features:
 * - In-memory testing (no file system)
 * - Mock requestAnimationFrame for deterministic tests
 * - Callback spy verification
 *
 * Implementation Notes:
 * - Uses vitest describe/it/expect
 * - beforeEach resets mocks and state
 *
 * Recent Changes:
 * - 2026-02-10: Initial test suite
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createStreamingState } from '../../electron/renderer/src/streaming-state.js';

describe('createStreamingState', () => {
  let callbacks;
  let state;
  let rafCallback = null;

  beforeEach(() => {
    // Mock callbacks
    callbacks = {
      onStreamStart: vi.fn(),
      onStreamUpdate: vi.fn(),
      onStreamEnd: vi.fn(),
      onStreamError: vi.fn()
    };

    // Mock requestAnimationFrame
    vi.stubGlobal('requestAnimationFrame', (cb) => {
      rafCallback = cb;
      return 1;
    });
    vi.stubGlobal('cancelAnimationFrame', vi.fn());

    state = createStreamingState(callbacks);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    rafCallback = null;
  });

  describe('handleStart', () => {
    it('creates a new stream entry', () => {
      const entry = state.handleStart('msg-1', 'agent-1');

      expect(entry.messageId).toBe('msg-1');
      expect(entry.agentName).toBe('agent-1');
      expect(entry.content).toBe('');
      expect(entry.isStreaming).toBe(true);
      expect(entry.hasError).toBe(false);
      expect(entry.errorMessage).toBeNull();
      expect(entry.createdAt).toBeDefined();
    });

    it('calls onStreamStart callback', () => {
      state.handleStart('msg-1', 'agent-1');

      expect(callbacks.onStreamStart).toHaveBeenCalledTimes(1);
      expect(callbacks.onStreamStart).toHaveBeenCalledWith(
        expect.objectContaining({
          messageId: 'msg-1',
          agentName: 'agent-1'
        })
      );
    });

    it('tracks stream as active', () => {
      state.handleStart('msg-1', 'agent-1');

      expect(state.isActive('msg-1')).toBe(true);
      expect(state.getActiveCount()).toBe(1);
      expect(state.getActiveIds()).toContain('msg-1');
    });
  });

  describe('handleChunk', () => {
    it('accumulates content from chunks', () => {
      state.handleStart('msg-1', 'agent-1');
      state.handleChunk('msg-1', 'Hello');
      state.handleChunk('msg-1', ' World');

      expect(state.getContent('msg-1')).toBe('Hello World');
    });

    it('schedules debounced update', () => {
      state.handleStart('msg-1', 'agent-1');
      state.handleChunk('msg-1', 'Hello');

      expect(rafCallback).not.toBeNull();
      expect(callbacks.onStreamUpdate).not.toHaveBeenCalled();
    });

    it('fires update when RAF executes', () => {
      state.handleStart('msg-1', 'agent-1');
      state.handleChunk('msg-1', 'Hello');

      // Simulate RAF callback
      rafCallback();

      expect(callbacks.onStreamUpdate).toHaveBeenCalledWith('msg-1', 'Hello');
    });

    it('batches multiple chunks before RAF fires', () => {
      state.handleStart('msg-1', 'agent-1');
      state.handleChunk('msg-1', 'Hello');
      state.handleChunk('msg-1', ' World');
      state.handleChunk('msg-1', '!');

      // rafCallback is set (only one RAF request needed)
      expect(rafCallback).not.toBeNull();

      rafCallback();

      // Single update with full content
      expect(callbacks.onStreamUpdate).toHaveBeenCalledTimes(1);
      expect(callbacks.onStreamUpdate).toHaveBeenCalledWith('msg-1', 'Hello World!');
    });

    it('handles chunks for unknown stream by creating entry', () => {
      state.handleChunk('unknown-msg', 'Hello');

      expect(callbacks.onStreamStart).toHaveBeenCalledWith(
        expect.objectContaining({
          messageId: 'unknown-msg',
          content: 'Hello'
        })
      );
      expect(state.isActive('unknown-msg')).toBe(true);
    });
  });

  describe('handleEnd', () => {
    it('returns final content', () => {
      state.handleStart('msg-1', 'agent-1');
      state.handleChunk('msg-1', 'Hello World');
      rafCallback();

      const finalContent = state.handleEnd('msg-1');

      expect(finalContent).toBe('Hello World');
    });

    it('removes stream from active', () => {
      state.handleStart('msg-1', 'agent-1');
      state.handleEnd('msg-1');

      expect(state.isActive('msg-1')).toBe(false);
      expect(state.getActiveCount()).toBe(0);
    });

    it('calls onStreamEnd callback', () => {
      state.handleStart('msg-1', 'agent-1');
      state.handleEnd('msg-1');

      expect(callbacks.onStreamEnd).toHaveBeenCalledWith('msg-1');
    });

    it('flushes pending updates before end', () => {
      state.handleStart('msg-1', 'agent-1');
      state.handleChunk('msg-1', 'Hello');
      // Don't fire RAF, but call end

      state.handleEnd('msg-1');

      // Should have flushed the pending update
      expect(callbacks.onStreamUpdate).toHaveBeenCalledWith('msg-1', 'Hello');
      expect(callbacks.onStreamEnd).toHaveBeenCalled();
    });

    it('returns null for unknown stream', () => {
      const result = state.handleEnd('unknown-msg');
      expect(result).toBeNull();
    });
  });

  describe('handleError', () => {
    it('calls onStreamError callback', () => {
      state.handleStart('msg-1', 'agent-1');
      state.handleError('msg-1', 'Connection lost');

      expect(callbacks.onStreamError).toHaveBeenCalledWith('msg-1', 'Connection lost');
    });

    it('removes stream from active', () => {
      state.handleStart('msg-1', 'agent-1');
      state.handleError('msg-1', 'Error');

      expect(state.isActive('msg-1')).toBe(false);
    });

    it('flushes pending updates before error', () => {
      state.handleStart('msg-1', 'agent-1');
      state.handleChunk('msg-1', 'Partial content');
      state.handleError('msg-1', 'Error');

      expect(callbacks.onStreamUpdate).toHaveBeenCalledWith('msg-1', 'Partial content');
    });

    it('handles error for unknown stream', () => {
      state.handleError('unknown-msg', 'Error');

      expect(callbacks.onStreamError).toHaveBeenCalledWith('unknown-msg', 'Error');
    });
  });

  describe('flush', () => {
    it('immediately fires all pending updates', () => {
      state.handleStart('msg-1', 'agent-1');
      state.handleStart('msg-2', 'agent-2');
      state.handleChunk('msg-1', 'Content 1');
      state.handleChunk('msg-2', 'Content 2');

      state.flush();

      expect(callbacks.onStreamUpdate).toHaveBeenCalledWith('msg-1', 'Content 1');
      expect(callbacks.onStreamUpdate).toHaveBeenCalledWith('msg-2', 'Content 2');
    });

    it('cancels pending RAF', () => {
      state.handleStart('msg-1', 'agent-1');
      state.handleChunk('msg-1', 'Hello');
      state.flush();

      expect(cancelAnimationFrame).toHaveBeenCalled();
    });

    it('clears pending updates after flush', () => {
      state.handleStart('msg-1', 'agent-1');
      state.handleChunk('msg-1', 'Hello');
      state.flush();

      // Second flush should not fire update again
      callbacks.onStreamUpdate.mockClear();
      state.flush();

      expect(callbacks.onStreamUpdate).not.toHaveBeenCalled();
    });
  });

  describe('cleanup', () => {
    it('removes all active streams', () => {
      state.handleStart('msg-1', 'agent-1');
      state.handleStart('msg-2', 'agent-2');
      state.cleanup();

      expect(state.getActiveCount()).toBe(0);
      expect(state.isActive('msg-1')).toBe(false);
      expect(state.isActive('msg-2')).toBe(false);
    });

    it('cancels debounce timer', () => {
      state.handleStart('msg-1', 'agent-1');
      state.handleChunk('msg-1', 'Hello');
      state.cleanup();

      expect(cancelAnimationFrame).toHaveBeenCalled();
    });

    it('flushes pending updates before cleanup', () => {
      state.handleStart('msg-1', 'agent-1');
      state.handleChunk('msg-1', 'Hello');
      state.cleanup();

      expect(callbacks.onStreamUpdate).toHaveBeenCalledWith('msg-1', 'Hello');
    });
  });

  describe('concurrent streams', () => {
    it('tracks multiple streams independently', () => {
      state.handleStart('msg-1', 'agent-1');
      state.handleStart('msg-2', 'agent-2');
      state.handleChunk('msg-1', 'Stream 1');
      state.handleChunk('msg-2', 'Stream 2');

      expect(state.getContent('msg-1')).toBe('Stream 1');
      expect(state.getContent('msg-2')).toBe('Stream 2');
      expect(state.getActiveCount()).toBe(2);
    });

    it('ends one stream without affecting others', () => {
      state.handleStart('msg-1', 'agent-1');
      state.handleStart('msg-2', 'agent-2');
      state.handleEnd('msg-1');

      expect(state.isActive('msg-1')).toBe(false);
      expect(state.isActive('msg-2')).toBe(true);
    });
  });

  describe('getActiveIds', () => {
    it('returns empty array when no streams', () => {
      expect(state.getActiveIds()).toEqual([]);
    });

    it('returns all active stream IDs', () => {
      state.handleStart('a', 'agent-1');
      state.handleStart('b', 'agent-2');
      state.handleStart('c', 'agent-3');

      const ids = state.getActiveIds();
      expect(ids).toHaveLength(3);
      expect(ids).toContain('a');
      expect(ids).toContain('b');
      expect(ids).toContain('c');
    });
  });
});
