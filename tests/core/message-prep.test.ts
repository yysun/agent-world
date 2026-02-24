/**
 * Purpose: Verify message preparation utilities for protocol and plain-text inputs.
 * Key features:
 * - Validates parseMessageContent() for tool_result envelopes and standard text
 * - Validates filterClientSideMessages() for client.* tool-call stripping behavior
 * Implementation notes:
 * - Uses OpenAI-style ChatMessage fixtures with mixed assistant/tool sequences
 * - Asserts ordering and orphaned tool-message cleanup after filtering
 * Recent changes:
 * - 2026-02-11: Added regression coverage for unresolved assistant tool_calls cleanup.
 * - Removed legacy decision-flow wording and switched to neutral client tool names
 */

import { describe, it, expect } from 'vitest';
import { parseMessageContent, filterClientSideMessages } from '../../core/message-prep.js';
import type { ChatMessage } from '../../core/types.js';

describe('parseMessageContent', () => {
  describe('Enhanced String Protocol - Tool Results', () => {
    it('should parse tool_result format to OpenAI ChatMessage', () => {
      const content = JSON.stringify({
        __type: 'tool_result',
        tool_call_id: 'call_abc123',
        content: JSON.stringify({
          status: 'completed',
          toolName: 'shell_cmd'
        })
      });

      const { message: result, targetAgentId } = parseMessageContent(content);

      expect(result.role).toBe('tool');
      expect(result.tool_call_id).toBe('call_abc123');
      expect(result.content).toBe(JSON.stringify({
        status: 'completed',
        toolName: 'shell_cmd'
      }));
      expect(result.createdAt).toBeInstanceOf(Date);
    });

    it('should handle tool_result with empty content', () => {
      const content = JSON.stringify({
        __type: 'tool_result',
        tool_call_id: 'call_xyz',
        content: ''
      });

      const { message: result, targetAgentId } = parseMessageContent(content);

      expect(result.role).toBe('tool');
      expect(result.tool_call_id).toBe('call_xyz');
      expect(result.content).toBe('');
    });

    it('should handle tool_result with missing content field', () => {
      const content = JSON.stringify({
        __type: 'tool_result',
        tool_call_id: 'call_xyz'
      });

      const { message: result, targetAgentId } = parseMessageContent(content);

      expect(result.role).toBe('tool');
      expect(result.tool_call_id).toBe('call_xyz');
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

    it('should handle command-like text format (legacy)', () => {
      const content = 'run shell_cmd in current directory';

      const { message: result, targetAgentId } = parseMessageContent(content);

      expect(result.role).toBe('user');
      expect(result.content).toBe('run shell_cmd in current directory');
    });

    it('should handle cancellation-like text format (legacy)', () => {
      const content = 'cancel file_write';

      const { message: result, targetAgentId } = parseMessageContent(content);

      expect(result.role).toBe('user');
      expect(result.content).toBe('cancel file_write');
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
          { id: 'call_1', type: 'function', function: { name: 'client.localAction', arguments: '{}' } },
          { id: 'call_2', type: 'function', function: { name: 'shell_cmd', arguments: '{}' } }
        ]
      },
      { role: 'tool', tool_call_id: 'call_2', content: 'ok' }
    ];

    const result = filterClientSideMessages(messages);

    expect(result).toHaveLength(3);
    expect(result[1].tool_calls).toHaveLength(1);
    expect(result[1].tool_calls![0].function.name).toBe('shell_cmd');
    expect(result[2].role).toBe('tool');
    expect(result[2].tool_call_id).toBe('call_2');
  });

  it('should drop assistant messages with only client.* tool calls', () => {
    const messages: ChatMessage[] = [
      { role: 'user', content: 'Hello' },
      {
        role: 'assistant',
        content: '',
        tool_calls: [
          { id: 'call_1', type: 'function', function: { name: 'client.localAction', arguments: '{}' } }
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
          { id: 'call_1', type: 'function', function: { name: 'client.localAction', arguments: '{}' } }
        ]
      }
    ];

    filterClientSideMessages(messages);

    // Original should be unchanged
    expect(messages[0].tool_calls).toHaveLength(1);
    expect(messages[0].tool_calls![0].function.name).toBe('client.localAction');
  });

  it('should filter out orphaned tool messages for removed client.* tool calls', () => {
    const messages: ChatMessage[] = [
      { role: 'user', content: 'Hello' },
      {
        role: 'assistant',
        content: '',
        tool_calls: [
          { id: 'call_client', type: 'function', function: { name: 'client.localAction', arguments: '{}' } }
        ]
      },
      { role: 'tool', tool_call_id: 'call_client', content: 'client action complete' }
    ];

    const result = filterClientSideMessages(messages);

    // Should only have the user message (assistant dropped, tool message dropped)
    expect(result).toHaveLength(1);
    expect(result[0].role).toBe('user');
  });

  it('should keep tool messages for valid (non-client.*) tool calls', () => {
    const messages: ChatMessage[] = [
      { role: 'user', content: 'Hello' },
      {
        role: 'assistant',
        content: '',
        tool_calls: [
          { id: 'call_1', type: 'function', function: { name: 'client.localAction', arguments: '{}' } },
          { id: 'call_2', type: 'function', function: { name: 'shell_cmd', arguments: '{}' } }
        ]
      },
      { role: 'tool', tool_call_id: 'call_1', content: 'client action complete' },
      { role: 'tool', tool_call_id: 'call_2', content: 'command executed' }
    ];

    const result = filterClientSideMessages(messages);

    // Should have: user message, assistant (with shell_cmd only), tool message for shell_cmd
    expect(result).toHaveLength(3);
    expect(result[0].role).toBe('user');
    expect(result[1].role).toBe('assistant');
    expect(result[1].tool_calls).toHaveLength(1);
    expect(result[1].tool_calls![0].function.name).toBe('shell_cmd');
    expect(result[2].role).toBe('tool');
    expect(result[2].tool_call_id).toBe('call_2');
  });

  it('should handle complex message sequences with multiple assistants and tools', () => {
    const messages: ChatMessage[] = [
      { role: 'user', content: 'Start' },
      {
        role: 'assistant',
        content: 'Calling tools',
        tool_calls: [
          { id: 'call_1', type: 'function', function: { name: 'real_tool', arguments: '{}' } }
        ]
      },
      { role: 'tool', tool_call_id: 'call_1', content: 'result 1' },
      {
        role: 'assistant',
        content: '',
        tool_calls: [
          { id: 'call_2', type: 'function', function: { name: 'client.localSignal', arguments: '{}' } }
        ]
      },
      { role: 'tool', tool_call_id: 'call_2', content: 'signal delivered' },
      {
        role: 'assistant',
        content: 'Final step',
        tool_calls: [
          { id: 'call_3', type: 'function', function: { name: 'another_tool', arguments: '{}' } },
          { id: 'call_4', type: 'function', function: { name: 'client.notify', arguments: '{}' } }
        ]
      },
      { role: 'tool', tool_call_id: 'call_3', content: 'result 3' },
      { role: 'tool', tool_call_id: 'call_4', content: 'notified' }
    ];

    const result = filterClientSideMessages(messages);

    // Expected: user, assistant(real_tool), tool(call_1), assistant(another_tool), tool(call_3)
    expect(result).toHaveLength(5);
    expect(result[0].role).toBe('user');
    expect(result[1].role).toBe('assistant');
    expect(result[1].tool_calls![0].function.name).toBe('real_tool');
    expect(result[2].role).toBe('tool');
    expect(result[2].tool_call_id).toBe('call_1');
    expect(result[3].role).toBe('assistant');
    expect(result[3].tool_calls).toHaveLength(1);
    expect(result[3].tool_calls![0].function.name).toBe('another_tool');
    expect(result[4].role).toBe('tool');
    expect(result[4].tool_call_id).toBe('call_3');
  });

  it('should preserve message order after filtering', () => {
    const messages: ChatMessage[] = [
      { role: 'user', content: 'First' },
      {
        role: 'assistant',
        content: '',
        tool_calls: [
          { id: 'call_1', type: 'function', function: { name: 'client.localSignal', arguments: '{}' } }
        ]
      },
      { role: 'tool', tool_call_id: 'call_1', content: 'signal delivered' },
      { role: 'user', content: 'Second' },
      {
        role: 'assistant',
        content: '',
        tool_calls: [
          { id: 'call_2', type: 'function', function: { name: 'real_tool', arguments: '{}' } }
        ]
      },
      { role: 'tool', tool_call_id: 'call_2', content: 'result' }
    ];

    const result = filterClientSideMessages(messages);

    // Should be: user(First), user(Second), assistant(real_tool), tool(call_2)
    expect(result).toHaveLength(4);
    expect(result[0].content).toBe('First');
    expect(result[1].content).toBe('Second');
    expect(result[2].tool_calls![0].function.name).toBe('real_tool');
    expect(result[3].tool_call_id).toBe('call_2');
  });

  it('should drop tool messages without tool_call_id (invalid data)', () => {
    const messages: ChatMessage[] = [
      { role: 'user', content: 'Hello' },
      {
        role: 'assistant',
        content: '',
        tool_calls: [
          { id: 'call_1', type: 'function', function: { name: 'shell_cmd', arguments: '{}' } }
        ]
      },
      { role: 'tool', content: 'some result' } as ChatMessage // Missing tool_call_id
    ];

    const result = filterClientSideMessages(messages);

    // Should drop the invalid tool message and unresolved assistant tool_call
    expect(result).toHaveLength(1);
    expect(result[0].role).toBe('user');
  });

  it('should drop tool messages that lack matching assistant tool_calls (legacy data)', () => {
    const messages: ChatMessage[] = [
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Calling tool' }, // No tool_calls field (legacy data)
      { role: 'tool', tool_call_id: 'orphaned_call', content: 'some result' },
      { role: 'assistant', content: 'Done' }
    ];

    const result = filterClientSideMessages(messages);

    // Should drop the orphaned tool message
    expect(result).toHaveLength(3);
    expect(result[0].role).toBe('user');
    expect(result[1].role).toBe('assistant');
    expect(result[1].content).toBe('Calling tool');
    expect(result[2].role).toBe('assistant');
    expect(result[2].content).toBe('Done');
  });

  it('should handle mixed valid and invalid tool messages', () => {
    const messages: ChatMessage[] = [
      {
        role: 'assistant',
        content: '',
        tool_calls: [
          { id: 'valid_call', type: 'function', function: { name: 'real_tool', arguments: '{}' } }
        ]
      },
      { role: 'tool', tool_call_id: 'valid_call', content: 'valid result' },
      { role: 'tool', tool_call_id: 'invalid_call', content: 'orphaned result' },
      { role: 'tool', content: 'missing tool_call_id' } as ChatMessage
    ];

    const result = filterClientSideMessages(messages);

    // Should only keep assistant and valid tool message
    expect(result).toHaveLength(2);
    expect(result[0].role).toBe('assistant');
    expect(result[1].role).toBe('tool');
    expect(result[1].tool_call_id).toBe('valid_call');
  });

  it('should prune unresolved assistant tool_calls that have no matching tool results', () => {
    const messages: ChatMessage[] = [
      {
        role: 'assistant',
        content: 'Calling tools',
        tool_calls: [
          { id: 'call_resolved', type: 'function', function: { name: 'shell_cmd', arguments: '{}' } },
          { id: 'call_unresolved', type: 'function', function: { name: 'read_file', arguments: '{}' } }
        ]
      },
      { role: 'tool', tool_call_id: 'call_resolved', content: 'ok' },
      { role: 'assistant', content: 'Done' }
    ];

    const result = filterClientSideMessages(messages);

    expect(result).toHaveLength(3);
    expect(result[0].role).toBe('assistant');
    expect(result[0].tool_calls).toHaveLength(1);
    expect(result[0].tool_calls![0].id).toBe('call_resolved');
    expect(result[1].role).toBe('tool');
    expect(result[1].tool_call_id).toBe('call_resolved');
    expect(result[2].role).toBe('assistant');
    expect(result[2].content).toBe('Done');
  });
});
