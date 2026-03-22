/**
 * Synthetic Assistant Tool Result Tests
 *
 * Purpose:
 * - Verify which enveloped tool results are eligible for persisted synthetic assistant rows.
 *
 * Key Features:
 * - Confirms `shell_cmd` display content is adopted into a synthetic assistant message.
 * - Confirms `load_skill` envelopes never produce synthetic assistant rows.
 *
 * Notes on Implementation:
 * - Uses serialized tool execution envelopes only; no storage, network, or filesystem access.
 *
 * Summary of Recent Changes:
 * - 2026-03-22: Added regression coverage so synthetic assistant adoption is driven by
 *   generic assistant-displayable tools like `shell_cmd`, not `load_skill`.
 */

import { describe, expect, it } from 'vitest';

import {
  createSyntheticAssistantToolResultMessage,
  extractSyntheticAssistantDisplayContentFromToolResult,
} from '../../core/synthetic-assistant-tool-result.js';
import { serializeToolExecutionEnvelope } from '../../core/tool-execution-envelope.js';

describe('synthetic assistant tool result adoption', () => {
  it('creates a synthetic assistant message for shell_cmd display content', () => {
    const serializedToolResult = serializeToolExecutionEnvelope({
      __type: 'tool_execution_envelope',
      version: 1,
      tool: 'shell_cmd',
      tool_call_id: 'call-shell-1',
      status: 'completed',
      preview: null,
      display_content: '![score](data:image/svg+xml;base64,AAAA)',
      result: 'status: success',
    });

    const displayContent = extractSyntheticAssistantDisplayContentFromToolResult(serializedToolResult);
    const message = createSyntheticAssistantToolResultMessage({
      serializedToolResult,
      sourceMessageId: 'msg-tool-1',
      replyToMessageId: 'msg-user-1',
      sender: 'agent-a',
      chatId: 'chat-1',
      agentId: 'agent-a',
    });

    expect(displayContent).toMatchObject({
      tool: 'shell_cmd',
      toolCallId: 'call-shell-1',
      content: '![score](data:image/svg+xml;base64,AAAA)',
    });
    expect(message?.role).toBe('assistant');
    expect(String(message?.content || '')).toContain('"tool":"shell_cmd"');
    expect(String(message?.content || '')).toContain('data:image/svg+xml;base64,AAAA');
  });

  it('creates a synthetic assistant message for shell_cmd html display content', () => {
    const serializedToolResult = serializeToolExecutionEnvelope({
      __type: 'tool_execution_envelope',
      version: 1,
      tool: 'shell_cmd',
      tool_call_id: 'call-shell-html',
      status: 'completed',
      preview: null,
      display_content: '<div><strong>Build complete.</strong></div>',
      result: 'status: success',
    });

    expect(extractSyntheticAssistantDisplayContentFromToolResult(serializedToolResult)).toMatchObject({
      tool: 'shell_cmd',
      toolCallId: 'call-shell-html',
      content: '<div><strong>Build complete.</strong></div>',
    });
  });

  it('does not create a synthetic assistant message from textual preview fallback alone', () => {
    const serializedToolResult = serializeToolExecutionEnvelope({
      __type: 'tool_execution_envelope',
      version: 1,
      tool: 'shell_cmd',
      tool_call_id: 'call-shell-preview-only',
      status: 'completed',
      preview: {
        kind: 'markdown',
        renderer: 'markdown',
        text: '### Command Execution\n\npreview-only fallback',
      },
      result: 'status: success',
    });

    expect(extractSyntheticAssistantDisplayContentFromToolResult(serializedToolResult)).toBeNull();
    expect(createSyntheticAssistantToolResultMessage({
      serializedToolResult,
      sourceMessageId: 'msg-tool-preview-only',
      replyToMessageId: 'msg-user-1',
      sender: 'agent-a',
      chatId: 'chat-1',
      agentId: 'agent-a',
    })).toBeNull();
  });

  it('does not create a synthetic assistant message for raw svg display content', () => {
    const serializedToolResult = serializeToolExecutionEnvelope({
      __type: 'tool_execution_envelope',
      version: 1,
      tool: 'shell_cmd',
      tool_call_id: 'call-shell-svg',
      status: 'completed',
      preview: null,
      display_content: '<svg viewBox="0 0 10 10"><circle cx="5" cy="5" r="4" /></svg>',
      result: 'status: success',
    });

    expect(extractSyntheticAssistantDisplayContentFromToolResult(serializedToolResult)).toBeNull();
  });

  it('does not create a synthetic assistant message for load_skill envelopes', () => {
    const serializedToolResult = serializeToolExecutionEnvelope({
      __type: 'tool_execution_envelope',
      version: 1,
      tool: 'load_skill',
      tool_call_id: 'call-load-skill-1',
      status: 'completed',
      preview: null,
      display_content: 'Loaded skill music-to-svg.',
      result: '<skill_context id="music-to-svg"></skill_context>',
    });

    expect(extractSyntheticAssistantDisplayContentFromToolResult(serializedToolResult)).toBeNull();
    expect(createSyntheticAssistantToolResultMessage({
      serializedToolResult,
      sourceMessageId: 'msg-tool-1',
      replyToMessageId: 'msg-user-1',
      sender: 'agent-a',
      chatId: 'chat-1',
      agentId: 'agent-a',
    })).toBeNull();
  });
});
