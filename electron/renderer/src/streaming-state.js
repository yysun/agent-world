/**
 * Streaming State Module - Content Accumulator + Debounce Logic
 *
 * Purpose:
 * - Accumulate streaming content chunks keyed by messageId
 * - Debounce UI updates at 16ms intervals (60fps)
 * - Provide clean lifecycle: start → chunk → end/error
 *
 * Key Features:
 * - Map-based accumulator for concurrent streams
 * - RAF-based debounce with flush on end/error
 * - Callback-driven updates for React integration
 *
 * Implementation Notes:
 * - Factory function pattern for easy testing
 * - No direct React dependency - uses callbacks
 * - Cleanup method for session switches
 *
 * Recent Changes:
 * - 2026-02-10: Added getActiveToolStreamIds/endAllToolStreams to prevent stale tool-stream busy state
 * - 2026-02-10: Added tool streaming support (handleToolStreamStart/Chunk/End)
 * - 2026-02-10: Added 50K character truncation for tool output
 * - 2026-02-10: Added stdout/stderr distinction for shell commands
 * - 2026-02-10: Initial implementation
 */

const DEBOUNCE_MS = 16; // 60fps frame budget
const MAX_TOOL_OUTPUT_LENGTH = 50000; // Characters

/**
 * @typedef {Object} StreamEntry
 * @property {string} messageId
 * @property {string} agentName
 * @property {string} content
 * @property {boolean} isStreaming
 * @property {boolean} hasError
 * @property {string|null} errorMessage
 * @property {string} createdAt
 * @property {boolean} [isToolStreaming] - True if streaming tool output
 * @property {('stdout'|'stderr')} [streamType] - Tool output stream type
 */

/**
 * @typedef {Object} StreamingStateCallbacks
 * @property {(entry: StreamEntry) => void} onStreamStart
 * @property {(messageId: string, content: string) => void} onStreamUpdate
 * @property {(messageId: string) => void} onStreamEnd
 * @property {(messageId: string, errorMessage: string) => void} onStreamError
 * @property {(entry: StreamEntry) => void} [onToolStreamStart] - Called when tool streaming starts
 * @property {(messageId: string, content: string, streamType: 'stdout'|'stderr') => void} [onToolStreamUpdate] - Called on tool stream chunks
 * @property {(messageId: string) => void} [onToolStreamEnd] - Called when tool streaming ends
 */

/**
 * Create a streaming state manager
 * @param {StreamingStateCallbacks} callbacks
 * @returns {Object} Streaming state API
 */
export function createStreamingState(callbacks) {
  /** @type {Map<string, StreamEntry>} */
  const streams = new Map();

  /** @type {Map<string, string>} Pending content updates awaiting debounce */
  const pendingUpdates = new Map();

  /** @type {Map<string, {content: string, streamType: 'stdout'|'stderr'}>} Pending tool updates */
  const pendingToolUpdates = new Map();

  /** @type {number|null} */
  let debounceFrameId = null;

  /**
   * Truncate tool output to prevent UI freezing
   * @param {string} content
   * @returns {string}
   */
  function truncateOutput(content) {
    if (content.length > MAX_TOOL_OUTPUT_LENGTH) {
      return '⚠️ Output truncated (showing last 50,000 chars)\n\n' +
        content.slice(-MAX_TOOL_OUTPUT_LENGTH);
    }
    return content;
  }

  /**
   * Flush all pending updates immediately
   */
  function flush() {
    if (debounceFrameId !== null) {
      cancelAnimationFrame(debounceFrameId);
      debounceFrameId = null;
    }

    for (const [messageId, content] of pendingUpdates) {
      callbacks.onStreamUpdate(messageId, content);
    }
    pendingUpdates.clear();

    for (const [messageId, update] of pendingToolUpdates) {
      if (callbacks.onToolStreamUpdate) {
        callbacks.onToolStreamUpdate(messageId, update.content, update.streamType);
      }
    }
    pendingToolUpdates.clear();
  }

  /**
   * Schedule a debounced update
   * @param {string} messageId
   * @param {string} content
   */
  function scheduleUpdate(messageId, content) {
    pendingUpdates.set(messageId, content);

    if (debounceFrameId === null) {
      debounceFrameId = requestAnimationFrame(() => {
        debounceFrameId = null;
        flush();
      });
    }
  }

  /**
   * Schedule a debounced tool update
   * @param {string} messageId
   * @param {string} content
   * @param {('stdout'|'stderr')} streamType
   */
  function scheduleToolUpdate(messageId, content, streamType) {
    pendingToolUpdates.set(messageId, { content, streamType });

    if (debounceFrameId === null) {
      debounceFrameId = requestAnimationFrame(() => {
        debounceFrameId = null;
        flush();
      });
    }
  }

  /**
   * Handle stream start event
   * @param {string} messageId
   * @param {string} agentName
   * @returns {StreamEntry}
   */
  function handleStart(messageId, agentName) {
    const entry = {
      messageId,
      agentName,
      content: '',
      isStreaming: true,
      hasError: false,
      errorMessage: null,
      createdAt: new Date().toISOString()
    };

    streams.set(messageId, entry);
    callbacks.onStreamStart(entry);
    return entry;
  }

  /**
   * Handle stream chunk event
   * @param {string} messageId
   * @param {string} chunk
   */
  function handleChunk(messageId, chunk) {
    const entry = streams.get(messageId);
    if (!entry) {
      // Stream not found - may have been cleaned up or not started
      // Create a new entry for late-arriving chunks
      const newEntry = {
        messageId,
        agentName: 'assistant',
        content: chunk,
        isStreaming: true,
        hasError: false,
        errorMessage: null,
        createdAt: new Date().toISOString()
      };
      streams.set(messageId, newEntry);
      callbacks.onStreamStart(newEntry);
      return;
    }

    entry.content += chunk;
    scheduleUpdate(messageId, entry.content);
  }

  /**
   * Handle stream end event
   * @param {string} messageId
   * @returns {string|null} Final content or null if stream not found
   */
  function handleEnd(messageId) {
    const entry = streams.get(messageId);
    if (!entry) return null;

    // Flush any pending updates for this stream
    if (pendingUpdates.has(messageId)) {
      callbacks.onStreamUpdate(messageId, entry.content);
      pendingUpdates.delete(messageId);
    }

    entry.isStreaming = false;
    const finalContent = entry.content;
    streams.delete(messageId);
    callbacks.onStreamEnd(messageId);
    return finalContent;
  }

  /**
   * Handle stream error event
   * @param {string} messageId
   * @param {string} errorMessage
   */
  function handleError(messageId, errorMessage) {
    const entry = streams.get(messageId);
    if (!entry) {
      // Error for unknown stream - create entry with error state
      callbacks.onStreamError(messageId, errorMessage);
      return;
    }

    // Flush any pending updates
    if (pendingUpdates.has(messageId)) {
      callbacks.onStreamUpdate(messageId, entry.content);
      pendingUpdates.delete(messageId);
    }

    entry.isStreaming = false;
    entry.hasError = true;
    entry.errorMessage = errorMessage;
    streams.delete(messageId);
    callbacks.onStreamError(messageId, errorMessage);
  }

  /**
   * Handle tool stream start event
   * @param {string} messageId
   * @param {string} agentName
   * @param {('stdout'|'stderr')} streamType
   * @returns {StreamEntry}
   * 
   * @example
   * const entry = streaming.handleToolStreamStart('msg1', 'shell_cmd', 'stdout');
   */
  function handleToolStreamStart(messageId, agentName, streamType) {
    const entry = {
      messageId,
      agentName,
      content: '',
      isStreaming: false,
      isToolStreaming: true,
      hasError: false,
      errorMessage: null,
      streamType,
      createdAt: new Date().toISOString()
    };

    streams.set(messageId, entry);
    if (callbacks.onToolStreamStart) {
      callbacks.onToolStreamStart(entry);
    }
    return entry;
  }

  /**
   * Handle tool stream chunk event
   * @param {string} messageId
   * @param {string} chunk
   * @param {('stdout'|'stderr')} streamType
   * 
   * @example
   * streaming.handleToolStreamChunk('msg1', 'Hello\n', 'stdout');
   */
  function handleToolStreamChunk(messageId, chunk, streamType) {
    const entry = streams.get(messageId);
    if (!entry) {
      // Stream not found - create one for late-arriving chunks
      const newEntry = {
        messageId,
        agentName: 'shell_cmd',
        content: chunk,
        isStreaming: false,
        isToolStreaming: true,
        hasError: false,
        errorMessage: null,
        streamType,
        createdAt: new Date().toISOString()
      };
      streams.set(messageId, newEntry);
      if (callbacks.onToolStreamStart) {
        callbacks.onToolStreamStart(newEntry);
      }
      return;
    }

    entry.content += chunk;
    entry.streamType = streamType; // Update stream type (handles stdout/stderr switching)

    // Apply truncation if needed
    if (entry.content.length > MAX_TOOL_OUTPUT_LENGTH) {
      entry.content = truncateOutput(entry.content);
    }

    scheduleToolUpdate(messageId, entry.content, streamType);
  }

  /**
   * Handle tool stream end event
   * @param {string} messageId
   * @returns {string|null} Final content or null if stream not found
   * 
   * @example
   * const finalContent = streaming.handleToolStreamEnd('msg1');
   */
  function handleToolStreamEnd(messageId) {
    const entry = streams.get(messageId);
    if (!entry) return null;

    // Flush any pending updates for this stream
    if (pendingToolUpdates.has(messageId)) {
      const update = pendingToolUpdates.get(messageId);
      if (callbacks.onToolStreamUpdate) {
        callbacks.onToolStreamUpdate(messageId, update.content, update.streamType);
      }
      pendingToolUpdates.delete(messageId);
    }

    entry.isToolStreaming = false;
    const finalContent = entry.content;
    streams.delete(messageId);

    if (callbacks.onToolStreamEnd) {
      callbacks.onToolStreamEnd(messageId);
    }

    return finalContent;
  }

  /**
   * Get current content for a stream
   * @param {string} messageId
   * @returns {string|null}
   */
  function getContent(messageId) {
    const entry = streams.get(messageId);
    return entry ? entry.content : null;
  }

  /**
   * Check if a stream is active
   * @param {string} messageId
   * @returns {boolean}
   */
  function isActive(messageId) {
    return streams.has(messageId);
  }

  /**
   * Get count of active streams
   * @returns {number}
   */
  function getActiveCount() {
    return streams.size;
  }

  /**
   * Get all active stream IDs
   * @returns {string[]}
   */
  function getActiveIds() {
    return Array.from(streams.keys());
  }

  /**
   * Get IDs for active tool streams only
   * @returns {string[]}
   */
  function getActiveToolStreamIds() {
    return Array.from(streams.entries())
      .filter(([, entry]) => entry.isToolStreaming === true)
      .map(([messageId]) => messageId);
  }

  /**
   * End all active tool streams and flush final updates
   * @returns {string[]} IDs of ended tool streams
   */
  function endAllToolStreams() {
    const endedIds = getActiveToolStreamIds();
    endedIds.forEach((messageId) => {
      handleToolStreamEnd(messageId);
    });
    return endedIds;
  }

  /**
   * Clean up all streams (for session switch)
   */
  function cleanup() {
    flush();
    streams.clear();
    pendingUpdates.clear();
    pendingToolUpdates.clear();
    if (debounceFrameId !== null) {
      cancelAnimationFrame(debounceFrameId);
      debounceFrameId = null;
    }
  }

  return {
    handleStart,
    handleChunk,
    handleEnd,
    handleError,
    handleToolStreamStart,
    handleToolStreamChunk,
    handleToolStreamEnd,
    getContent,
    isActive,
    getActiveCount,
    getActiveIds,
    getActiveToolStreamIds,
    endAllToolStreams,
    flush,
    cleanup
  };
}

export default createStreamingState;
