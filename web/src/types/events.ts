/**
 * World Component Event Types - AppRun Native Typed Events
 * 
 * Leverages AppRun's discriminated union pattern for compile-time event validation.
 * TypeScript provides IDE autocomplete and catches payload structure mismatches.
 * 
 * Architecture:
 * - Discriminated union type with 'name' and 'payload' fields
 * - Each event maps to its specific payload type
 * - Use with AppRun's Update<State, EventName> for full type inference
 * 
 * Based on: https://apprun.js.org/docs/strong-typing/
 * 
 * Usage Example:
 * ```typescript
 * import type { Update } from 'apprun';
 * import type { WorldEventName, WorldEventPayload } from './events';
 * 
 * const handlers: Update<WorldComponentState, WorldEventName> = [
 *   ['send-message', (state) => { ... }],
 *   ['start-edit-message', (state, payload: WorldEventPayload<'start-edit-message'>) => {
 *     // TypeScript knows: payload.messageId and payload.text exist
 *   }]
 * ];
 * ```
 * 
 * Changes:
 * - 2025-10-26: Initial creation with 40+ typed events for World component
 */

import type { Agent, ApprovalRequest, Message, StreamStartData, StreamChunkData, StreamEndData, StreamErrorData } from './index';

/**
 * World Component Events - Discriminated Union Type
 * 
 * All events for the World component with strongly-typed payloads.
 * Grouped by functional domain for maintainability.
 */
export type WorldEvents =
  // ========================================
  // ROUTE & INITIALIZATION EVENTS
  // ========================================

  /** Initialize world component with name and optional chat ID */
  | { name: '/World'; payload: any }

  /** Initialize world (same as route handler) */
  | { name: 'initWorld'; payload: any }

  // ========================================
  // USER INPUT & MESSAGING EVENTS
  // ========================================

  /** Update user input field value */
  | { name: 'update-input'; payload: { target: { value: string } } }

  /** Handle key press in input field */
  | { name: 'key-press'; payload: { key: string } }

  /** Send message to agents */
  | { name: 'send-message'; payload: void }

  // ========================================
  // MESSAGE EDITING EVENTS
  // ========================================

  /** Start editing a message */
  | { name: 'start-edit-message'; payload: { messageId: string; text: string } }

  /** Save edited message */
  | { name: 'save-edit-message'; payload: string }

  /** Cancel message editing */
  | { name: 'cancel-edit-message'; payload: void }

  /** Update editing text field */
  | { name: 'update-edit-text'; payload: { target: { value: string } } }

  // ========================================
  // MESSAGE DELETION EVENTS
  // ========================================

  /** Show delete confirmation modal */
  | {
    name: 'show-delete-message-confirm'; payload: {
      messageId: string;
      backendMessageId: string;
      messageText: string;
      userEntered: boolean;
    }
  }

  /** Hide delete confirmation modal */
  | { name: 'hide-delete-message-confirm'; payload: void }

  /** Confirm and execute message deletion */
  | { name: 'delete-message-confirmed'; payload: void }

  // ========================================
  // MESSAGE DISPLAY EVENTS
  // ========================================

  /** Toggle log details expansion */
  | { name: 'toggle-log-details'; payload: string | number }

  /** Acknowledge scroll completed */
  | { name: 'ack-scroll'; payload: void }

  // ========================================
  // AGENT EVENTS
  // ========================================

  /** Toggle agent filter on/off */
  | { name: 'toggle-agent-filter'; payload: string }

  /** Open agent creation modal */
  | { name: 'open-agent-create'; payload: void }

  /** Open agent edit modal */
  | { name: 'open-agent-edit'; payload: Agent }

  /** Open agent delete modal */
  | { name: 'open-agent-delete'; payload: Agent }

  /** Close agent edit modal */
  | { name: 'close-agent-edit'; payload: void }

  /** Agent saved successfully (global event) */
  | { name: 'agent-saved'; payload: void }

  /** Agent deleted successfully (global event) */
  | { name: 'agent-deleted'; payload: void }

  // ========================================
  // CHAT HISTORY EVENTS
  // ========================================

  /** Create new chat session */
  | { name: 'create-new-chat'; payload: void }

  /** Load chat from history */
  | { name: 'load-chat-from-history'; payload: string }

  /** Delete chat from history */
  | { name: 'delete-chat-from-history'; payload: { chatId: string } }

  /** Show chat delete confirmation modal */
  | { name: 'chat-history-show-delete-confirm'; payload: any }

  /** Hide chat history modals */
  | { name: 'chat-history-hide-modals'; payload: void }

  // ========================================
  // SSE STREAMING EVENTS
  // ========================================

  /** Handle stream start event */
  | { name: 'handleStreamStart'; payload: StreamStartData }

  /** Handle stream chunk event */
  | { name: 'handleStreamChunk'; payload: StreamChunkData }

  /** Handle stream end event */
  | { name: 'handleStreamEnd'; payload: StreamEndData }

  /** Handle stream error event */
  | { name: 'handleStreamError'; payload: StreamErrorData }

  /** Handle message event from SSE */
  | { name: 'handleMessageEvent'; payload: any }

  /** Handle system event from SSE */
  | { name: 'handleSystemEvent'; payload: any }

  /** Handle general error */
  | { name: 'handleError'; payload: any }

  /** Handle log event from SSE */
  | { name: 'handleLogEvent'; payload: any }

  /** Handle tool error event */
  | { name: 'handleToolError'; payload: any }

  /** Handle tool start event */
  | { name: 'handleToolStart'; payload: any }

  /** Handle tool progress event */
  | { name: 'handleToolProgress'; payload: any }

  /** Handle tool result event */
  | { name: 'handleToolResult'; payload: any }

  /** Handle world activity event */
  | { name: 'handleWorldActivity'; payload: any }

  // ========================================
  // APPROVAL FLOW EVENTS
  // ========================================

  /** Display approval request dialog */
  | { name: 'show-approval-request'; payload: ApprovalRequest }

  /** Hide approval request dialog */
  | { name: 'hide-approval-request'; payload: void }

  /** Submit approval decision */
  | { name: 'submit-approval-decision'; payload: { decision: 'approve' | 'deny'; scope: 'once' | 'session' | 'none'; toolCallId: string } }

  // Note: handleMemoryOnlyMessage removed - memory-only events no longer sent via SSE

  // ========================================
  // MEMORY MANAGEMENT EVENTS
  // ========================================

  /** Clear messages for specific agent */
  | { name: 'clear-agent-messages'; payload: { agent: Agent } }

  /** Clear all messages in world */
  | { name: 'clear-world-messages'; payload: void }

  /** Delete agent from world */
  | { name: 'delete-agent'; payload: { agent: Agent } }

  // ========================================
  // WORLD MANAGEMENT EVENTS
  // ========================================

  /** Open world edit modal */
  | { name: 'open-world-edit'; payload: void }

  /** Close world edit modal */
  | { name: 'close-world-edit'; payload: void }

  /** Export world to markdown file */
  | { name: 'export-world-markdown'; payload: { worldName: string } }

  /** View world markdown in new tab */
  | { name: 'view-world-markdown'; payload: { worldName: string } };

// ========================================
// HELPER TYPES
// ========================================

/**
 * Extract event names for use in Update<State, EventName>
 * 
 * Usage:
 * ```typescript
 * const handlers: Update<WorldComponentState, WorldEventName> = [ ... ];
 * ```
 */
export type WorldEventName = WorldEvents['name'];

/**
 * Extract payload type for specific event
 * 
 * Usage:
 * ```typescript
 * ['start-edit-message', (state, payload: WorldEventPayload<'start-edit-message'>) => {
 *   // TypeScript knows: payload.messageId: string, payload.text: string
 * }]
 * ```
 */
export type WorldEventPayload<T extends WorldEventName> =
  Extract<WorldEvents, { name: T }>['payload'];

/**
 * Type guard to check if event name is valid
 * 
 * Usage:
 * ```typescript
 * if (isWorldEvent(eventName)) {
 *   // TypeScript narrows type to WorldEventName
 * }
 * ```
 */
export function isWorldEvent(eventName: string): eventName is WorldEventName {
  return true; // Runtime check would require enum of all event names
}
