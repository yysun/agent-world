/**
 * Activity State Module - Tool Tracking + Elapsed Timer + Busy State
 *
 * Purpose:
 * - Track tool execution states (start, result, error, progress)
 * - Manage elapsed time counter for active operations
 * - Provide unified busy state indicator for UI
 *
 * Key Features:
 * - Map-based tool tracking keyed by toolUseId
 * - Interval-based elapsed time updates
 * - Aggregated busy state from streams + tools
 *
 * Implementation Notes:
 * - Factory function pattern for easy testing
 * - 1-second interval for elapsed time updates
 * - Cleanup method for session switches
 *
 * Recent Changes:
 * - 2026-02-10: Initial implementation
 */

const ELAPSED_UPDATE_INTERVAL_MS = 1000; // 1 second

/**
 * @typedef {Object} ToolEntry
 * @property {string} toolUseId
 * @property {string} toolName
 * @property {Object} [toolInput]
 * @property {'running'|'completed'|'error'} status
 * @property {string|null} result
 * @property {string|null} errorMessage
 * @property {string|null} progress
 * @property {string} startedAt
 * @property {string|null} completedAt
 */

/**
 * @typedef {Object} ActivityStateCallbacks
 * @property {(entry: ToolEntry) => void} onToolStart
 * @property {(toolUseId: string, result: string) => void} onToolResult
 * @property {(toolUseId: string, errorMessage: string) => void} onToolError
 * @property {(toolUseId: string, progress: string) => void} onToolProgress
 * @property {(elapsedMs: number) => void} onElapsedUpdate
 * @property {(isBusy: boolean) => void} onBusyChange
 */

/**
 * Create an activity state manager
 * @param {ActivityStateCallbacks} callbacks
 * @returns {Object} Activity state API
 */
export function createActivityState(callbacks) {
  /** @type {Map<string, ToolEntry>} */
  const tools = new Map();

  /** @type {number|null} Activity start timestamp */
  let activityStartTime = null;

  /** @type {number|null} Interval ID for elapsed updates */
  let elapsedIntervalId = null;

  /** @type {boolean} */
  let isBusy = false;

  /** @type {number} External stream count (from streaming-state) */
  let activeStreamCount = 0;

  /**
   * Update busy state and notify if changed
   */
  function updateBusyState() {
    const newBusy = activeStreamCount > 0 || tools.size > 0;
    if (newBusy !== isBusy) {
      isBusy = newBusy;
      callbacks.onBusyChange(isBusy);

      if (isBusy && activityStartTime === null) {
        startElapsedTimer();
      } else if (!isBusy && activityStartTime !== null) {
        stopElapsedTimer();
      }
    }
  }

  /**
   * Start the elapsed time timer
   */
  function startElapsedTimer() {
    activityStartTime = Date.now();
    callbacks.onElapsedUpdate(0);

    elapsedIntervalId = setInterval(() => {
      if (activityStartTime !== null) {
        const elapsed = Date.now() - activityStartTime;
        callbacks.onElapsedUpdate(elapsed);
      }
    }, ELAPSED_UPDATE_INTERVAL_MS);
  }

  /**
   * Stop the elapsed time timer
   */
  function stopElapsedTimer() {
    if (elapsedIntervalId !== null) {
      clearInterval(elapsedIntervalId);
      elapsedIntervalId = null;
    }
    activityStartTime = null;
  }

  /**
   * Handle tool start event
   * @param {string} toolUseId
   * @param {string} toolName
   * @param {Object} [toolInput]
   * @returns {ToolEntry}
   */
  function handleToolStart(toolUseId, toolName, toolInput) {
    const entry = {
      toolUseId,
      toolName,
      toolInput: toolInput || null,
      status: 'running',
      result: null,
      errorMessage: null,
      progress: null,
      startedAt: new Date().toISOString(),
      completedAt: null
    };

    tools.set(toolUseId, entry);
    callbacks.onToolStart(entry);
    updateBusyState();
    return entry;
  }

  /**
   * Handle tool result event
   * @param {string} toolUseId
   * @param {string} result
   */
  function handleToolResult(toolUseId, result) {
    tools.delete(toolUseId);
    callbacks.onToolResult(toolUseId, result);
    updateBusyState();
  }

  /**
   * Handle tool error event
   * @param {string} toolUseId
   * @param {string} errorMessage
   */
  function handleToolError(toolUseId, errorMessage) {
    tools.delete(toolUseId);
    callbacks.onToolError(toolUseId, errorMessage);
    updateBusyState();
  }

  /**
   * Handle tool progress event
   * @param {string} toolUseId
   * @param {string} progress
   */
  function handleToolProgress(toolUseId, progress) {
    const entry = tools.get(toolUseId);
    if (entry) {
      entry.progress = progress;
    }
    callbacks.onToolProgress(toolUseId, progress);
  }

  /**
   * Set the active stream count (from streaming-state)
   * @param {number} count
   */
  function setActiveStreamCount(count) {
    activeStreamCount = count;
    updateBusyState();
  }

  /**
   * Get a tool entry by ID
   * @param {string} toolUseId
   * @returns {ToolEntry|null}
   */
  function getTool(toolUseId) {
    return tools.get(toolUseId) || null;
  }

  /**
   * Get count of active tools
   * @returns {number}
   */
  function getActiveToolCount() {
    return tools.size;
  }

  /**
   * Get all active tool entries
   * @returns {ToolEntry[]}
   */
  function getActiveTools() {
    return Array.from(tools.values());
  }

  /**
   * Check if any activity is in progress
   * @returns {boolean}
   */
  function getIsBusy() {
    return isBusy;
  }

  /**
   * Get current elapsed time in milliseconds
   * @returns {number}
   */
  function getElapsedMs() {
    if (activityStartTime === null) return 0;
    return Date.now() - activityStartTime;
  }

  /**
   * Clean up all state (for session switch)
   */
  function cleanup() {
    tools.clear();
    activeStreamCount = 0;
    stopElapsedTimer();
    if (isBusy) {
      isBusy = false;
      callbacks.onBusyChange(false);
    }
  }

  return {
    handleToolStart,
    handleToolResult,
    handleToolError,
    handleToolProgress,
    setActiveStreamCount,
    getTool,
    getActiveToolCount,
    getActiveTools,
    getIsBusy,
    getElapsedMs,
    cleanup
  };
}

export default createActivityState;
