/**
 * MessageListPanel Narrated Tool-Call Visibility Tests
 *
 * Purpose:
 * - Ensure narrated assistant tool-call messages remain assistant-visible and are
 *   not merged away into tool result cards.
 *
 * Recent changes:
 * - 2026-03-01: Added coverage for narrated assistant tool-call rows remaining as assistant messages.
 */

import { describe, expect, it } from 'vitest';
import {
  buildCombinedRenderableMessages,
  isNarratedAssistantToolCallMessage,
} from '../../../electron/renderer/src/components/MessageListPanel';

describe('MessageListPanel narrated tool-call visibility', () => {
  it('detects narrated assistant tool-call rows as narrated messages', () => {
    const message = {
      role: 'assistant',
      content: 'I will write ./score.musicxml and then ask @engraver to render it.',
      tool_calls: [
        {
          id: 'call_write_1',
          type: 'function',
          function: {
            name: 'write_file',
            arguments: '{"filePath":"./score.musicxml","content":"<xml/>"}',
          },
        },
      ],
    };

    expect(isNarratedAssistantToolCallMessage(message)).toBe(true);
  });

  it('does not merge narrated assistant tool-call row with its tool result row', () => {
    const assistantPlanWithToolCall = {
      messageId: 'assistant-plan-1',
      role: 'assistant',
      sender: 'composer',
      content: 'I will write ./score.musicxml and then ask @engraver to render it.',
      tool_calls: [
        {
          id: 'call_write_1',
          type: 'function',
          function: {
            name: 'write_file',
            arguments: '{"filePath":"./score.musicxml","content":"<xml/>"}',
          },
        },
      ],
    };

    const toolResult = {
      messageId: 'tool-result-1',
      role: 'tool',
      tool_call_id: 'call_write_1',
      replyToMessageId: 'assistant-plan-1',
      content: '{"status":"success"}',
    };

    const merged = buildCombinedRenderableMessages([assistantPlanWithToolCall, toolResult]);

    expect(merged).toHaveLength(2);
    expect(merged[0]?.messageId).toBe('assistant-plan-1');
    expect(merged[0]?.combinedToolResults).toBeUndefined();
    expect(merged[1]?.messageId).toBe('tool-result-1');
  });

  it('still merges placeholder calling-tool assistant row with tool result', () => {
    const assistantCallingTool = {
      messageId: 'assistant-call-1',
      role: 'assistant',
      sender: 'composer',
      content: 'Calling tool: write_file',
      tool_calls: [
        {
          id: 'call_write_2',
          type: 'function',
          function: {
            name: 'write_file',
            arguments: '{"filePath":"./score.musicxml","content":"<xml/>"}',
          },
        },
      ],
    };

    const toolResult = {
      messageId: 'tool-result-2',
      role: 'tool',
      tool_call_id: 'call_write_2',
      replyToMessageId: 'assistant-call-1',
      content: '{"status":"success"}',
    };

    const merged = buildCombinedRenderableMessages([assistantCallingTool, toolResult]);

    expect(merged).toHaveLength(1);
    expect(merged[0]?.messageId).toBe('assistant-call-1');
    expect(Array.isArray(merged[0]?.combinedToolResults)).toBe(true);
    expect(merged[0]?.combinedToolResults).toHaveLength(1);
  });
});
