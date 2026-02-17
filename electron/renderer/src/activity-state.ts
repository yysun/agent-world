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
 * - 2026-02-17: Migrated module from JS to TS with explicit callback/tool entry typings.
 */

const ELAPSED_UPDATE_INTERVAL_MS = 1000;

export type ToolStatus = 'running' | 'completed' | 'error';

export interface ToolEntry {
  toolUseId: string;
  toolName: string;
  toolInput?: Record<string, unknown> | null;
  status: ToolStatus;
  result: string | null;
  errorMessage: string | null;
  progress: string | null;
  startedAt: string;
  completedAt: string | null;
}

export interface ActivityStateCallbacks {
  onToolStart: (entry: ToolEntry) => void;
  onToolResult: (toolUseId: string, result: string) => void;
  onToolError: (toolUseId: string, errorMessage: string) => void;
  onToolProgress: (toolUseId: string, progress: string) => void;
  onElapsedUpdate: (elapsedMs: number) => void;
  onBusyChange: (isBusy: boolean) => void;
}

export interface ActivityStateApi {
  handleToolStart: (toolUseId: string, toolName: string, toolInput?: Record<string, unknown>) => ToolEntry;
  handleToolResult: (toolUseId: string, result: string) => void;
  handleToolError: (toolUseId: string, errorMessage: string) => void;
  handleToolProgress: (toolUseId: string, progress: string) => void;
  setActiveStreamCount: (count: number) => void;
  getTool: (toolUseId: string) => ToolEntry | null;
  getActiveToolCount: () => number;
  getActiveTools: () => ToolEntry[];
  getIsBusy: () => boolean;
  getElapsedMs: () => number;
  cleanup: () => void;
}

export function createActivityState(callbacks: ActivityStateCallbacks): ActivityStateApi {
  const tools = new Map<string, ToolEntry>();

  let activityStartTime: number | null = null;
  let elapsedIntervalId: ReturnType<typeof setInterval> | null = null;
  let isBusy = false;
  let activeStreamCount = 0;

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

  function stopElapsedTimer() {
    if (elapsedIntervalId !== null) {
      clearInterval(elapsedIntervalId);
      elapsedIntervalId = null;
    }
    activityStartTime = null;
  }

  function handleToolStart(toolUseId: string, toolName: string, toolInput?: Record<string, unknown>): ToolEntry {
    const entry: ToolEntry = {
      toolUseId,
      toolName,
      toolInput: toolInput || null,
      status: 'running',
      result: null,
      errorMessage: null,
      progress: null,
      startedAt: new Date().toISOString(),
      completedAt: null,
    };

    tools.set(toolUseId, entry);
    callbacks.onToolStart(entry);
    updateBusyState();
    return entry;
  }

  function handleToolResult(toolUseId: string, result: string) {
    tools.delete(toolUseId);
    callbacks.onToolResult(toolUseId, result);
    updateBusyState();
  }

  function handleToolError(toolUseId: string, errorMessage: string) {
    tools.delete(toolUseId);
    callbacks.onToolError(toolUseId, errorMessage);
    updateBusyState();
  }

  function handleToolProgress(toolUseId: string, progress: string) {
    const entry = tools.get(toolUseId);
    if (entry) {
      entry.progress = progress;
    }
    callbacks.onToolProgress(toolUseId, progress);
  }

  function setActiveStreamCount(count: number) {
    activeStreamCount = count;
    updateBusyState();
  }

  function getTool(toolUseId: string) {
    return tools.get(toolUseId) || null;
  }

  function getActiveToolCount() {
    return tools.size;
  }

  function getActiveTools() {
    return Array.from(tools.values());
  }

  function getIsBusy() {
    return isBusy;
  }

  function getElapsedMs() {
    if (activityStartTime === null) return 0;
    return Date.now() - activityStartTime;
  }

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
    cleanup,
  };
}

export default createActivityState;