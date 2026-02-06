/**
 * Unit tests for message preparation utilities
 * 
 * Tests:
 * - parseMessageContent() with enhanced string protocol
 * - Tool result detection and conversion
 * - Backward compatibility with regular text
 * - Error handling for invalid JSON
 */

import { describe, it, expect } from 'vitest';
import { parseMessageContent, filterClientSideMessages } from '../../core/message-prep.js';
import type { ChatMessage } from '../../core/types.js';

describe('parseMessageContent', () => {
  describe('Enhanced String Protocol - Tool Results', () => {
    it('should parse tool_result format to OpenAI ChatMessage', () => {
      const content = JSON.stringify({
        __type: 'tool_result',
        tool_call_id: 'approval_abc123',
        content: JSON.stringify({
          decision: 'approve',
          scope: 'session',
          toolName: 'shell_cmd'
        })
      });

      const { message: result, targetAgentId } = parseMessageContent(content);

      expect(result.role).toBe('tool');
      expect(result.tool_call_id).toBe('approval_abc123');
      expect(result.content).toBe(JSON.stringify({
        decision: 'approve',
        scope: 'session',
        toolName: 'shell_cmd'
      }));
      expect(result.createdAt).toBeInstanceOf(Date);
    });

    it('should handle tool_result with empty content', () => {
      const content = JSON.stringify({
        __type: 'tool_result',
        tool_call_id: 'approval_xyz',
        content: ''
      });

      const { message: result, targetAgentId } = parseMessageContent(content);

      expect(result.role).toBe('tool');
      expect(result.tool_call_id).toBe('approval_xyz');
      expect(result.content).toBe('');
    });

    it('should handle tool_result with missing content field', () => {
      const content = JSON.stringify({
        __type: 'tool_result',
        tool_call_id: 'approval_xyz'
      });

      const { message: result, targetAgentId } = parseMessageContent(content);

      expect(result.role).toBe('tool');
      expect(result.tool_call_id).toBe('approval_xyz');
      expect(result.content).toBe('');
    });

    it('should fall back to default role if tool_call_id missing', () => {
      const content = JSON.stringify({
        __type: 'tool_result',
        content: 'some content'
      });

      const { message: result, targetAgentId } = parseMessageContent(content);

      expect(result.role).toBe('user');
      expect(result.content).toBe(content);
    });

    it('should use assistant role when specified', () => {
      const content = JSON.stringify({
        __type: 'tool_result',
        content: 'some content'
      });

      const { message: result, targetAgentId } = parseMessageContent(content, 'assistant');

      expect(result.role).toBe('assistant');
      expect(result.content).toBe(content);
    });
  });

  describe('Backward Compatibility - Regular Text', () => {
    it('should handle regular text as user message', () => {
      const content = 'Hello world';

      const { message: result, targetAgentId } = parseMessageContent(content);

      expect(result.role).toBe('user');
      expect(result.content).toBe('Hello world');
      expect(result.createdAt).toBeInstanceOf(Date);
    });

    it('should handle regular text with assistant role', () => {
      const content = 'Assistant response';

      const { message: result, targetAgentId } = parseMessageContent(content, 'assistant');

      expect(result.role).toBe('assistant');
      expect(result.content).toBe('Assistant response');
    });

    it('should handle approval text format (legacy)', () => {
      const content = 'approve shell_cmd for session';

      const { message: result, targetAgentId } = parseMessageContent(content);

      expect(result.role).toBe('user');
      expect(result.content).toBe('approve shell_cmd for session');
    });

    it('should handle deny text format (legacy)', () => {
      const content = 'deny file_write';

      const { message: result, targetAgentId } = parseMessageContent(content);

      expect(result.role).toBe('user');
      expect(result.content).toBe('deny file_write');
    });
  });

  describe('JSON Without __type Marker', () => {
    it('should treat JSON without __type as regular content', () => {
      const content = JSON.stringify({
        message: 'some data',
        value: 123
      });

      const { message: result, targetAgentId } = parseMessageContent(content);

      expect(result.role).toBe('user');
      expect(result.content).toBe(content);
    });

    it('should handle empty JSON object', () => {
      const content = '{}';

      const { message: result, targetAgentId } = parseMessageContent(content);

      expect(result.role).toBe('user');
      expect(result.content).toBe('{}');
    });
  });

  describe('Error Handling - Invalid JSON', () => {
    it('should handle invalid JSON', () => {
      const content = '{invalid json';

      const { message: result, targetAgentId } = parseMessageContent(content);

      expect(result.role).toBe('user');
      expect(result.content).toBe('{invalid json');
    });

    it('should handle empty string', () => {
      const content = '';

      const { message: result, targetAgentId } = parseMessageContent(content);

      expect(result.role).toBe('user');
      expect(result.content).toBe('');
    });

    it('should handle non-JSON with special characters', () => {
      const content = 'This is {not] valid JSON';

      const { message: result, targetAgentId } = parseMessageContent(content);

      expect(result.role).toBe('user');
      expect(result.content).toBe('This is {not] valid JSON');
    });
  });

  describe('Edge Cases', () => {
    it('should handle JSON array', () => {
      const content = '[1, 2, 3]';

      const { message: result, targetAgentId } = parseMessageContent(content);

      expect(result.role).toBe('user');
      expect(result.content).toBe('[1, 2, 3]');
    });

    it('should handle JSON string primitive', () => {
      const content = '"just a string"';

      const { message: result, targetAgentId } = parseMessageContent(content);

      expect(result.role).toBe('user');
      expect(result.content).toBe('"just a string"');
    });

    it('should handle tool_result with unknown __type', () => {
      const content = JSON.stringify({
        __type: 'unknown_type',
        data: 'some data'
      });

      const { message: result, targetAgentId } = parseMessageContent(content);

      expect(result.role).toBe('user');
      expect(result.content).toBe(content);
    });
  });
});

describe('filterClientSideMessages', () => {
  it('should remove client.* tool calls', () => {
    const messages: ChatMessage[] = [
      { role: 'user', content: 'Hello' },
      {
        role: 'assistant',
        content: '',
        tool_calls: [
          { id: 'call_1', type: 'function', function: { name: 'client.requestApproval', arguments: '{}' } },
          { id: 'call_2', type: 'function', function: { name: 'shell_cmd', arguments: '{}' } }
        ]
      }
    ];

    const result = filterClientSideMessages(messages);

    expect(result).toHaveLength(2);
    expect(result[1].tool_calls).toHaveLength(1);
    expect(result[1].tool_calls![0].function.name).toBe('shell_cmd');
  });

  it('should drop assistant messages with only client.* tool calls', () => {
    const messages: ChatMessage[] = [
      { role: 'user', content: 'Hello' },
      {
        role: 'assistant',
        content: '',
        tool_calls: [
          { id: 'call_1', type: 'function', function: { name: 'client.requestApproval', arguments: '{}' } }
        ]
      }
    ];

    const result = filterClientSideMessages(messages);

    expect(result).toHaveLength(1);
    expect(result[0].role).toBe('user');
  });


  it('should not mutate original messages', () => {
    const messages: ChatMessage[] = [
      {
        role: 'assistant',
        content: 'test',
        tool_calls: [
          { id: 'call_1', type: 'function', function: { name: 'client.requestApproval', arguments: '{}' } }
        ]
      }
    ];

    filterClientSideMessages(messages);

    // Original should be unchanged
    expect(messages[0].tool_calls).toHaveLength(1);
    expect(messages[0].tool_calls![0].function.name).toBe('client.requestApproval');
  });
});
