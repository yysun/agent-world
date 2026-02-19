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
 * - 2026-02-19: Deferred assistant message rendering to first chunk by emitting stream updates with full entry data.
 * - 2026-02-10: Added getActiveToolStreamIds/endAllToolStreams to prevent stale tool-stream busy state
 * - 2026-02-10: Added tool streaming support (handleToolStreamStart/Chunk/End)
 * - 2026-02-10: Added 50K character truncation for tool output
 * - 2026-02-10: Added stdout/stderr distinction for shell commands
 * - 2026-02-10: Initial implementation
 * - 2026-02-17: Migrated module from JS to TS with explicit stream typing.
 */

const MAX_TOOL_OUTPUT_LENGTH = 50000;

export type ToolStreamType = 'stdout' | 'stderr';

export interface StreamEntry {
  messageId: string;
  agentName: string;
  content: string;
  isStreaming: boolean;
  hasError: boolean;
  errorMessage: string | null;
  createdAt: string;
  isToolStreaming?: boolean;
  streamType?: ToolStreamType;
}

export interface StreamingStateCallbacks {
  onStreamStart: (entry: StreamEntry) => void;
  onStreamUpdate: (entry: StreamEntry) => void;
  onStreamEnd: (messageId: string) => void;
  onStreamError: (messageId: string, errorMessage: string) => void;
  onToolStreamStart?: (entry: StreamEntry) => void;
  onToolStreamUpdate?: (messageId: string, content: string, streamType: ToolStreamType) => void;
  onToolStreamEnd?: (messageId: string) => void;
}

interface PendingToolUpdate {
  content: string;
  streamType: ToolStreamType;
}

export interface StreamingStateApi {
  handleStart: (messageId: string, agentName: string) => StreamEntry;
  handleChunk: (messageId: string, chunk: string) => void;
  handleEnd: (messageId: string) => string | null;
  handleError: (messageId: string, errorMessage: string) => void;
  handleToolStreamStart: (messageId: string, agentName: string, streamType: ToolStreamType) => StreamEntry;
  handleToolStreamChunk: (messageId: string, chunk: string, streamType: ToolStreamType) => void;
  handleToolStreamEnd: (messageId: string) => string | null;
  getContent: (messageId: string) => string | null;
  isActive: (messageId: string) => boolean;
  getActiveCount: () => number;
  getActiveIds: () => string[];
  getActiveToolStreamIds: () => string[];
  endAllToolStreams: () => string[];
  flush: () => void;
  cleanup: () => void;
}

export function createStreamingState(callbacks: StreamingStateCallbacks): StreamingStateApi {
  const streams = new Map<string, StreamEntry>();
  const pendingUpdates = new Map<string, StreamEntry>();
  const pendingToolUpdates = new Map<string, PendingToolUpdate>();

  let debounceFrameId: number | null = null;

  function truncateOutput(content: string) {
    if (content.length > MAX_TOOL_OUTPUT_LENGTH) {
      return '⚠️ Output truncated (showing last 50,000 chars)\n\n' + content.slice(-MAX_TOOL_OUTPUT_LENGTH);
    }
    return content;
  }

  function flush() {
    if (debounceFrameId !== null) {
      cancelAnimationFrame(debounceFrameId);
      debounceFrameId = null;
    }

    for (const [, entry] of pendingUpdates) {
      callbacks.onStreamUpdate(entry);
    }
    pendingUpdates.clear();

    for (const [messageId, update] of pendingToolUpdates) {
      if (callbacks.onToolStreamUpdate) {
        callbacks.onToolStreamUpdate(messageId, update.content, update.streamType);
      }
    }
    pendingToolUpdates.clear();
  }

  function scheduleUpdate(entry: StreamEntry) {
    pendingUpdates.set(entry.messageId, { ...entry });

    if (debounceFrameId === null) {
      debounceFrameId = requestAnimationFrame(() => {
        debounceFrameId = null;
        flush();
      });
    }
  }

  function scheduleToolUpdate(messageId: string, content: string, streamType: ToolStreamType) {
    pendingToolUpdates.set(messageId, { content, streamType });

    if (debounceFrameId === null) {
      debounceFrameId = requestAnimationFrame(() => {
        debounceFrameId = null;
        flush();
      });
    }
  }

  function handleStart(messageId: string, agentName: string) {
    const entry: StreamEntry = {
      messageId,
      agentName,
      content: '',
      isStreaming: true,
      hasError: false,
      errorMessage: null,
      createdAt: new Date().toISOString(),
    };

    streams.set(messageId, entry);
    callbacks.onStreamStart(entry);
    return entry;
  }

  function handleChunk(messageId: string, chunk: string) {
    const entry = streams.get(messageId);
    if (!entry) {
      const newEntry: StreamEntry = {
        messageId,
        agentName: 'assistant',
        content: chunk,
        isStreaming: true,
        hasError: false,
        errorMessage: null,
        createdAt: new Date().toISOString(),
      };
      streams.set(messageId, newEntry);
      callbacks.onStreamStart(newEntry);
      scheduleUpdate(newEntry);
      return;
    }

    entry.content += chunk;
    scheduleUpdate(entry);
  }

  function handleEnd(messageId: string) {
    const entry = streams.get(messageId);
    if (!entry) return null;

    if (pendingUpdates.has(messageId)) {
      callbacks.onStreamUpdate({ ...entry });
      pendingUpdates.delete(messageId);
    }

    entry.isStreaming = false;
    const finalContent = entry.content;
    streams.delete(messageId);
    callbacks.onStreamEnd(messageId);
    return finalContent;
  }

  function handleError(messageId: string, errorMessage: string) {
    const entry = streams.get(messageId);
    if (!entry) {
      callbacks.onStreamError(messageId, errorMessage);
      return;
    }

    if (pendingUpdates.has(messageId)) {
      callbacks.onStreamUpdate({ ...entry });
      pendingUpdates.delete(messageId);
    }

    entry.isStreaming = false;
    entry.hasError = true;
    entry.errorMessage = errorMessage;
    streams.delete(messageId);
    callbacks.onStreamError(messageId, errorMessage);
  }

  function handleToolStreamStart(messageId: string, agentName: string, streamType: ToolStreamType) {
    const entry: StreamEntry = {
      messageId,
      agentName,
      content: '',
      isStreaming: false,
      isToolStreaming: true,
      hasError: false,
      errorMessage: null,
      streamType,
      createdAt: new Date().toISOString(),
    };

    streams.set(messageId, entry);
    if (callbacks.onToolStreamStart) {
      callbacks.onToolStreamStart(entry);
    }
    return entry;
  }

  function handleToolStreamChunk(messageId: string, chunk: string, streamType: ToolStreamType) {
    const entry = streams.get(messageId);
    if (!entry) {
      const newEntry: StreamEntry = {
        messageId,
        agentName: 'shell_cmd',
        content: chunk,
        isStreaming: false,
        isToolStreaming: true,
        hasError: false,
        errorMessage: null,
        streamType,
        createdAt: new Date().toISOString(),
      };
      streams.set(messageId, newEntry);
      if (callbacks.onToolStreamStart) {
        callbacks.onToolStreamStart(newEntry);
      }
      return;
    }

    entry.content += chunk;
    entry.streamType = streamType;

    if (entry.content.length > MAX_TOOL_OUTPUT_LENGTH) {
      entry.content = truncateOutput(entry.content);
    }

    scheduleToolUpdate(messageId, entry.content, streamType);
  }

  function handleToolStreamEnd(messageId: string) {
    const entry = streams.get(messageId);
    if (!entry) return null;

    if (pendingToolUpdates.has(messageId)) {
      const update = pendingToolUpdates.get(messageId);
      if (callbacks.onToolStreamUpdate && update) {
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

  function getContent(messageId: string) {
    const entry = streams.get(messageId);
    return entry ? entry.content : null;
  }

  function isActive(messageId: string) {
    return streams.has(messageId);
  }

  function getActiveCount() {
    return streams.size;
  }

  function getActiveIds() {
    return Array.from(streams.keys());
  }

  function getActiveToolStreamIds() {
    return Array.from(streams.entries())
      .filter(([, entry]) => entry.isToolStreaming === true)
      .map(([messageId]) => messageId);
  }

  function endAllToolStreams() {
    const endedIds = getActiveToolStreamIds();
    endedIds.forEach((messageId) => {
      handleToolStreamEnd(messageId);
    });
    return endedIds;
  }

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
    cleanup,
  };
}

export default createStreamingState;
