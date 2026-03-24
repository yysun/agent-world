/**
 * Purpose:
 * - Expose streaming, tool, and HITL World update handlers.
 *
 * Key Features:
 * - Groups SSE, tool lifecycle, system status, and activity-related handlers.
 *
 * Notes on Implementation:
 * - Delegates to the migrated runtime implementation to preserve ordering semantics.
 *
 * Summary of Recent Changes:
 * - 2026-03-24: Added streaming handler slicing for the World update surface.
 */

import type { Update } from 'apprun';
import type { WorldComponentState } from '../../../types';
import type { WorldEventName } from '../../../types/events';
import { worldUpdateHandlers as runtimeWorldUpdateHandlers } from './runtime';

export const worldStreamingHandlers: Update<WorldComponentState, WorldEventName> = {
  'handleStreamStart': runtimeWorldUpdateHandlers['handleStreamStart'],
  'handleStreamChunk': runtimeWorldUpdateHandlers['handleStreamChunk'],
  'handleStreamEnd': runtimeWorldUpdateHandlers['handleStreamEnd'],
  'handleStreamError': runtimeWorldUpdateHandlers['handleStreamError'],
  'handleLogEvent': runtimeWorldUpdateHandlers['handleLogEvent'],
  'handleMessageEvent': runtimeWorldUpdateHandlers['handleMessageEvent'],
  'handleSystemEvent': runtimeWorldUpdateHandlers['handleSystemEvent'],
  'clear-system-status': runtimeWorldUpdateHandlers['clear-system-status'],
  'respond-hitl-option': runtimeWorldUpdateHandlers['respond-hitl-option'],
  'handleError': runtimeWorldUpdateHandlers['handleError'],
  'handleToolError': runtimeWorldUpdateHandlers['handleToolError'],
  'handleToolStart': runtimeWorldUpdateHandlers['handleToolStart'],
  'handleToolProgress': runtimeWorldUpdateHandlers['handleToolProgress'],
  'handleToolResult': runtimeWorldUpdateHandlers['handleToolResult'],
  'handleToolStream': runtimeWorldUpdateHandlers['handleToolStream'],
  'handleToolStreamEnd': runtimeWorldUpdateHandlers['handleToolStreamEnd'],
  'handleWorldActivity': runtimeWorldUpdateHandlers['handleWorldActivity'],
  'flush-stream-updates': runtimeWorldUpdateHandlers['flush-stream-updates'],
  'update-elapsed-time': runtimeWorldUpdateHandlers['update-elapsed-time'],
};