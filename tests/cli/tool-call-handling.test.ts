/**
 * Unit Tests for CLI Tool Call Handling
 * 
 * Tests the handleToolCallEvents function in cli/stream.ts
 * Covers approval request detection, tool call parsing, and edge cases
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { handleToolCallEvents } from '../../cli/stream.js';

describe('CLI Tool Call Handling', () => {
  let consoleLogSpy: any;
  let consoleErrorSpy: any;

  beforeEach(() => {
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => { });
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => { });
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  describe('handleToolCallEvents - Approval Requests', () => {
    it('should detect client.requestApproval tool call', () => {
      const eventData = {
        role: 'assistant',
        content: '',
        tool_calls: [{
          id: 'call_abc123',
          type: 'function',
          function: {
            name: 'client.requestApproval',
            arguments: JSON.stringify({
              originalToolCall: {
                name: 'execute_command',
                args: { command: 'rm -rf /' }
              },
              message: 'This command is dangerous',
              options: ['deny', 'approve_once', 'approve_session']
            })
          }
        }]
      };

      const result = handleToolCallEvents(eventData);

      expect(result).not.toBeNull();
      expect(result?.isApprovalRequest).toBe(true);
      expect(result?.approvalData).toBeDefined();
      expect(result?.approvalData.toolCallId).toBe('call_abc123');
      expect(result?.approvalData.toolName).toBe('execute_command');
      expect(result?.approvalData.toolArgs).toEqual({ command: 'rm -rf /' });
      expect(result?.approvalData.message).toBe('This command is dangerous');
      expect(result?.approvalData.options).toEqual(['deny', 'approve_once', 'approve_session']);
    });

    it('should handle approval request with minimal data', () => {
      const eventData = {
        role: 'assistant',
        tool_calls: [{
          id: 'call_xyz',
          function: {
            name: 'client.requestApproval',
            arguments: '{}'
          }
        }]
      };

      const result = handleToolCallEvents(eventData);

      expect(result?.isApprovalRequest).toBe(true);
      expect(result?.approvalData.toolName).toBe('Unknown tool');
      expect(result?.approvalData.toolArgs).toEqual({});
      expect(result?.approvalData.message).toBe('This tool requires approval to execute.');
      expect(result?.approvalData.options).toEqual(['deny', 'approve_once', 'approve_session']);
    });

    it('should handle approval request with missing arguments', () => {
      const eventData = {
        role: 'assistant',
        tool_calls: [{
          id: 'call_noargs',
          function: {
            name: 'client.requestApproval'
          }
        }]
      };

      const result = handleToolCallEvents(eventData);

      expect(result?.isApprovalRequest).toBe(true);
      expect(result?.approvalData.toolName).toBe('Unknown tool');
    });

    it('should handle invalid JSON in approval arguments', () => {
      const eventData = {
        role: 'assistant',
        tool_calls: [{
          id: 'call_bad',
          function: {
            name: 'client.requestApproval',
            arguments: 'not valid json {'
          }
        }]
      };

      const result = handleToolCallEvents(eventData);

      expect(result).toBeNull();
      expect(consoleErrorSpy).toHaveBeenCalled();
    });

    it('should return first approval request when multiple present', () => {
      const eventData = {
        role: 'assistant',
        tool_calls: [
          {
            id: 'call_1',
            function: {
              name: 'client.requestApproval',
              arguments: JSON.stringify({
                originalToolCall: { name: 'tool1' }
              })
            }
          },
          {
            id: 'call_2',
            function: {
              name: 'client.requestApproval',
              arguments: JSON.stringify({
                originalToolCall: { name: 'tool2' }
              })
            }
          }
        ]
      };

      const result = handleToolCallEvents(eventData);

      expect(result?.isApprovalRequest).toBe(true);
      expect(result?.approvalData.toolName).toBe('tool1');
    });
  });

  describe('handleToolCallEvents - Non-Approval Tool Calls', () => {
    it('should display non-approval tool calls', () => {
      const eventData = {
        role: 'assistant',
        tool_calls: [{
          id: 'call_tool',
          function: {
            name: 'execute_command',
            arguments: JSON.stringify({ command: 'ls -la' })
          }
        }]
      };

      const result = handleToolCallEvents(eventData);

      expect(result?.isApprovalRequest).toBe(false);
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('🔧')
      );
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('execute_command')
      );
    });

    it('should handle multiple non-approval tool calls', () => {
      const eventData = {
        role: 'assistant',
        tool_calls: [
          {
            id: 'call_1',
            function: { name: 'tool_one', arguments: '{}' }
          },
          {
            id: 'call_2',
            function: { name: 'tool_two', arguments: '{}' }
          }
        ]
      };

      const result = handleToolCallEvents(eventData);

      expect(result?.isApprovalRequest).toBe(false);
      expect(consoleLogSpy).toHaveBeenCalledTimes(2);
    });

    it('should not display client.requestApproval in non-approval tool list', () => {
      const eventData = {
        role: 'assistant',
        tool_calls: [
          {
            id: 'call_approval',
            function: {
              name: 'client.requestApproval',
              arguments: JSON.stringify({ originalToolCall: { name: 'test' } })
            }
          }
        ]
      };

      handleToolCallEvents(eventData);

      // Should not log the approval tool call
      expect(consoleLogSpy).not.toHaveBeenCalled();
    });

    it('should skip tool calls with no name', () => {
      const eventData = {
        role: 'assistant',
        tool_calls: [
          {
            id: 'call_noname',
            function: { arguments: '{}' }
          }
        ]
      };

      const result = handleToolCallEvents(eventData);

      expect(result?.isApprovalRequest).toBe(false);
      expect(consoleLogSpy).not.toHaveBeenCalled();
    });
  });

  describe('handleToolCallEvents - Edge Cases', () => {
    it('should return null for non-assistant messages', () => {
      const eventData = {
        role: 'user',
        content: 'Hello',
        tool_calls: [{
          function: { name: 'client.requestApproval' }
        }]
      };

      const result = handleToolCallEvents(eventData);
      expect(result).toBeNull();
    });

    it('should return null for assistant message without tool_calls', () => {
      const eventData = {
        role: 'assistant',
        content: 'I will help you'
      };

      const result = handleToolCallEvents(eventData);
      expect(result).toBeNull();
    });

    it('should return null for assistant message with null tool_calls', () => {
      const eventData = {
        role: 'assistant',
        content: 'Response',
        tool_calls: null
      };

      const result = handleToolCallEvents(eventData);
      expect(result).toBeNull();
    });

    it('should return null for assistant message with empty tool_calls array', () => {
      const eventData = {
        role: 'assistant',
        tool_calls: []
      };

      const result = handleToolCallEvents(eventData);
      // Empty array should return null since there are no tools to process
      expect(result).toBeNull();
    });

    it('should handle tool_calls that is not an array', () => {
      const eventData = {
        role: 'assistant',
        tool_calls: { not: 'an array' }
      };

      const result = handleToolCallEvents(eventData);
      expect(result).toBeNull();
    });

    it('should handle missing role', () => {
      const eventData = {
        tool_calls: [{
          function: { name: 'test_tool' }
        }]
      };

      const result = handleToolCallEvents(eventData);
      expect(result).toBeNull();
    });

    it('should handle empty eventData', () => {
      const result = handleToolCallEvents({});
      expect(result).toBeNull();
    });

    it('should handle null eventData gracefully', () => {
      const result = handleToolCallEvents(null);
      expect(result).toBeNull();
    });

    it('should handle undefined eventData gracefully', () => {
      const result = handleToolCallEvents(undefined);
      expect(result).toBeNull();
    });
  });

  describe('handleToolCallEvents - Mixed Scenarios', () => {
    it('should prioritize approval over non-approval tools', () => {
      const eventData = {
        role: 'assistant',
        tool_calls: [
          {
            id: 'call_regular',
            function: { name: 'regular_tool', arguments: '{}' }
          },
          {
            id: 'call_approval',
            function: {
              name: 'client.requestApproval',
              arguments: JSON.stringify({
                originalToolCall: { name: 'dangerous_tool' }
              })
            }
          }
        ]
      };

      const result = handleToolCallEvents(eventData);

      // Should return approval, not display regular tool
      expect(result?.isApprovalRequest).toBe(true);
      expect(result?.approvalData.toolName).toBe('dangerous_tool');
      expect(consoleLogSpy).not.toHaveBeenCalled();
    });

    it('should handle tool calls with complex arguments', () => {
      const complexArgs = {
        originalToolCall: {
          name: 'complex_tool',
          args: {
            nested: { deep: { value: 123 } },
            array: [1, 2, 3],
            string: 'test'
          }
        },
        message: 'Complex tool needs approval',
        options: ['deny', 'approve_once']
      };

      const eventData = {
        role: 'assistant',
        tool_calls: [{
          id: 'call_complex',
          function: {
            name: 'client.requestApproval',
            arguments: JSON.stringify(complexArgs)
          }
        }]
      };

      const result = handleToolCallEvents(eventData);

      expect(result?.isApprovalRequest).toBe(true);
      expect(result?.approvalData.toolArgs).toEqual(complexArgs.originalToolCall.args);
    });

    it('should handle tool calls with special characters in names', () => {
      const eventData = {
        role: 'assistant',
        tool_calls: [{
          id: 'call_special',
          function: {
            name: 'tool.with.dots',
            arguments: '{}'
          }
        }]
      };

      const result = handleToolCallEvents(eventData);

      expect(result?.isApprovalRequest).toBe(false);
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('tool.with.dots')
      );
    });
  });

  describe('handleToolCallEvents - Return Value Structure', () => {
    it('should return correct structure for approval requests', () => {
      const eventData = {
        role: 'assistant',
        tool_calls: [{
          id: 'call_test',
          function: {
            name: 'client.requestApproval',
            arguments: JSON.stringify({
              originalToolCall: { name: 'test_tool', args: { x: 1 } },
              message: 'Test message',
              options: ['deny', 'approve_once']
            })
          }
        }]
      };

      const result = handleToolCallEvents(eventData);

      expect(result).toMatchObject({
        isApprovalRequest: true,
        approvalData: {
          toolCallId: 'call_test',
          toolName: 'test_tool',
          toolArgs: { x: 1 },
          message: 'Test message',
          options: ['deny', 'approve_once']
        }
      });
    });

    it('should return correct structure for non-approval tools', () => {
      const eventData = {
        role: 'assistant',
        tool_calls: [{
          function: { name: 'regular_tool' }
        }]
      };

      const result = handleToolCallEvents(eventData);

      expect(result).toMatchObject({
        isApprovalRequest: false
      });
      expect(result?.approvalData).toBeUndefined();
    });
  });

  describe('handleToolCallEvents - Integration Scenarios', () => {
    it('should handle real OpenAI assistant message format', () => {
      const eventData = {
        role: 'assistant',
        content: '',
        tool_calls: [{
          id: 'call_FzR8xYqP8nB1aJxK2vN3mQwE',
          type: 'function',
          function: {
            name: 'client.requestApproval',
            arguments: '{"originalToolCall":{"name":"execute_shell_command","args":{"command":"rm important.txt","directory":"./"}},"message":"The command \'rm important.txt\' will permanently delete a file. Do you want to proceed?","options":["deny","approve_once","approve_session"]}'
          }
        }]
      };

      const result = handleToolCallEvents(eventData);

      expect(result?.isApprovalRequest).toBe(true);
      expect(result?.approvalData.toolName).toBe('execute_shell_command');
      expect(result?.approvalData.toolArgs.command).toBe('rm important.txt');
      expect(result?.approvalData.message).toContain('permanently delete');
    });

    it('should handle streaming SSE message event format', () => {
      const eventData = {
        type: 'message',
        role: 'assistant',
        sender: 'agent-123',
        agentName: 'TestAgent',
        content: '',
        tool_calls: [{
          id: 'approval_1730851200000_abc123',
          type: 'function',
          function: {
            name: 'client.requestApproval',
            arguments: JSON.stringify({
              originalToolCall: { name: 'dangerous_operation' },
              message: 'Approval required',
              options: ['deny', 'approve_once', 'approve_session']
            })
          }
        }],
        messageId: 'msg-456'
      };

      const result = handleToolCallEvents(eventData);

      expect(result?.isApprovalRequest).toBe(true);
      expect(result?.approvalData.toolCallId).toBe('approval_1730851200000_abc123');
    });
  });
});
