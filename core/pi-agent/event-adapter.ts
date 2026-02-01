/**
 * Event Adapter for Pi-AI Integration
 * 
 * Converts pi-ai streaming events to Agent-World SSE events.
 * 
 * Pi-AI Events:
 * - start: Stream starts with partial message
 * - text_start, text_delta, text_end: Text content streaming
 * - toolcall_start, toolcall_delta, toolcall_end: Tool call streaming
 * - thinking_start, thinking_delta, thinking_end: Reasoning streaming
 * - done: Stream complete with stop reason
 * - error: Stream error
 * 
 * Agent-World SSE Events:
 * - type: 'stream' - Text streaming
 * - type: 'tool_call' - Tool call detected
 * - type: 'error' - Error occurred
 */

import type { AssistantMessageEvent } from '@mariozechner/pi-ai';

export interface StreamEventData {
  type: 'stream' | 'tool_call' | 'error';
  content?: string;
  sender?: string;
  messageId?: string;
  toolName?: string;
  toolCallId?: string;
}

/**
 * Convert pi-ai streaming event to Agent-World SSE event
 */
export function adaptPiAiStreamEvent(
  event: AssistantMessageEvent,
  agentId: string,
  messageId: string
): StreamEventData | null {
  switch (event.type) {
    case 'text_delta':
      // Text streaming
      return {
        type: 'stream',
        content: event.delta,
        sender: agentId,
        messageId,
      };

    case 'toolcall_end':
      // Tool call detected
      return {
        type: 'tool_call',
        toolName: event.toolCall.name,
        toolCallId: event.toolCall.id,
        sender: agentId,
        messageId,
      };

    case 'error':
      // Error occurred
      return {
        type: 'error',
        content: (event as any).error?.message || 'Unknown error',
        sender: agentId,
        messageId,
      };

    // Ignore other event types for now
    case 'start':
    case 'text_start':
    case 'text_end':
    case 'thinking_start':
    case 'thinking_delta':
    case 'thinking_end':
    case 'toolcall_start':
    case 'toolcall_delta':
    case 'done':
      return null;

    default:
      return null;
  }
}

/**
 * Check if event should be published as SSE
 */
export function shouldPublishEvent(event: AssistantMessageEvent): boolean {
  return event.type === 'text_delta' || 
         event.type === 'toolcall_end' || 
         event.type === 'error';
}
