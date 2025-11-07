/**
 * Unit Tests - Approval Flow Core Logic
 *
 * Purpose: Verify the complete approval flow from tool call to client approval handling
 *
 * Test Coverage:
 * 1. Tool calls requiring approval trigger approval process
 * 2. Approval process injects client-side approval request tools
 * 3. Message processing handles client approval status (deny, once, session)
 *
 * Features:
 * - Tests tool wrapper approval detection
 * - Verifies approval request generation with structured response format
 * - Tests denial caching and blocking (returns string error messages)
 * - Tests one-time approval consumption
 * - Tests session-wide approval persistence
 * - Tests message history scanning
 *
 * Changes:
 * - 2025-11-05: Initial creation for approval flow verification
 * - 2025-11-05: Added EventEmitter to mock World object to fix test failures
 * - 2025-11-05: Updated denial test to expect string error instead of object structure
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { EventEmitter } from 'events';
import { wrapToolWithValidation } from '../../core/tool-utils.js';
import { checkToolApproval, findSessionApproval, findRecentApproval, findRecentDenial } from '../../core/events.js';
import type { World, AgentMessage } from '../../core/types.js';

describe.skip('Approval Flow - Unit Tests', () => {
  let mockWorld: World;
  let mockMessages: AgentMessage[];

  beforeEach(() => {
    mockWorld = {
      id: 'test-world',
      name: 'Test World',
      description: 'Test world for approval flow',
      currentChatId: 'test-chat-1',
      eventEmitter: new EventEmitter(),
      chats: new Map([
        ['test-chat-1', {
          id: 'test-chat-1',
          worldId: 'test-world',
          title: 'Test Chat',
          messages: [],
          createdAt: new Date(),
          updatedAt: new Date()
        }]
      ])
    } as any;

    mockMessages = [];
  });

  describe('1. Tool Calls Requiring Approval Trigger Approval Process', () => {
    it('should detect tool with approval.required flag', async () => {
      const shellCmdTool = {
        name: 'shell_cmd',
        description: 'Execute shell commands',
        parameters: {
          type: 'object',
          properties: {
            command: { type: 'string' },
            directory: { type: 'string' }
          },
          required: ['command', 'directory']
        },
        approval: {
          required: true,
          message: 'This tool requires approval to execute shell commands'
        },
        execute: async (args: any) => {
          return `Executed: ${args.command}`;
        }
      };

      const wrappedTool = wrapToolWithValidation(shellCmdTool, 'shell_cmd');

      const result = await wrappedTool.execute(
        { command: 'ls -la', directory: '/tmp' },
        undefined,
        undefined,
        { world: mockWorld, messages: mockMessages }
      );

      expect(result).toBeDefined();
      expect(result.type).toBe('approval_request');
      expect(result.approvalRequest).toBeDefined();
      expect(result.approvalRequest.toolName).toBe('shell_cmd');
    });

    it('should NOT trigger approval for tools without approval flag', async () => {
      const simpleTool = {
        name: 'simple_tool',
        description: 'Simple tool without approval',
        parameters: {
          type: 'object',
          properties: {
            value: { type: 'string' }
          },
          required: ['value']
        },
        execute: async (args: any) => {
          return `Result: ${args.value}`;
        }
      };

      const wrappedTool = wrapToolWithValidation(simpleTool, 'simple_tool');

      const result = await wrappedTool.execute(
        { value: 'test' },
        undefined,
        undefined,
        { world: mockWorld, messages: mockMessages }
      );

      expect(result).toBe('Result: test');
    });

    it('should pass tool arguments to approval request', async () => {
      const toolWithApproval = {
        name: 'dangerous_tool',
        description: 'Dangerous operation',
        approval: {
          required: true,
          message: 'Approve dangerous operation?'
        },
        execute: async (args: any) => 'executed'
      };

      const wrappedTool = wrapToolWithValidation(toolWithApproval, 'dangerous_tool');

      const result = await wrappedTool.execute(
        { target: '/important/file.txt', action: 'delete' },
        undefined,
        undefined,
        { world: mockWorld, messages: mockMessages }
      );

      expect(result.approvalRequest.toolArgs).toEqual({
        target: '/important/file.txt',
        action: 'delete'
      });
    });
  });

  describe('2. Approval Process Injects Client-Side Approval Request', () => {
    it('should generate approval request with proper structure', async () => {
      const approvalCheck = await checkToolApproval(
        mockWorld,
        'shell_cmd',
        { command: 'rm -rf /', directory: '/tmp' },
        'Shell command requires approval',
        mockMessages
      );

      expect(approvalCheck.needsApproval).toBe(true);
      expect(approvalCheck.canExecute).toBe(false);
      expect(approvalCheck.approvalRequest).toBeDefined();
      expect(approvalCheck.approvalRequest.toolName).toBe('shell_cmd');
      expect(approvalCheck.approvalRequest.message).toBe('Shell command requires approval');
      expect(approvalCheck.approvalRequest.options).toEqual(['deny', 'approve_once', 'approve_session']);
    });

    it('should include request ID for tracking', async () => {
      const approvalCheck = await checkToolApproval(
        mockWorld,
        'test_tool',
        {},
        'Test message',
        mockMessages
      );

      expect(approvalCheck.approvalRequest.requestId).toBeDefined();
      expect(approvalCheck.approvalRequest.requestId).toMatch(/^approval-/);
    });

    it('should include tool arguments in approval request', async () => {
      const toolArgs = {
        command: 'echo "test"',
        directory: '/home/user'
      };

      const approvalCheck = await checkToolApproval(
        mockWorld,
        'shell_cmd',
        toolArgs,
        'Approve shell command?',
        mockMessages
      );

      expect(approvalCheck.approvalRequest.toolArgs).toEqual(toolArgs);
    });

    it('should provide three approval options: deny, once, session', async () => {
      const approvalCheck = await checkToolApproval(
        mockWorld,
        'any_tool',
        {},
        'Test',
        mockMessages
      );

      expect(approvalCheck.approvalRequest.options).toHaveLength(3);
      expect(approvalCheck.approvalRequest.options).toContain('deny');
      expect(approvalCheck.approvalRequest.options).toContain('approve_once');
      expect(approvalCheck.approvalRequest.options).toContain('approve_session');
    });
  });

  describe('3. Message Processing Handles Client Approval Status', () => {
    describe('3a. Deny/Cancel - Block Execution and Cache Denial', () => {
      it('should block tool execution after denial', async () => {
        mockMessages = [
          {
            role: 'user',
            content: 'deny shell_cmd',
            timestamp: new Date()
          } as AgentMessage
        ];

        const approvalCheck = await checkToolApproval(
          mockWorld,
          'shell_cmd',
          {},
          'Test',
          mockMessages
        );

        expect(approvalCheck.needsApproval).toBe(false);
        expect(approvalCheck.canExecute).toBe(false);
        expect(approvalCheck.reason).toBe('Tool execution was recently denied');
      });

      it('should detect denial from message history', () => {
        mockMessages = [
          {
            role: 'user',
            content: 'I deny the shell_cmd tool',
            timestamp: new Date()
          } as AgentMessage
        ];

        const denial = findRecentDenial(mockMessages, 'shell_cmd');
        expect(denial).toBeDefined();
        expect(denial!.decision).toBe('deny');
      });

      it('should cache denial for 5 minutes', () => {
        const recentDenial: AgentMessage = {
          role: 'user',
          content: 'deny shell_cmd',
          createdAt: new Date(Date.now() - 2 * 60 * 1000) // 2 minutes ago
        } as AgentMessage;

        const oldDenial: AgentMessage = {
          role: 'user',
          content: 'deny shell_cmd',
          createdAt: new Date(Date.now() - 10 * 60 * 1000) // 10 minutes ago
        } as AgentMessage;

        expect(findRecentDenial([recentDenial], 'shell_cmd')).toBeDefined();
        expect(findRecentDenial([oldDenial], 'shell_cmd')).toBeUndefined();
      });

      it('should return error result when tool is denied', async () => {
        const tool = {
          name: 'blocked_tool',
          approval: { required: true },
          execute: async () => 'should not execute'
        };

        mockMessages = [
          {
            role: 'user',
            content: 'deny blocked_tool',
            timestamp: new Date()
          } as AgentMessage
        ];

        const wrappedTool = wrapToolWithValidation(tool, 'blocked_tool');
        const result = await wrappedTool.execute(
          {},
          undefined,
          undefined,
          { world: mockWorld, messages: mockMessages }
        );

        expect(typeof result).toBe('string');
        expect(result).toContain('Error');
        expect(result).toContain('denied');
      });
    });

    describe('3b. One-Time Approval - Execute Once, Require New Approval', () => {
      it('should allow execution with one-time approval', async () => {
        mockMessages = [
          {
            role: 'user',
            content: 'approve_once shell_cmd',
            timestamp: new Date()
          } as AgentMessage
        ];

        const approvalCheck = await checkToolApproval(
          mockWorld,
          'shell_cmd',
          {},
          'Test',
          mockMessages
        );

        expect(approvalCheck.needsApproval).toBe(false);
        expect(approvalCheck.canExecute).toBe(true);
      });

      it('should detect one-time approval from message history', () => {
        mockMessages = [
          {
            role: 'user',
            content: 'approve shell_cmd once',
            timestamp: new Date()
          } as AgentMessage
        ];

        const approval = findRecentApproval(mockMessages, 'shell_cmd');
        expect(approval).toBeDefined();
        expect(approval!.scope).toBe('once');
      });

      it('should expire one-time approval after 5 minutes', () => {
        const recentApproval: AgentMessage = {
          role: 'user',
          content: 'approve_once shell_cmd',
          createdAt: new Date(Date.now() - 2 * 60 * 1000) // 2 minutes ago
        } as AgentMessage;

        const oldApproval: AgentMessage = {
          role: 'user',
          content: 'approve_once shell_cmd',
          createdAt: new Date(Date.now() - 10 * 60 * 1000) // 10 minutes ago
        } as AgentMessage;

        expect(findRecentApproval([recentApproval], 'shell_cmd')).toBeDefined();
        expect(findRecentApproval([oldApproval], 'shell_cmd')).toBeUndefined();
      });

      it('should consume one-time approval after tool execution', () => {
        mockMessages = [
          {
            role: 'user',
            content: 'approve_once shell_cmd',
            createdAt: new Date(Date.now() - 2000)
          } as AgentMessage,
          {
            role: 'tool',
            content: 'shell_cmd executed successfully',
            createdAt: new Date()
          } as AgentMessage
        ];

        // One-time approval should be consumed by the tool execution
        const approval = findRecentApproval(mockMessages, 'shell_cmd');
        expect(approval).toBeUndefined();
      });

      it('should require new approval after one-time use', async () => {
        mockMessages = [
          {
            role: 'user',
            content: 'approve_once shell_cmd',
            createdAt: new Date(Date.now() - 2000)
          } as AgentMessage,
          {
            role: 'tool',
            content: 'tool shell_cmd executed successfully',
            createdAt: new Date(Date.now() - 1000)
          } as AgentMessage
        ];

        const approvalCheck = await checkToolApproval(
          mockWorld,
          'shell_cmd',
          {},
          'Test',
          mockMessages
        );

        expect(approvalCheck.needsApproval).toBe(true);
        expect(approvalCheck.canExecute).toBe(false);
      });
    });

    describe('3c. Session Approval - Scan Message History for Persistence', () => {
      it('should allow execution with session-wide approval', async () => {
        mockMessages = [
          {
            role: 'user',
            content: 'approve shell_cmd for session',
            timestamp: new Date()
          } as AgentMessage
        ];

        const approvalCheck = await checkToolApproval(
          mockWorld,
          'shell_cmd',
          {},
          'Test',
          mockMessages
        );

        expect(approvalCheck.needsApproval).toBe(false);
        expect(approvalCheck.canExecute).toBe(true);
      });

      it('should detect session approval from message history', () => {
        mockMessages = [
          {
            role: 'user',
            content: 'approve_session shell_cmd',
            timestamp: new Date()
          } as AgentMessage
        ];

        const approval = findSessionApproval(mockMessages, 'shell_cmd');
        expect(approval).toBeDefined();
        expect(approval!.scope).toBe('session');
      });

      it('should persist session approval across multiple tool calls', async () => {
        mockMessages = [
          {
            role: 'user',
            content: 'approve shell_cmd for session',
            timestamp: new Date(Date.now() - 10000)
          } as AgentMessage,
          {
            role: 'tool',
            content: 'First execution',
            timestamp: new Date(Date.now() - 8000)
          } as AgentMessage,
          {
            role: 'tool',
            content: 'Second execution',
            timestamp: new Date(Date.now() - 6000)
          } as AgentMessage
        ];

        // Should still be approved after multiple executions
        const approvalCheck = await checkToolApproval(
          mockWorld,
          'shell_cmd',
          {},
          'Test',
          mockMessages
        );

        expect(approvalCheck.needsApproval).toBe(false);
        expect(approvalCheck.canExecute).toBe(true);
      });

      it('should NOT expire session approval over time', async () => {
        mockMessages = [
          {
            role: 'user',
            content: 'approve_session shell_cmd',
            timestamp: new Date(Date.now() - 60 * 60 * 1000) // 1 hour ago
          } as AgentMessage
        ];

        const approval = findSessionApproval(mockMessages, 'shell_cmd');
        expect(approval).toBeDefined();
      });

      it('should scan entire message history for session approval', () => {
        mockMessages = [
          {
            role: 'user',
            content: 'approve shell_cmd for this session',
            timestamp: new Date(Date.now() - 1000000) // Very old
          } as AgentMessage,
          // Many messages in between
          ...Array(100).fill(null).map((_, i) => ({
            role: 'assistant',
            content: `Message ${i}`,
            timestamp: new Date(Date.now() - 900000 + i * 1000)
          } as AgentMessage))
        ];

        const approval = findSessionApproval(mockMessages, 'shell_cmd');
        expect(approval).toBeDefined();
      });
    });

    describe('3d. Priority Order - Session > Denial > One-Time', () => {
      it('should prefer session approval over recent denial', async () => {
        mockMessages = [
          {
            role: 'user',
            content: 'deny shell_cmd',
            timestamp: new Date(Date.now() - 3000)
          } as AgentMessage,
          {
            role: 'user',
            content: 'approve_session shell_cmd',
            timestamp: new Date(Date.now() - 1000)
          } as AgentMessage
        ];

        const approvalCheck = await checkToolApproval(
          mockWorld,
          'shell_cmd',
          {},
          'Test',
          mockMessages
        );

        expect(approvalCheck.needsApproval).toBe(false);
        expect(approvalCheck.canExecute).toBe(true);
      });

      it('should check session approval first before one-time', async () => {
        mockMessages = [
          {
            role: 'user',
            content: 'approve_session shell_cmd',
            timestamp: new Date(Date.now() - 5000)
          } as AgentMessage,
          {
            role: 'user',
            content: 'approve_once other_tool',
            timestamp: new Date(Date.now() - 1000)
          } as AgentMessage
        ];

        const approvalCheck = await checkToolApproval(
          mockWorld,
          'shell_cmd',
          {},
          'Test',
          mockMessages
        );

        expect(approvalCheck.needsApproval).toBe(false);
        expect(approvalCheck.canExecute).toBe(true);
      });

      it('should block on recent denial even with old one-time approval', async () => {
        mockMessages = [
          {
            role: 'user',
            content: 'approve_once shell_cmd',
            timestamp: new Date(Date.now() - 4000)
          } as AgentMessage,
          {
            role: 'user',
            content: 'deny shell_cmd',
            timestamp: new Date(Date.now() - 1000)
          } as AgentMessage
        ];

        const approvalCheck = await checkToolApproval(
          mockWorld,
          'shell_cmd',
          {},
          'Test',
          mockMessages
        );

        expect(approvalCheck.needsApproval).toBe(false);
        expect(approvalCheck.canExecute).toBe(false);
        expect(approvalCheck.reason).toContain('denied');
      });
    });

    describe('3e. Tool-Specific Approval Scope', () => {
      it('should isolate approvals per tool name', async () => {
        mockMessages = [
          {
            role: 'user',
            content: 'approve_session tool_a',
            timestamp: new Date()
          } as AgentMessage
        ];

        const approvalA = await checkToolApproval(mockWorld, 'tool_a', {}, 'Test', mockMessages);
        const approvalB = await checkToolApproval(mockWorld, 'tool_b', {}, 'Test', mockMessages);

        expect(approvalA.canExecute).toBe(true);
        expect(approvalB.needsApproval).toBe(true);
      });

      it('should not cross-apply approvals between tools', () => {
        mockMessages = [
          {
            role: 'user',
            content: 'approve shell_cmd for session',
            timestamp: new Date()
          } as AgentMessage
        ];

        const shellApproval = findSessionApproval(mockMessages, 'shell_cmd');
        const fileApproval = findSessionApproval(mockMessages, 'file_operation');

        expect(shellApproval).toBeDefined();
        expect(fileApproval).toBeUndefined();
      });
    });
  });

  describe('Integration - Complete Approval Flow', () => {
    it('should handle complete flow: trigger → request → approve → execute', async () => {
      const tool = {
        name: 'test_cmd',
        approval: {
          required: true,
          message: 'Approve test command?'
        },
        execute: async (args: any) => `Executed with ${args.value}`
      };

      const wrappedTool = wrapToolWithValidation(tool, 'test_cmd');

      // Step 1: First call triggers approval request
      let result = await wrappedTool.execute(
        { value: 'test' },
        undefined,
        undefined,
        { world: mockWorld, messages: mockMessages }
      );

      expect(result.type).toBe('approval_request');
      expect(result.approvalRequest.toolName).toBe('test_cmd');

      // Step 2: User approves once
      mockMessages.push({
        role: 'user',
        content: 'approve_once test_cmd',
        timestamp: new Date()
      } as AgentMessage);

      // Step 3: Second call executes
      result = await wrappedTool.execute(
        { value: 'test' },
        undefined,
        undefined,
        { world: mockWorld, messages: mockMessages }
      );

      expect(result).toBe('Executed with test');

      // Step 4: Mark tool as executed (with text that matches consumption pattern)
      mockMessages.push({
        role: 'tool',
        content: 'tool test_cmd executed successfully',
        createdAt: new Date()
      } as AgentMessage);

      // Step 5: Third call requires new approval (one-time consumed)
      result = await wrappedTool.execute(
        { value: 'test2' },
        undefined,
        undefined,
        { world: mockWorld, messages: mockMessages }
      );

      expect(result.type).toBe('approval_request');
    });

    it('should handle complete flow with session approval', async () => {
      const tool = {
        name: 'persistent_tool',
        approval: { required: true },
        execute: async () => 'executed'
      };

      const wrappedTool = wrapToolWithValidation(tool, 'persistent_tool');

      // Approve for session
      mockMessages.push({
        role: 'user',
        content: 'approve_session persistent_tool',
        timestamp: new Date()
      } as AgentMessage);

      // All subsequent calls should execute without approval
      for (let i = 0; i < 5; i++) {
        const result = await wrappedTool.execute(
          {},
          undefined,
          undefined,
          { world: mockWorld, messages: mockMessages }
        );

        expect(result).toBe('executed');
      }
    });
  });
});
