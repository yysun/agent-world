/**
 * Renderer Message Utils Tool Linking Tests
 * Purpose:
 * - Verify tool-result rows can recover linked assistant tool-request metadata.
 *
 * Key Features:
 * - Supports fallback linking when `tool_call_id` is absent.
 * - Prevents false linking when the parent message is not a tool request.
 *
 * Implementation Notes:
 * - Exercises pure utility behavior with deterministic in-memory fixtures.
 *
 * Summary of Recent Changes:
 * - 2026-03-01: Added ambiguity guard coverage for name-only fallback linking when multiple assistant tool requests exist.
 * - 2026-03-01: Added regression coverage for reply-linked tool rows missing `tool_call_id`.
 */

import { describe, expect, it } from 'vitest';
import { findToolRequestMessageForToolResult } from '../../../electron/renderer/src/utils/message-utils';

describe('findToolRequestMessageForToolResult', () => {
  it('returns reply-linked assistant request when tool_call_id is missing', () => {
    const assistantRequest = {
      messageId: 'assistant-1',
      role: 'assistant',
      tool_calls: [
        {
          id: 'call-shell-1',
          type: 'function',
          function: {
            name: 'shell_cmd',
            arguments: '{"command":"ls -la"}',
          },
        },
      ],
    };

    const toolResult = {
      messageId: 'tool-1',
      role: 'tool',
      replyToMessageId: 'assistant-1',
      toolName: 'shell_cmd',
      content: '{"status":"done"}',
    };

    const messages = [assistantRequest, toolResult];
    const messagesById = new Map<string, any>([
      ['assistant-1', assistantRequest],
      ['tool-1', toolResult],
    ]);

    const linked = findToolRequestMessageForToolResult(toolResult, messagesById, messages, 1);
    expect(linked).toBe(assistantRequest);
  });

  it('returns null when reply-linked parent is not a tool request', () => {
    const assistantMessage = {
      messageId: 'assistant-2',
      role: 'assistant',
      content: 'regular assistant message',
    };

    const toolResult = {
      messageId: 'tool-2',
      role: 'tool',
      replyToMessageId: 'assistant-2',
      toolName: 'shell_cmd',
      content: '{"status":"done"}',
    };

    const messages = [assistantMessage, toolResult];
    const messagesById = new Map<string, any>([
      ['assistant-2', assistantMessage],
      ['tool-2', toolResult],
    ]);

    const linked = findToolRequestMessageForToolResult(toolResult, messagesById, messages, 1);
    expect(linked).toBeNull();
  });

  it('returns null when name-only fallback is ambiguous across multiple assistant tool requests', () => {
    const assistantRequest1 = {
      messageId: 'assistant-a',
      role: 'assistant',
      tool_calls: [
        {
          id: 'call-shell-a',
          type: 'function',
          function: {
            name: 'shell_cmd',
            arguments: '{"command":"echo","parameters":["a"]}',
          },
        },
      ],
    };

    const assistantRequest2 = {
      messageId: 'assistant-b',
      role: 'assistant',
      tool_calls: [
        {
          id: 'call-shell-b',
          type: 'function',
          function: {
            name: 'shell_cmd',
            arguments: '{"command":"echo","parameters":["b"]}',
          },
        },
      ],
    };

    const toolResult = {
      messageId: 'tool-3',
      role: 'tool',
      toolName: 'shell_cmd',
      content: '{"status":"done"}',
    };

    const messages = [assistantRequest1, assistantRequest2, toolResult];
    const messagesById = new Map<string, any>([
      ['assistant-a', assistantRequest1],
      ['assistant-b', assistantRequest2],
      ['tool-3', toolResult],
    ]);

    const linked = findToolRequestMessageForToolResult(toolResult, messagesById, messages, 2);
    expect(linked).toBeNull();
  });
});
