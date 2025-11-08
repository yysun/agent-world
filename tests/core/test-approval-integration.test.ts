/**
 * Integration Test: Message-Based Approval Response Handling
 * 
 * Purpose: Test end-to-end approval flow with message processing
 * 
 * This test verifies that when a user provides approval in a chat message,
 * the system can:
 * 1. Parse the approval response from natural language
 * 2. Allow tool execution based on the approval
 * 3. Handle both one-time and session approvals correctly
 * 
 * Created: Phase 8 - Message processing approval response handling
 */

import { describe, it, expect } from 'vitest';
import { checkToolApproval } from '../../core/events.js';
import { wrapToolWithValidation } from '../../core/tool-utils.js';
import { createMockWorld } from '../__mocks__/mock-world.js';
import type { AgentMessage } from '../../core/types.js';

describe('Message-Based Approval Response Integration', () => {
  describe('Tool Execution with Message-Based Approval', () => {
    it('should allow tool execution after user provides approval in chat', async () => {
      // Arrange: Mock tool that requires approval
      const mockTool = {
        name: 'dangerous-command',
        description: 'Execute a dangerous command',
        approval: {
          required: true,
          message: 'This command is dangerous'
        },
        execute: async (args: any) => {
          return `Executed dangerous command: ${args.command}`;
        }
      };

      const wrappedTool = wrapToolWithValidation(mockTool, 'dangerous-command');
      const mockWorld = createMockWorld();

      // Messages showing user approval flow (session approval)
      const messages: AgentMessage[] = [
        {
          role: 'user',
          content: 'Please delete all my temporary files',
          createdAt: new Date(Date.now() - 10000),
          messageId: 'user-request-1'
        },
        {
          role: 'assistant',
          content: 'I need your approval to execute the dangerous-command tool',
          createdAt: new Date(Date.now() - 8000),
          messageId: 'approval-request-1'
        },
        {
          role: 'user',
          content: 'I approve_session for dangerous-command',
          createdAt: new Date(Date.now() - 5000),
          messageId: 'user-approval-1'
        }
      ];

      const context = {
        world: mockWorld,
        messages: messages
      };

      // Act: Execute tool with approval context
      const result = await wrappedTool.execute(
        { command: 'rm -rf /tmp/*' },
        undefined,
        undefined,
        context
      );

      // Assert: Tool should execute successfully
      expect(result).toBe('Executed dangerous command: rm -rf /tmp/*');
      expect(typeof result).toBe('string');
      expect(result).not.toHaveProperty('type');
      expect(result).not.toHaveProperty('approvalRequest');
    });

    it('should return approval request when no approval exists', async () => {
      // Arrange: Mock tool that requires approval
      const mockTool = {
        name: 'dangerous-command',
        description: 'Execute a dangerous command',
        approval: {
          required: true,
          message: 'This command is dangerous'
        },
        execute: async (args: any) => {
          return `Executed dangerous command: ${args.command}`;
        }
      };

      const wrappedTool = wrapToolWithValidation(mockTool, 'dangerous-command');
      const mockWorld = createMockWorld();

      // Messages without any approval
      const messages: AgentMessage[] = [
        {
          role: 'user',
          content: 'Please delete all my temporary files',
          createdAt: new Date(),
          messageId: 'user-request-1'
        }
      ];

      const context = {
        world: mockWorld,
        messages: messages
      };

      // Act: Execute tool without approval
      const result = await wrappedTool.execute(
        { command: 'rm -rf /tmp/*' },
        undefined,
        undefined,
        context
      );

      // Assert: Should return approval request with stop processing marker
      expect(result).toHaveProperty('_stopProcessing', true);
      expect(result).toHaveProperty('_approvalMessage');
      expect(result._approvalMessage).toHaveProperty('role', 'assistant');
      expect(result._approvalMessage).toHaveProperty('tool_calls');
      expect(result._approvalMessage.tool_calls).toHaveLength(1);
      expect(result._approvalMessage.tool_calls[0].function.name).toBe('client.requestApproval');

      const approvalArgs = JSON.parse(result._approvalMessage.tool_calls[0].function.arguments);
      expect(approvalArgs.originalToolCall.name).toBe('dangerous-command');
      expect(approvalArgs.options).toContain('deny');
      expect(approvalArgs.options).toContain('approve_once');
      expect(approvalArgs.options).toContain('approve_session');
    });

    it('should request approval again if no session approval exists (denial not cached)', async () => {
      // Note: In the new simplified logic, denials are not cached.
      // Users should be allowed to change their mind about denials.
      
      // Arrange: Mock tool that requires approval
      const mockTool = {
        name: 'dangerous-command',
        description: 'Execute a dangerous command',
        approval: {
          required: true,
          message: 'This command is dangerous'
        },
        execute: async (args: any) => {
          return `Executed dangerous command: ${args.command}`;
        }
      };

      const wrappedTool = wrapToolWithValidation(mockTool, 'dangerous-command');
      const mockWorld = createMockWorld();

      // Messages showing denial (but denial is not cached)
      const messages: AgentMessage[] = [
        {
          role: 'user',
          content: 'I deny the dangerous-command execution',
          createdAt: new Date(),
          messageId: 'user-denial-1'
        }
      ];

      const context = {
        world: mockWorld,
        messages: messages
      };

      // Act: Execute tool after denial - should request approval again
      const result = await wrappedTool.execute(
        { command: 'rm -rf /tmp/*' },
        undefined,
        undefined,
        context
      );

      // Assert: Should return approval request (not cached denial)
      expect(typeof result).toBe('object');
      expect(result.type).toBe('approval_request');
      expect(result.approvalRequest).toBeDefined();
    });

    it('should persist session approval across multiple tool calls', async () => {
      // Arrange: Mock tool that requires approval
      const mockTool = {
        name: 'file-operations',
        description: 'Perform file operations',
        approval: {
          required: true,
          message: 'This tool modifies files'
        },
        execute: async (args: any) => {
          return `File operation completed: ${args.operation}`;
        }
      };

      const wrappedTool = wrapToolWithValidation(mockTool, 'file-operations');
      const mockWorld = createMockWorld();

      // Messages showing session approval
      const messages: AgentMessage[] = [
        {
          role: 'user',
          content: 'I approve the file-operations tool for this session',
          createdAt: new Date(Date.now() - 10000),
          messageId: 'session-approval-1'
        },
        {
          role: 'assistant',
          content: 'File operation completed: create',
          createdAt: new Date(Date.now() - 8000),
          messageId: 'tool-result-1'
        }
      ];

      const context = {
        world: mockWorld,
        messages: messages
      };

      // Act: Execute tool multiple times with session approval
      const result1 = await wrappedTool.execute(
        { operation: 'read' },
        undefined,
        undefined,
        context
      );

      const result2 = await wrappedTool.execute(
        { operation: 'write' },
        undefined,
        undefined,
        context
      );

      // Assert: Both should execute successfully due to session approval
      expect(result1).toBe('File operation completed: read');
      expect(result2).toBe('File operation completed: write');
      expect(typeof result1).toBe('string');
      expect(typeof result2).toBe('string');
    });
  });

  describe('Approval Response Processing', () => {
    it('should integrate with natural language approval patterns (session approval only)', async () => {
      const mockWorld = createMockWorld();

      // Test session approval patterns (one-time and denial are no longer cached)
      const testCases = [
        {
          pattern: 'Yes, approve test-tool for this session',
          expectApproval: true,
          description: 'session approval phrase'
        },
        {
          pattern: 'Approve test-tool for session',
          expectApproval: true,
          description: 'session approval phrase'
        },
        {
          pattern: 'approve_session for test-tool',
          expectApproval: true,
          description: 'session approval keyword'
        },
        {
          pattern: 'I approve the test-tool execution once',
          expectApproval: false,
          description: 'one-time approval (no longer cached)'
        },
        {
          pattern: 'I deny the test-tool execution',
          expectApproval: false,
          description: 'denial (no longer cached)'
        }
      ];

      for (const testCase of testCases) {
        const messages: AgentMessage[] = [
          {
            role: 'user',
            content: testCase.pattern,
            createdAt: new Date(),
            messageId: `approval-${Date.now()}`
          }
        ];

        const result = await checkToolApproval(
          mockWorld,
          'test-tool',
          {},
          'Test tool execution',
          messages
        );

        if (testCase.expectApproval) {
          // Should allow execution without further approval
          expect(result.canExecute).toBe(true);
          expect(result.needsApproval).toBe(false);
        } else {
          // Should request approval (no caching for denials/one-time)
          expect(result.needsApproval).toBe(true);
          expect(result.canExecute).toBe(false);
          expect(result.approvalRequest).toBeDefined();
        }
      }
    });
  });
});