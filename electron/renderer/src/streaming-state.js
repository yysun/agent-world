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
 * - 2026-02-10: Initial implementation
 */

const DEBOUNCE_MS = 16; // 60fps frame budget

/**
 * @typedef {Object} StreamEntry
 * @property {string} messageId
 * @property {string} agentName
 * @property {string} content
 * @property {boolean} isStreaming
 * @property {boolean} hasError
 * @property {string|null} errorMessage
 * @property {string} createdAt
 */

/**
 * @typedef {Object} StreamingStateCallbacks
 * @property {(entry: StreamEntry) => void} onStreamStart
 * @property {(messageId: string, content: string) => void} onStreamUpdate
 * @property {(messageId: string) => void} onStreamEnd
 * @property {(messageId: string, errorMessage: string) => void} onStreamError
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

  /** @type {number|null} */
  let debounceFrameId = null;

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
   * Clean up all streams (for session switch)
   */
  function cleanup() {
    flush();
    streams.clear();
    pendingUpdates.clear();
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
    getContent,
    isActive,
    getActiveCount,
    getActiveIds,
    flush,
    cleanup
  };
}

export default createStreamingState;
