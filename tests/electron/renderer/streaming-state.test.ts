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
 * - 2026-02-12: Moved into layer-based tests/electron subfolder and updated module import paths.
 * - 2026-02-10: Added tests for tool stream bulk cleanup APIs (`getActiveToolStreamIds`, `endAllToolStreams`)
 * - 2026-02-10: Initial test suite
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createStreamingState } from '../../../electron/renderer/src/streaming-state';

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

      expect(callbacks.onStreamUpdate).toHaveBeenCalledWith(expect.objectContaining({ messageId: 'msg-1', content: 'Hello' }));
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
      expect(callbacks.onStreamUpdate).toHaveBeenCalledWith(expect.objectContaining({ messageId: 'msg-1', content: 'Hello World!' }));
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
      expect(callbacks.onStreamUpdate).toHaveBeenCalledWith(expect.objectContaining({ messageId: 'msg-1', content: 'Hello' }));
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

      expect(callbacks.onStreamUpdate).toHaveBeenCalledWith(expect.objectContaining({ messageId: 'msg-1', content: 'Partial content' }));
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

      expect(callbacks.onStreamUpdate).toHaveBeenCalledWith(expect.objectContaining({ messageId: 'msg-1', content: 'Content 1' }));
      expect(callbacks.onStreamUpdate).toHaveBeenCalledWith(expect.objectContaining({ messageId: 'msg-2', content: 'Content 2' }));
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

      expect(callbacks.onStreamUpdate).toHaveBeenCalledWith(expect.objectContaining({ messageId: 'msg-1', content: 'Hello' }));
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

  describe('Tool Streaming', () => {
    beforeEach(() => {
      // Add tool streaming callbacks
      callbacks.onToolStreamStart = vi.fn();
      callbacks.onToolStreamUpdate = vi.fn();
      callbacks.onToolStreamEnd = vi.fn();
      state = createStreamingState(callbacks);
    });

    describe('handleToolStreamStart', () => {
      it('should create tool stream entry with stdout type', () => {
        const entry = state.handleToolStreamStart('msg-1', 'shell_cmd', 'stdout');

        expect(entry.messageId).toBe('msg-1');
        expect(entry.agentName).toBe('shell_cmd');
        expect(entry.content).toBe('');
        expect(entry.isToolStreaming).toBe(true);
        expect(entry.streamType).toBe('stdout');
        expect(entry.createdAt).toBeDefined();
      });

      it('should create tool stream entry with stderr type', () => {
        const entry = state.handleToolStreamStart('msg-1', 'shell_cmd', 'stderr');

        expect(entry.streamType).toBe('stderr');
        expect(entry.isToolStreaming).toBe(true);
      });

      it('should call onToolStreamStart callback', () => {
        state.handleToolStreamStart('msg-1', 'shell_cmd', 'stdout');

        expect(callbacks.onToolStreamStart).toHaveBeenCalledTimes(1);
        expect(callbacks.onToolStreamStart).toHaveBeenCalledWith(
          expect.objectContaining({
            messageId: 'msg-1',
            agentName: 'shell_cmd',
            streamType: 'stdout'
          })
        );
      });

      it('should track tool stream as active', () => {
        state.handleToolStreamStart('msg-1', 'shell_cmd', 'stdout');

        expect(state.isActive('msg-1')).toBe(true);
        expect(state.getActiveCount()).toBe(1);
      });
    });

    describe('handleToolStreamChunk', () => {
      it('should accumulate tool output chunks', () => {
        state.handleToolStreamStart('msg-1', 'shell_cmd', 'stdout');
        state.handleToolStreamChunk('msg-1', 'Hello\n', 'stdout');
        state.handleToolStreamChunk('msg-1', 'World\n', 'stdout');

        expect(state.getContent('msg-1')).toBe('Hello\nWorld\n');
      });

      it('should schedule debounced update', () => {
        state.handleToolStreamStart('msg-1', 'shell_cmd', 'stdout');
        state.handleToolStreamChunk('msg-1', 'Output', 'stdout');

        expect(rafCallback).not.toBeNull();
        expect(callbacks.onToolStreamUpdate).not.toHaveBeenCalled();

        rafCallback();
        expect(callbacks.onToolStreamUpdate).toHaveBeenCalledWith('msg-1', 'Output', 'stdout');
      });

      it('should update streamType when switching streams', () => {
        state.handleToolStreamStart('msg-1', 'shell_cmd', 'stdout');
        state.handleToolStreamChunk('msg-1', 'Normal output\n', 'stdout');
        state.handleToolStreamChunk('msg-1', 'Error output\n', 'stderr');

        rafCallback();
        const lastCall = callbacks.onToolStreamUpdate.mock.calls[callbacks.onToolStreamUpdate.mock.calls.length - 1];
        expect(lastCall[2]).toBe('stderr'); // streamType parameter
      });

      it('should handle rapid stdout/stderr switching', () => {
        state.handleToolStreamStart('msg-1', 'shell_cmd', 'stdout');

        for (let i = 0; i < 10; i++) {
          const type = i % 2 === 0 ? 'stdout' : 'stderr';
          state.handleToolStreamChunk('msg-1', `Line ${i}\n`, type);
        }

        expect(state.isActive('msg-1')).toBe(true);
        const content = state.getContent('msg-1');
        expect(content.split('\n').length).toBe(11); // 10 lines + empty line
      });

      it('should create stream for late-arriving chunks', () => {
        state.handleToolStreamChunk('msg-1', 'Late chunk', 'stdout');

        expect(state.isActive('msg-1')).toBe(true);
        expect(callbacks.onToolStreamStart).toHaveBeenCalledTimes(1);
        expect(state.getContent('msg-1')).toBe('Late chunk');
      });

      it('should truncate tool output exceeding 50K characters', () => {
        state.handleToolStreamStart('msg-1', 'shell_cmd', 'stdout');

        const longOutput = 'x'.repeat(60000);
        state.handleToolStreamChunk('msg-1', longOutput, 'stdout');

        rafCallback();
        const lastCall = callbacks.onToolStreamUpdate.mock.calls[callbacks.onToolStreamUpdate.mock.calls.length - 1];
        const content = lastCall[1];

        expect(content).toContain('⚠️ Output truncated');
        expect(content.length).toBeLessThanOrEqual(50100); // Truncation + warning
      });
    });

    describe('handleToolStreamEnd', () => {
      it('should end tool stream and return content', () => {
        state.handleToolStreamStart('msg-1', 'shell_cmd', 'stdout');
        state.handleToolStreamChunk('msg-1', 'Done\n', 'stdout');

        const finalContent = state.handleToolStreamEnd('msg-1');

        expect(finalContent).toBe('Done\n');
        expect(callbacks.onToolStreamEnd).toHaveBeenCalledWith('msg-1');
        expect(state.isActive('msg-1')).toBe(false);
      });

      it('should flush pending updates before ending', () => {
        state.handleToolStreamStart('msg-1', 'shell_cmd', 'stdout');
        state.handleToolStreamChunk('msg-1', 'Final', 'stdout');

        state.handleToolStreamEnd('msg-1');

        expect(callbacks.onToolStreamUpdate).toHaveBeenCalledWith('msg-1', 'Final', 'stdout');
      });

      it('should return null for unknown stream', () => {
        const result = state.handleToolStreamEnd('unknown');

        expect(result).toBeNull();
      });
    });

    describe('edge cases', () => {
      it('should handle empty tool output', () => {
        state.handleToolStreamStart('msg-1', 'shell_cmd', 'stdout');
        state.handleToolStreamChunk('msg-1', '', 'stdout');

        expect(state.getContent('msg-1')).toBe('');
      });

      it('should handle whitespace-only output', () => {
        state.handleToolStreamStart('msg-1', 'shell_cmd', 'stdout');
        state.handleToolStreamChunk('msg-1', '   \n\n   ', 'stdout');

        expect(state.getContent('msg-1')).toBe('   \n\n   ');
      });

      it('should handle tool stream without explicit end', () => {
        state.handleToolStreamStart('msg-1', 'shell_cmd', 'stdout');
        state.handleToolStreamChunk('msg-1', 'Output', 'stdout');

        // Simulate cleanup without end
        state.cleanup();
        expect(state.getActiveCount()).toBe(0);
      });
    });

    describe('concurrent text and tool streaming', () => {
      it('should handle text and tool streaming simultaneously', () => {
        state.handleStart('msg-1', 'agent-1');
        state.handleToolStreamStart('msg-2', 'shell_cmd', 'stdout');

        state.handleChunk('msg-1', 'Text content');
        state.handleToolStreamChunk('msg-2', 'Tool output', 'stdout');

        expect(state.getActiveCount()).toBe(2);
        expect(state.isActive('msg-1')).toBe(true);
        expect(state.isActive('msg-2')).toBe(true);
      });

      it('should not interfere with text streaming state', () => {
        state.handleStart('msg-1', 'agent-1');
        state.handleToolStreamStart('msg-2', 'shell_cmd', 'stdout');

        state.handleChunk('msg-1', 'Text');
        state.handleToolStreamChunk('msg-2', 'Tool output', 'stdout');

        state.handleEnd('msg-1');
        expect(state.isActive('msg-1')).toBe(false);
        expect(state.isActive('msg-2')).toBe(true);

        state.handleToolStreamEnd('msg-2');
        expect(state.isActive('msg-2')).toBe(false);
      });

      it('should return only tool stream IDs', () => {
        state.handleStart('assistant-stream', 'agent-1');
        state.handleToolStreamStart('tool-1', 'shell_cmd', 'stdout');
        state.handleToolStreamStart('tool-2', 'shell_cmd', 'stderr');

        const toolIds = state.getActiveToolStreamIds();

        expect(toolIds).toHaveLength(2);
        expect(toolIds).toContain('tool-1');
        expect(toolIds).toContain('tool-2');
        expect(toolIds).not.toContain('assistant-stream');
      });

      it('should end all active tool streams without ending text streams', () => {
        state.handleStart('assistant-stream', 'agent-1');
        state.handleToolStreamStart('tool-1', 'shell_cmd', 'stdout');
        state.handleToolStreamChunk('tool-1', 'output-1', 'stdout');
        state.handleToolStreamStart('tool-2', 'shell_cmd', 'stderr');
        state.handleToolStreamChunk('tool-2', 'output-2', 'stderr');

        const endedIds = state.endAllToolStreams();

        expect(endedIds).toEqual(expect.arrayContaining(['tool-1', 'tool-2']));
        expect(state.isActive('tool-1')).toBe(false);
        expect(state.isActive('tool-2')).toBe(false);
        expect(state.isActive('assistant-stream')).toBe(true);
        expect(callbacks.onToolStreamEnd).toHaveBeenCalledWith('tool-1');
        expect(callbacks.onToolStreamEnd).toHaveBeenCalledWith('tool-2');
      });
    });
  });
});
